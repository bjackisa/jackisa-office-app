<?php
declare(strict_types=1);

namespace Jackisa\Lic\Service;

use Jackisa\Lic\App;
use Jackisa\Lic\Support\Crypto;

/**
 * Jackisa One — the licence hub's side of the cross-platform synergy.
 *
 * Everything here talks to jackisa.com's bridge (office_bridge.php) with the
 * shared peer secret. The hub is the single writer of entitlements: whenever a
 * licence is issued, renewed, suspended or revoked it pushes the resulting tier
 * to jackisa.com so the same person's plan unlocks benefits on both platforms.
 *
 * Direction of every call:  lic  ->  jackisa.com  (signed X-Lic-Signature)
 */
final class JackisaBridgeService
{
    /** @param array<string,mixed> $payload */
    private static function post(string $action, array $payload): array
    {
        $app = App::instance();
        $bridge = (string) $app->config(['peers', 'jackisa', 'bridge_url'], '');
        if ($bridge === '') {
            return ['ok' => false, 'error' => 'jackisa.com bridge is not configured'];
        }
        $payload['action'] = $action;
        $body = json_encode($payload);
        $ch = curl_init($bridge);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-Lic-Signature: ' . Crypto::peerSignature('jackisa', (string) $body),
                'X-Lic-Peer: lic',
            ],
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT        => 30,
        ]);
        $response = curl_exec($ch);
        $error = curl_error($ch);
        curl_close($ch);
        if ($error) {
            return ['ok' => false, 'error' => 'jackisa.com unreachable: ' . $error];
        }
        $decoded = json_decode((string) $response, true);
        if (!is_array($decoded)) {
            return ['ok' => false, 'error' => 'jackisa.com returned an unreadable response'];
        }
        return $decoded;
    }

    /** Map a licence tier to the jackisa.com plan code family. */
    public static function tierFromPlanCode(?string $planCode): string
    {
        $planCode = (string) $planCode;
        if (str_starts_with($planCode, 'platinum')) {
            return 'platinum';
        }
        if (str_starts_with($planCode, 'pro')) {
            return 'pro';
        }
        return 'basic';
    }

    /**
     * Push a tenant's current tier and benefits to jackisa.com. Best-effort: a
     * bridge outage must never fail a licence operation, so the caller logs and
     * continues.
     *
     * @return array<string,mixed>
     */
    public static function syncEntitlements(string $tenantId): array
    {
        $app = App::instance();
        $tenant = $app->one('SELECT * FROM tenants WHERE id = ?', [$tenantId]);
        if ($tenant === null) {
            return ['ok' => false, 'error' => 'Tenant not found'];
        }
        $lic = $app->one(
            "SELECT plan_code, status, expires_at FROM licenses WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1",
            [$tenantId]
        );
        $planCode = $lic['plan_code'] ?? 'basic_1m';
        $status = $lic['status'] ?? 'active';
        $tier = self::tierFromPlanCode($planCode);

        // Resolve the jackisa.com identity for the tenant owner so the bridge can
        // match the account even if the emails differ.
        $email = $tenant['email'] ?? null;
        $jackisaUserId = null;
        if ($email) {
            $u = $app->one('SELECT jackisa_user_id FROM users WHERE email = ? LIMIT 1', [$email]);
            $jackisaUserId = $u['jackisa_user_id'] ?? null;
        }

        $payload = [
            'tier'            => $tier,
            'plan_code'       => $planCode,
            'lic_tenant_id'   => $tenantId,
            'status'          => in_array($status, ['active', 'trial'], true) ? 'active' : 'inactive',
            'email'           => $email,
            'jackisa_user_id' => $jackisaUserId,
            'apply_verified'  => $tier === 'platinum',
            // Used when the plan opens a jackisa.com storefront for the tenant.
            'store_name'      => $tenant['name'] ?? null,
        ];
        $result = self::post('sync_entitlements', array_filter($payload, static fn ($v) => $v !== null));

        $app->log('info', 'jackisa: entitlement sync', [
            'tenant' => $tenantId,
            'tier'   => $tier,
            'ok'     => $result['ok'] ?? false,
        ]);
        return $result;
    }

    /** Read a user's jackisa.com capabilities. */
    public static function entitlements(string $email): array
    {
        return self::post('entitlements', ['email' => $email]);
    }

    /**
     * Turn a tenant's plan into concrete jackisa.com artifacts (storefront,
     * badge, meeting seats). Best-effort, same as the automatic sync.
     */
    public static function materializeBenefits(string $tenantId): array
    {
        $app = App::instance();
        $tenant = $app->one('SELECT * FROM tenants WHERE id = ?', [$tenantId]);
        if ($tenant === null) {
            return ['ok' => false, 'error' => 'Tenant not found'];
        }
        $email = $tenant['email'] ?? null;
        if (!$email) {
            return ['ok' => false, 'error' => 'The tenant has no owner email'];
        }
        return self::post('materialize_benefits', [
            'email'   => $email,
            'store_name' => $tenant['name'] ?? null,
        ]);
    }

    /** Ask jackisa.com whether a tenant may add another channel. */
    public static function canAddChannel(string $email): array
    {
        return self::post('entitlements', ['email' => $email]);
    }

    /**
     * Publish an office course as a jackisa.com store product.
     * @param array<string,mixed> $course
     */
    public static function publishCourse(string $email, array $course): array
    {
        return self::post('publish_course', array_merge(['email' => $email], $course));
    }

    /** Create a live meeting on jackisa.com. */
    public static function scheduleMeeting(string $email, array $meeting): array
    {
        return self::post('schedule_meeting', array_merge(['email' => $email], $meeting));
    }

    /** Grant a team member a channel seat. */
    public static function syncMemberChannel(string $email, string $memberEmail, string $memberName = ''): array
    {
        return self::post('sync_member_channel', [
            'email'        => $email,
            'member_email' => $memberEmail,
            'member_name'  => $memberName,
        ]);
    }

    /** Pull store earnings earned on jackisa.com for a tenant. */
    public static function pullStoreEarnings(string $email, int $limit = 200): array
    {
        return self::post('pull_store_earnings', ['email' => $email, 'limit' => $limit]);
    }

    /** Mirror a verification badge onto jackisa.com. */
    public static function applyVerification(string $email, string $badge, bool $verified): array
    {
        return self::post('apply_verification', [
            'email'    => $email,
            'badge'    => $badge,
            'verified' => $verified,
        ]);
    }
}
