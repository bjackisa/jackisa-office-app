<?php
declare(strict_types=1);

namespace Jackisa\Lic\Service;

use Jackisa\Lic\App;
use Jackisa\Lic\Support\Crypto;
use Jackisa\Lic\Support\Ids;

/**
 * The licensing engine.
 *
 * A licence is SSL-certificate shaped: it carries a serial, a validity window,
 * a plan/cap payload and an HMAC signature the app can verify offline. The app
 * re-validates twice a day against this service, which is the authority on
 * whether the tenant is inside its caps and whether the licence is still live.
 */
final class LicenseService
{
    public const TIER_RANK = ['basic' => 1, 'pro' => 2, 'platinum' => 3, 'enterprise' => 4];

    /** Interval choices the UI offers, in months, up to 3 years upfront. */
    public const INTERVALS = [1, 3, 6, 12, 24, 36];

    /**
     * Issue (or re-issue) a licence for a tenant for a chosen plan/interval.
     *
     * @return array<string,mixed>
     */
    public static function issue(string $tenantId, string $planCode, array $opts = []): array
    {
        $app = App::instance();
        $plan = $app->one('SELECT * FROM plans WHERE code = ? AND is_active = 1', [$planCode]);
        if ($plan === null) {
            throw new \InvalidArgumentException('Unknown plan: ' . $planCode);
        }

        $interval = (int) ($opts['interval_months'] ?? $plan['interval_months']);
        if (!in_array($interval, self::INTERVALS, true)) {
            $interval = (int) $plan['interval_months'];
        }

        $now = new \DateTimeImmutable('now');
        $status = $opts['status'] ?? 'active';
        $startsAt = $opts['starts_at'] ?? $now;
        $expiresAt = $opts['expires_at'] ?? $startsAt->modify('+' . $interval . ' months');

        $serial = Ids::serial();
        $licenseKey = Ids::licenseKey();
        $id = Ids::uuid();

        $features = self::decodeFeatures($plan['features']);

        $app->run(
            'INSERT INTO licenses
              (id, tenant_id, serial, license_key, plan_code, tier, status, interval_months,
               max_employees, max_students, storage_gb, features, issued_at, starts_at, expires_at,
               grace_until, activated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                $id, $tenantId, $serial, $licenseKey, $planCode, $plan['tier'], $status, $interval,
                (int) $plan['max_employees'], (int) $plan['max_students'], (int) $plan['storage_gb'],
                json_encode($features, JSON_UNESCAPED_SLASHES),
                $now->format('Y-m-d H:i:s'), $startsAt->format('Y-m-d H:i:s'), $expiresAt->format('Y-m-d H:i:s'),
                $expiresAt->modify('+' . self::graceDays() . ' days')->format('Y-m-d H:i:s'),
                $opts['activated'] ?? null,
            ]
        );

        // Re-issuing supersedes any prior licence for the tenant.
        $app->run(
            "UPDATE licenses SET status = 'expired', updated_at = NOW()
             WHERE tenant_id = ? AND id <> ? AND status IN ('trial','active','grace')",
            [$tenantId, $id]
        );

        self::audit('license.issued', 'license', $id, [
            'tenant_id' => $tenantId, 'plan' => $planCode, 'interval' => $interval,
        ]);

        return self::certify($id);
    }

    /** Build and store the signed certificate for a licence row. */
    public static function certify(string $licenseId): array
    {
        $app = App::instance();
        $lic = $app->one('SELECT * FROM licenses WHERE id = ?', [$licenseId]);
        if ($lic === null) {
            throw new \InvalidArgumentException('Unknown licence: ' . $licenseId);
        }

        $tenant = $app->one('SELECT * FROM tenants WHERE id = ?', [$lic['tenant_id']]);

        $body = [
            'serial'          => $lic['serial'],
            'license_key'     => $lic['license_key'],
            'tenant_id'       => $lic['tenant_id'],
            'tenant_name'     => $tenant['name'] ?? null,
            'plan_code'       => $lic['plan_code'],
            'tier'            => $lic['tier'],
            'status'          => $lic['status'],
            'interval_months' => (int) $lic['interval_months'],
            'caps'            => [
                'max_employees' => (int) $lic['max_employees'],
                'max_students'  => (int) $lic['max_students'],
                'storage_gb'    => (int) $lic['storage_gb'],
            ],
            'features'        => self::decodeFeatures($lic['features']),
            'issued_at'       => $lic['issued_at'],
            'starts_at'       => $lic['starts_at'],
            'expires_at'      => $lic['expires_at'],
            'grace_until'     => $lic['grace_until'],
            'issuer'          => 'Jackisa License Authority',
            'algorithm'       => 'HS256',
        ];

        $canonical = Crypto::canonicalJson($body);
        $signature = Crypto::sign($canonical);
        $fingerprint = hash('sha256', $lic['serial'] . '|' . $lic['license_key']);

        $certificate = [
            'payload'     => $body,
            'signature'   => $signature,
            'fingerprint' => $fingerprint,
        ];
        $encoded = base64_encode(json_encode($certificate, JSON_UNESCAPED_SLASHES));

        $app->run(
            'UPDATE licenses SET certificate = ?, fingerprint = ?, updated_at = NOW() WHERE id = ?',
            [$encoded, $fingerprint, $licenseId]
        );

        return $certificate;
    }

    /**
     * Validate a licence for the app heartbeat.
     *
     * @return array<string,mixed> decision payload
     */
    public static function validate(string $licenseKey, array $usage = [], string $ip = ''): array
    {
        $app = App::instance();
        $lic = $app->one('SELECT * FROM licenses WHERE license_key = ?', [$licenseKey]);

        if ($lic === null) {
            return [
                'valid'    => false,
                'status'   => 'unknown',
                'reason'   => 'licence_not_found',
                'message'  => 'This licence key is not recognised.',
                'within_caps' => false,
            ];
        }

        $now = new \DateTimeImmutable('now');
        $expiresAt = new \DateTimeImmutable($lic['expires_at']);
        $graceUntil = $lic['grace_until'] ? new \DateTimeImmutable($lic['grace_until']) : $expiresAt;

        $status = $lic['status'];
        $reason = null;
        $valid = true;

        if (in_array($status, ['revoked', 'suspended'], true)) {
            $valid = false;
            $reason = $status;
        } elseif ($now >= $graceUntil) {
            $status = 'expired';
            $valid = false;
            $reason = 'expired';
        } elseif ($now >= $expiresAt) {
            $status = 'grace';
            $valid = true; // still allowed inside the grace window
            $reason = 'in_grace';
        }

        // Cap enforcement — the app "caps off" when a limit is exceeded.
        $caps = [
            'max_employees' => (int) $lic['max_employees'],
            'max_students'  => (int) $lic['max_students'],
            'storage_gb'    => (int) $lic['storage_gb'],
        ];
        $capState = self::evaluateCaps($caps, $usage);

        $features = self::decodeFeatures($lic['features']);

        $payload = [
            'valid'        => $valid,
            'status'       => $status,
            'reason'       => $reason,
            'within_caps'  => $capState['within_caps'],
            'caps'         => $caps,
            'usage'        => $usage,
            'cap_details'  => $capState['details'],
            'features'     => $features,
            'tier'         => $lic['tier'],
            'plan_code'    => $lic['plan_code'],
            'interval_months' => (int) $lic['interval_months'],
            'serial'       => $lic['serial'],
            'tenant_id'    => $lic['tenant_id'],
            'expires_at'   => $lic['expires_at'],
            'grace_until'  => $lic['grace_until'],
            'days_remaining' => max(0, (int) $now->diff($expiresAt)->format('%r%a')),
            'server_time'  => $now->format('c'),
            'next_check_seconds' => 43200, // twice a day
        ];

        $app->run(
            'UPDATE licenses SET last_validated_at = NOW(), last_seen_ip = ? WHERE id = ?',
            [substr($ip, 0, 64), $lic['id']]
        );

        return $payload;
    }

    /**
     * @param array<string,int> $caps
     * @param array<string,int> $usage
     * @return array{within_caps:bool,details:array<string,mixed>}
     */
    private static function evaluateCaps(array $caps, array $usage): array
    {
        $details = [];
        $within = true;
        foreach (['max_employees', 'max_students', 'storage_gb'] as $limit) {
            if (!array_key_exists($limit, $usage)) {
                continue;
            }
            $used = (int) $usage[$limit];
            $cap = (int) $caps[$limit];
            $exceeded = $cap > 0 && $used > $cap;
            $details[$limit] = [
                'used'     => $used,
                'limit'    => $cap,
                'exceeded' => $exceeded,
                'unlimited' => $cap === 0,
            ];
            if ($exceeded) {
                $within = false;
            }
        }
        return ['within_caps' => $within, 'details' => $details];
    }

    public static function revoke(string $licenseKey, string $reason): bool
    {
        $app = App::instance();
        $lic = $app->one('SELECT * FROM licenses WHERE license_key = ?', [$licenseKey]);
        if ($lic === null) {
            return false;
        }
        $app->run(
            "UPDATE licenses SET status = 'revoked', revoke_reason = ?, updated_at = NOW() WHERE id = ?",
            [substr($reason, 0, 255), $lic['id']]
        );
        self::audit('license.revoked', 'license', $lic['id'], ['reason' => $reason]);
        return true;
    }

    public static function suspend(string $licenseKey, string $reason): bool
    {
        $app = App::instance();
        $lic = $app->one('SELECT * FROM licenses WHERE license_key = ?', [$licenseKey]);
        if ($lic === null) {
            return false;
        }
        $app->run(
            "UPDATE licenses SET status = 'suspended', revoke_reason = ?, updated_at = NOW() WHERE id = ?",
            [substr($reason, 0, 255), $lic['id']]
        );
        self::audit('license.suspended', 'license', $lic['id'], ['reason' => $reason]);
        return true;
    }

    /**
     * Extend a licence after a successful payment (renewal or upgrade).
     * Stacking from the current expiry means paying early never loses time.
     */
    public static function extend(string $licenseId, int $months, ?string $planCode = null): array
    {
        $app = App::instance();
        $lic = $app->one('SELECT * FROM licenses WHERE id = ?', [$licenseId]);
        if ($lic === null) {
            throw new \InvalidArgumentException('Unknown licence');
        }

        $base = new \DateTimeImmutable(max($lic['expires_at'], date('Y-m-d H:i:s')));
        $newExpiry = $base->modify('+' . $months . ' months');

        $plan = $planCode ? $app->one('SELECT * FROM plans WHERE code = ?', [$planCode]) : null;

        $sets = 'status = ?, expires_at = ?, grace_until = ?, interval_months = ?, updated_at = NOW()';
        $params = [
            'active',
            $newExpiry->format('Y-m-d H:i:s'),
            $newExpiry->modify('+' . self::graceDays() . ' days')->format('Y-m-d H:i:s'),
            $months,
        ];
        if ($plan) {
            $sets .= ', plan_code = ?, tier = ?, max_employees = ?, max_students = ?, storage_gb = ?, features = ?';
            array_push($params,
                $plan['code'], $plan['tier'], (int) $plan['max_employees'],
                (int) $plan['max_students'], (int) $plan['storage_gb'],
                json_encode(self::decodeFeatures($plan['features']))
            );
        }
        $params[] = $licenseId;
        $app->run('UPDATE licenses SET ' . $sets . ' WHERE id = ?', $params);

        self::audit('license.extended', 'license', $licenseId, ['months' => $months, 'plan' => $planCode]);
        return self::certify($licenseId);
    }

    /**
     * Start a free trial for a genuinely new signup.
     * A fingerprint (ip+device) that already has a trial gets none.
     *
     * @return array<string,mixed>
     */
    public static function startTrial(string $tenantId, string $fingerprint, array $opts = []): array
    {
        $app = App::instance();
        $ip = $opts['ip'] ?? null;

        // A trial is for a genuinely new device/network. Deny when the device
        // fingerprint has been seen before, or when the same public IP already
        // consumed a trial — otherwise a fresh account on a known device/IP
        // would keep harvesting trials.
        $existing = $app->one(
            "SELECT * FROM trials
             WHERE fingerprint = ?
               AND status IN ('active','reminded','converted','expired') LIMIT 1",
            [$fingerprint]
        );
        if ($existing !== null) {
            return ['granted' => false, 'reason' => 'fingerprint_seen', 'trial' => $existing];
        }

        if ($ip !== null && $ip !== '' && $ip !== '0.0.0.0') {
            $byIp = $app->one(
                "SELECT * FROM trials
                 WHERE ip_address = ?
                   AND status IN ('active','reminded','converted','expired') LIMIT 1",
                [$ip]
            );
            if ($byIp !== null) {
                return ['granted' => false, 'reason' => 'ip_seen', 'trial' => $byIp];
            }
        }

        $days = (int) ($opts['days'] ?? self::trialDays());
        $start = new \DateTimeImmutable('now');
        $end = $start->modify('+' . $days . ' days');
        $id = Ids::uuid();

        // Remember the plan the visitor chose so the post-trial charge matches
        // it. Default to the tier's monthly plan when none was supplied.
        $planCode = (string) ($opts['plan_code'] ?? '');
        $plan = $planCode !== ''
            ? $app->one('SELECT * FROM plans WHERE code = ? AND is_active = 1', [$planCode])
            : null;
        if ($plan === null) {
            $planCode = 'pro_1m';
            $plan = $app->one('SELECT * FROM plans WHERE code = ? AND is_active = 1', [$planCode]);
        }
        $interval = $plan ? (int) $plan['interval_months'] : 1;

        $app->run(
            'INSERT INTO trials (id, tenant_id, user_id, fingerprint, ip_address, msisdn, plan_code, interval_months, started_at, ends_at, status)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            [
                $id, $tenantId, $opts['user_id'] ?? null, $fingerprint,
                $opts['ip'] ?? null, $opts['msisdn'] ?? null, $planCode, $interval,
                $start->format('Y-m-d H:i:s'), $end->format('Y-m-d H:i:s'), 'active',
            ]
        );

        // A trial is itself a licence, so the app uses one code path.
        $license = self::issue($tenantId, $planCode, [
            'status'     => 'trial',
            'starts_at'  => $start,
            'expires_at' => $end,
        ]);

        self::audit('trial.started', 'tenant', $tenantId, ['days' => $days, 'fingerprint' => $fingerprint, 'plan' => $planCode]);

        return ['granted' => true, 'trial_id' => $id, 'ends_at' => $end->format('c'), 'license' => $license];
    }

    /**
     * Quote a plan change (upgrade, downgrade, or interval switch) for a tenant.
     *
     * The unused value of the current paid period is credited against the new
     * plan, so a customer who moves mid-cycle is never charged twice. The quote
     * is what the app shows before it charges the difference through JPesa.
     *
     * @return array<string,mixed>
     */
    public static function changeQuote(string $tenantId, string $newPlanCode): array
    {
        $app = App::instance();
        $newPlan = $app->one('SELECT * FROM plans WHERE code = ? AND is_active = 1', [$newPlanCode]);
        if ($newPlan === null) {
            throw new \InvalidArgumentException('Unknown plan: ' . $newPlanCode);
        }
        $lic = $app->one(
            'SELECT * FROM licenses WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1',
            [$tenantId]
        );

        $now = new \DateTimeImmutable('now');
        $credit = 0.0;
        $current = null;
        if ($lic !== null && in_array($lic['status'], ['trial', 'active', 'grace'], true)) {
            $start = new \DateTimeImmutable((string) $lic['starts_at']);
            $end = new \DateTimeImmutable((string) $lic['expires_at']);
            $span = max(1, $end->getTimestamp() - $start->getTimestamp());
            $left = max(0, $end->getTimestamp() - $now->getTimestamp());
            $plan = $app->one('SELECT price FROM plans WHERE code = ?', [$lic['plan_code']]);
            $price = (float) ($plan['price'] ?? 0);
            // Trial time has no cash value, so a trial converts with no credit.
            $credit = $lic['status'] === 'trial' ? 0.0 : round($price * ($left / $span), 2);
            $current = [
                'plan_code' => $lic['plan_code'],
                'tier'      => $lic['tier'],
                'status'    => $lic['status'],
                'expires_at' => $lic['expires_at'],
            ];
        }

        $price = (float) $newPlan['price'];
        $amountDue = max(0.0, round($price - $credit, 2));
        $direction = 'change';
        if ($current !== null) {
            $from = self::TIER_RANK[$current['tier']] ?? 0;
            $to = self::TIER_RANK[$newPlan['tier']] ?? 0;
            $direction = $to > $from ? 'upgrade' : ($to < $from ? 'downgrade' : 'interval');
        }

        return [
            'tenant_id'      => $tenantId,
            'current'        => $current,
            'plan_code'      => $newPlanCode,
            'plan_name'      => $newPlan['name'],
            'tier'           => $newPlan['tier'],
            'interval_months' => (int) $newPlan['interval_months'],
            'price'          => number_format($price, 2, '.', ''),
            'credit'         => number_format($credit, 2, '.', ''),
            'amount_due'     => number_format($amountDue, 2, '.', ''),
            'currency'       => $newPlan['currency'],
            'direction'      => $direction,
            'requires_payment' => $amountDue > 0.0,
        ];
    }

    /**
     * Apply a plan change. Call this after any required payment has settled (or
     * straight away for a downgrade/interval switch fully covered by credit).
     *
     * @return array<string,mixed> the new certificate
     */
    public static function changePlan(string $tenantId, string $newPlanCode, array $opts = []): array
    {
        $app = App::instance();
        $quote = self::changeQuote($tenantId, $newPlanCode);
        if ($quote['requires_payment'] && empty($opts['paid'])) {
            throw new \InvalidArgumentException('This change needs a payment of ' . $quote['amount_due'] . ' ' . $quote['currency'] . ' first.');
        }

        $lic = $app->one('SELECT * FROM licenses WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1', [$tenantId]);
        $interval = (int) $quote['interval_months'];

        if ($lic === null) {
            // Nothing to change from: just issue.
            return self::issue($tenantId, $newPlanCode, ['status' => 'active']);
        }

        // A change restarts the paid period from now for the new plan's interval.
        $now = new \DateTimeImmutable('now');
        $expires = $now->modify('+' . $interval . ' months');
        $plan = $app->one('SELECT * FROM plans WHERE code = ?', [$newPlanCode]);

        $app->run(
            "UPDATE licenses SET plan_code = ?, tier = ?, status = 'active', interval_months = ?,
                max_employees = ?, max_students = ?, storage_gb = ?, features = ?,
                starts_at = ?, expires_at = ?, grace_until = ?,
                activated_at = COALESCE(activated_at, NOW()), updated_at = NOW()
             WHERE id = ?",
            [
                $newPlanCode, $plan['tier'], $interval,
                (int) $plan['max_employees'], (int) $plan['max_students'], (int) $plan['storage_gb'],
                json_encode(self::decodeFeatures($plan['features']), JSON_UNESCAPED_SLASHES),
                $now->format('Y-m-d H:i:s'), $expires->format('Y-m-d H:i:s'),
                $expires->modify('+' . self::graceDays() . ' days')->format('Y-m-d H:i:s'),
                $lic['id'],
            ]
        );

        // Keep the subscription row in step with the new plan/period.
        $sub = $app->one('SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1', [$tenantId]);
        if ($sub !== null) {
            $app->run(
                "UPDATE subscriptions SET plan_code = ?, tier = ?, interval_months = ?, amount = ?, currency = ?,
                    status = 'active', current_period_start = NOW(), current_period_end = ?, updated_at = NOW()
                 WHERE id = ?",
                [$newPlanCode, $plan['tier'], $interval, (float) $plan['price'], $plan['currency'],
                 $expires->format('Y-m-d H:i:s'), $sub['id']]
            );
        } else {
            $app->run(
                'INSERT INTO subscriptions (id, tenant_id, license_id, plan_code, tier, interval_months, status, amount, currency, current_period_start, current_period_end)
                 VALUES (?,?,?,?,?,?,?,?,?,NOW(),?)',
                [Ids::uuid(), $tenantId, $lic['id'], $newPlanCode, $plan['tier'], $interval, 'active',
                 (float) $plan['price'], $plan['currency'], $expires->format('Y-m-d H:i:s')]
            );
        }

        self::audit('license.changed', 'license', $lic['id'], [
            'tenant_id' => $tenantId, 'from' => $quote['current']['plan_code'] ?? null,
            'to' => $newPlanCode, 'credit' => $quote['credit'], 'direction' => $quote['direction'],
        ]);

        return self::certify($lic['id']);
    }

    public static function decodeFeatures(mixed $features): array
    {
        if (is_array($features)) {
            return $features;
        }
        if (is_string($features) && $features !== '') {
            $decoded = json_decode($features, true);
            return is_array($decoded) ? $decoded : [];
        }
        return [];
    }

    public static function graceDays(): int
    {
        return (int) App::instance()->config('license.grace_days', 5);
    }

    public static function trialDays(): int
    {
        return (int) App::instance()->config('license.trial_days', 7);
    }

    private static function audit(string $action, string $entityType, ?string $entityId, array $details = []): void
    {
        try {
            App::instance()->run(
                'INSERT INTO audit_log (actor_type, action, entity_type, entity_id, details)
                 VALUES (?,?,?,?,?)',
                ['system', $action, $entityType, $entityId, json_encode($details, JSON_UNESCAPED_SLASHES)]
            );
        } catch (\Throwable $e) {
            // Audit must never break the operation it records.
        }
    }
}
