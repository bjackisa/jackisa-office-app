<?php
declare(strict_types=1);

namespace Jackisa\Lic\Controller;

use Jackisa\Lic\App;
use Jackisa\Lic\Http\Request;
use Jackisa\Lic\Http\Response;
use Jackisa\Lic\Middleware\Auth;
use Jackisa\Lic\Service\TenantService;

/**
 * /api/v1/sync — two-way, idempotent synchronisation.
 *
 * The office app pushes its users/tenants/members here and pulls licence +
 * subscription state back. Every write is logged to sync_log so a replayed
 * batch is a no-op.
 */
final class SyncController
{
    /** POST /api/v1/sync/push */
    public static function push(Request $request): void
    {
        Auth::requirePeer($request);
        $peer = (string) ($request->header('X-Lic-Peer') ?: 'office');
        $entities = $request->input('entities', []);
        if (!is_array($entities)) {
            Response::error('422', 'entities must be an array', 422);
        }

        $applied = 0;
        $skipped = 0;
        $errors = [];

        foreach ($entities as $entity) {
            if (!is_array($entity)) {
                continue;
            }
            $type = (string) ($entity['type'] ?? '');
            $payload = $entity['data'] ?? [];
            if (!is_array($payload)) {
                continue;
            }
            try {
                switch ($type) {
                    case 'tenant':
                        TenantService::upsertTenant($payload);
                        break;
                    case 'user':
                        TenantService::upsertUser($payload);
                        break;
                    case 'member':
                        TenantService::addMember(
                            (string) $payload['tenant_id'],
                            (string) $payload['user_id'],
                            (string) ($payload['role'] ?? 'employee'),
                            (string) ($payload['status'] ?? 'active'),
                            (bool) ($payload['is_owner'] ?? false)
                        );
                        break;
                    case 'kyc_verified_user':
                        TenantService::markIndividualVerified((string) $payload['user_id'], $payload);
                        break;
                    case 'kyc_verified_tenant':
                        TenantService::markCompanyVerified((string) $payload['tenant_id'], $payload);
                        break;
                    case 'subscription':
                        self::applySubscription($payload);
                        break;
                    default:
                        $skipped++;
                        self::logSync('in', $peer, $type, null, 'skipped', 'unknown entity');
                        continue 2;
                }
                $applied++;
                self::logSync('in', $peer, $type, $payload['id'] ?? ($payload['user_id'] ?? null), 'ok', null);
            } catch (\Throwable $e) {
                $errors[] = ['type' => $type, 'error' => $e->getMessage()];
                self::logSync('in', $peer, $type, null, 'error', $e->getMessage());
            }
        }

        Response::ok(['applied' => $applied, 'skipped' => $skipped, 'errors' => $errors]);
    }

    /** POST /api/v1/sync/pull — entities changed since `since` (ISO time). */
    public static function pull(Request $request): void
    {
        Auth::requirePeer($request);
        $since = $request->string('since', '1970-01-01 00:00:00');
        $since = date('Y-m-d H:i:s', strtotime($since) ?: 0);
        $app = App::instance();

        $tenants = $app->all('SELECT * FROM tenants WHERE updated_at >= ? LIMIT 500', [$since]);
        $users = $app->all('SELECT * FROM users WHERE updated_at >= ? LIMIT 500', [$since]);
        $members = $app->all('SELECT * FROM tenant_members WHERE updated_at >= ? LIMIT 1000', [$since]);
        $licenses = $app->all('SELECT id, tenant_id, serial, license_key, plan_code, tier, status, interval_months, max_employees, max_students, storage_gb, features, starts_at, expires_at, grace_until FROM licenses WHERE updated_at >= ? LIMIT 500', [$since]);
        $subscriptions = $app->all('SELECT * FROM subscriptions WHERE updated_at >= ? LIMIT 500', [$since]);
        $payments = $app->all('SELECT id, tenant_id, purpose, amount, charged_amount, currency, plan_code, interval_months, status, fulfilled, completed_at, created_at FROM payments WHERE updated_at >= ? LIMIT 500', [$since]);

        Response::ok([
            'server_time'   => date('c'),
            'since'         => $since,
            'tenants'       => $tenants,
            'users'         => $users,
            'members'       => $members,
            'licenses'      => $licenses,
            'subscriptions' => $subscriptions,
            'payments'      => $payments,
        ]);
    }

    /** GET /api/v1/sync/health */
    public static function health(Request $request): void
    {
        $app = App::instance();
        $counts = [];
        foreach (['tenants', 'users', 'licenses', 'subscriptions', 'payments'] as $table) {
            $counts[$table] = (int) ($app->one("SELECT COUNT(*) AS c FROM $table")['c'] ?? 0);
        }
        Response::ok(['ok' => true, 'server_time' => date('c'), 'counts' => $counts]);
    }

    /** @param array<string,mixed> $payload */
    private static function applySubscription(array $payload): void
    {
        $app = App::instance();
        if (empty($payload['id']) || empty($payload['tenant_id'])) {
            throw new \InvalidArgumentException('subscription needs id and tenant_id');
        }
        $app->run(
            'INSERT INTO subscriptions (id, tenant_id, license_id, plan_code, tier, interval_months, status, amount, currency, current_period_start, current_period_end, cancel_at_period_end)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE status = VALUES(status), amount = VALUES(amount),
               current_period_end = VALUES(current_period_end), cancel_at_period_end = VALUES(cancel_at_period_end), updated_at = NOW()',
            [
                $payload['id'], $payload['tenant_id'], $payload['license_id'] ?? null,
                $payload['plan_code'] ?? 'basic_1m', $payload['tier'] ?? 'basic',
                (int) ($payload['interval_months'] ?? 1), $payload['status'] ?? 'active',
                (float) ($payload['amount'] ?? 0), $payload['currency'] ?? 'UGX',
                $payload['current_period_start'] ?? date('Y-m-d H:i:s'),
                $payload['current_period_end'] ?? date('Y-m-d H:i:s', strtotime('+1 month')),
                (int) ($payload['cancel_at_period_end'] ?? 0),
            ]
        );
    }

    private static function logSync(string $direction, string $peer, string $type, ?string $entityId, string $status, ?string $message): void
    {
        try {
            App::instance()->run(
                'INSERT INTO sync_log (direction, peer, entity_type, entity_id, status, message) VALUES (?,?,?,?,?,?)',
                [$direction, $peer === 'jackisa' ? 'jackisa' : 'office', $type, $entityId, $status, $message]
            );
        } catch (\Throwable $e) {
            // ignore
        }
    }
}
