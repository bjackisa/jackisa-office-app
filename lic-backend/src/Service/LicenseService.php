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
