<?php
declare(strict_types=1);

namespace Jackisa\Lic\Service;

use Jackisa\Lic\App;
use Jackisa\Lic\Support\Crypto;
use Jackisa\Lic\Support\Ids;

/**
 * Scheduled work that a serverless app could never do.
 *
 * Each job is idempotent and records a cron_runs row. Run from bin/cron.php
 * on a schedule (see the crontab snippet printed by `bin/cron.php help`).
 */
final class CronService
{
    /** @return array<string,callable> */
    public static function jobs(): array
    {
        return [
            'licenses.expire'      => [self::class, 'expireLicenses'],
            'trials.remind'        => [self::class, 'remindTrials'],
            'trials.expire'        => [self::class, 'expireTrials'],
            'payments.reconcile'   => [self::class, 'reconcilePayments'],
            'sync.pull'            => [self::class, 'syncPeers'],
            'tax.snapshot'         => [self::class, 'taxSnapshots'],
            'fund.snapshot'        => [self::class, 'fundSnapshots'],
            'fund.daily'           => [self::class, 'runFundDaily'],
            'reminders.renewals'   => [self::class, 'renewalReminders'],
        ];
    }

    public static function run(string $job): array
    {
        $jobs = self::jobs();
        if (!isset($jobs[$job])) {
            throw new \InvalidArgumentException('Unknown job: ' . $job);
        }
        $app = App::instance();
        $app->run('INSERT INTO cron_runs (job, status) VALUES (?, ?)', [$job, 'running']);
        $runId = (int) $app->pdo()->lastInsertId();

        try {
            $summary = ($jobs[$job])();
            $app->run('UPDATE cron_runs SET status = ?, finished_at = NOW(), summary = ? WHERE id = ?',
                ['ok', json_encode($summary), $runId]);
            return $summary;
        } catch (\Throwable $e) {
            $app->run('UPDATE cron_runs SET status = ?, finished_at = NOW(), summary = ? WHERE id = ?',
                ['error', json_encode(['error' => $e->getMessage()]), $runId]);
            throw $e;
        }
    }

    // -- Licences: move expired licences past their grace window -------------

    public static function expireLicenses(): array
    {
        $app = App::instance();
        $app->run("UPDATE licenses SET status = 'grace', updated_at = NOW()
                   WHERE status IN ('active','trial') AND expires_at < NOW() AND grace_until >= NOW()");
        $app->run("UPDATE licenses SET status = 'expired', updated_at = NOW()
                   WHERE status IN ('active','trial','grace') AND grace_until < NOW()");
        $expired = (int) ($app->one("SELECT COUNT(*) AS c FROM licenses WHERE status = 'expired'")['c'] ?? 0);
        return ['expired_total' => $expired];
    }

    // -- Trials: remind 2 days early, then expire ----------------------------

    public static function remindTrials(): array
    {
        $app = App::instance();
        $reminderDays = (int) $app->config('license.trial_reminder_days', 2);
        $rows = $app->all(
            "SELECT t.*, u.email, u.full_name, u.phone, ten.name AS tenant_name
             FROM trials t
             JOIN tenants ten ON ten.id = t.tenant_id
             LEFT JOIN users u ON u.id = t.user_id
             WHERE t.status = 'active' AND t.reminder_sent_at IS NULL
               AND t.ends_at <= DATE_ADD(NOW(), INTERVAL ? DAY)",
            [$reminderDays]
        );
        $sent = 0;
        foreach ($rows as $trial) {
            $ends = date('d/m/Y', strtotime((string) $trial['ends_at']));
            $name = $trial['full_name'] ?: 'there';
            if (!empty($trial['email'])) {
                MailService::send(
                    [$trial['email']],
                    'Your Jackisa Office trial ends in 2 days',
                    '<p>Hello ' . htmlspecialchars($name) . ',</p>'
                    . '<p>Your free trial of <strong>' . htmlspecialchars((string) $trial['tenant_name']) . '</strong> ends on <strong>' . $ends . '</strong>.</p>'
                    . '<p>Add a payment number to keep your workspace active — we will charge it automatically when the trial ends. You can cancel any time.</p>'
                    . '<p><a href="https://office.jackisa.com/app/settings/billing" style="background:#0d5ba3;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Review billing</a></p>',
                    [], ['template' => 'trial_reminder']
                );
            }
            if (!empty($trial['phone'])) {
                WhatsAppService::send($trial['phone'],
                    "Hello $name, your Jackisa Office free trial for " . $trial['tenant_name'] . " ends on $ends. Add a payment number to keep going — reply STOP to cancel.",
                    ['template' => 'trial_reminder']);
            }
            $app->run("UPDATE trials SET reminder_sent_at = NOW(), status = 'reminded' WHERE id = ?", [$trial['id']]);
            $sent++;
        }
        return ['reminded' => $sent];
    }

    public static function expireTrials(): array
    {
        $app = App::instance();
        $rows = $app->all(
            "SELECT * FROM trials WHERE status IN ('active','reminded') AND ends_at < NOW()"
        );
        $expired = 0;
        foreach ($rows as $trial) {
            $app->run("UPDATE trials SET status = 'expired' WHERE id = ?", [$trial['id']]);
            // If a payment number is on file, attempt the first real charge for
            // the plan the visitor chose when they started the trial.
            if (!empty($trial['msisdn']) && !empty($trial['tenant_id'])) {
                try {
                    $planCode = (string) ($trial['plan_code'] ?? '') ?: 'pro_1m';
                    $plan = $app->one('SELECT * FROM plans WHERE code = ? AND is_active = 1', [$planCode]);
                    if ($plan === null) {
                        $planCode = 'pro_1m';
                        $plan = $app->one('SELECT * FROM plans WHERE code = ? AND is_active = 1', [$planCode]);
                    }
                    PaymentService::initiate([
                        'tenant_id'       => $trial['tenant_id'],
                        'user_id'         => $trial['user_id'],
                        'purpose'         => 'license',
                        'amount'          => (float) ($plan['price'] ?? 75000),
                        'msisdn'          => $trial['msisdn'],
                        'interval_months' => (int) ($trial['interval_months'] ?? ($plan['interval_months'] ?? 1)),
                        'plan_code'       => $planCode,
                        'description'     => 'Jackisa Office licence (trial conversion)',
                    ]);
                } catch (\Throwable $e) {
                    $app->log('warn', 'trial conversion charge failed', ['trial' => $trial['id'], 'error' => $e->getMessage()]);
                }
            }
            $expired++;
        }
        return ['expired' => $expired];
    }

    // -- Payments: reconcile pending charges with the provider --------------

    public static function reconcilePayments(): array
    {
        $app = App::instance();
        $rows = $app->all(
            "SELECT * FROM payments WHERE status IN ('pending','processing')
             AND created_at > DATE_SUB(NOW(), INTERVAL 2 DAY) ORDER BY id LIMIT 200"
        );
        $paid = 0; $failed = 0;
        foreach ($rows as $payment) {
            $before = $payment['status'];
            $after = PaymentService::reconcile($payment);
            if ($after['status'] === 'paid' && $before !== 'paid') { $paid++; }
            if (in_array($after['status'], ['failed', 'expired'], true) && $before !== $after['status']) { $failed++; }
        }
        return ['checked' => count($rows), 'paid' => $paid, 'failed' => $failed];
    }

    // -- Sync: pull peer changes into the central store ---------------------

    public static function syncPeers(): array
    {
        $app = App::instance();
        $since = date('Y-m-d H:i:s', time() - 3 * 86400);
        $out = [];

        // jackisa.com: pull the user directory (idempotent upserts).
        $jackisa = self::peerPost('jackisa', '/office_bridge.php', ['action' => 'pull', 'since' => $since, 'limit' => 500]);
        if ($jackisa !== null) {
            $applied = 0;
            foreach (($jackisa['users'] ?? []) as $user) {
                try {
                    TenantService::upsertUser([
                        'email'         => $user['email'] ?? '',
                        'full_name'     => $user['name'] ?? ($user['username'] ?? ''),
                        'phone'         => $user['phone'] ?? null,
                        'avatar_url'    => $user['avatar'] ?? null,
                        'jackisa_user_id' => (string) ($user['id'] ?? ''),
                        'kyc_status'    => !empty($user['verified']) ? 'verified' : 'unverified',
                        'kyc_level'     => !empty($user['verified']) ? 'individual' : 'none',
                    ]);
                    $applied++;
                } catch (\Throwable $e) {
                    $app->log('warn', 'sync: jackisa user upsert failed', ['error' => $e->getMessage()]);
                }
            }
            $out['jackisa'] = ['users' => $applied];
        } else {
            $out['jackisa'] = 'unreachable';
        }

        // office.jackisa.com: pull tenants, users and members.
        $office = self::peerPost('office', '/api/lic/sync', ['direction' => 'pull', 'since' => $since]);
        if ($office !== null) {
            $tenants = $users = $members = 0;
            foreach (($office['tenants'] ?? []) as $tenant) {
                try { TenantService::upsertTenant($tenant); $tenants++; }
                catch (\Throwable $e) { $app->log('warn', 'sync: office tenant failed', ['error' => $e->getMessage()]); }
            }
            foreach (($office['users'] ?? []) as $user) {
                try { TenantService::upsertUser($user); $users++; }
                catch (\Throwable $e) { $app->log('warn', 'sync: office user failed', ['error' => $e->getMessage()]); }
            }
            foreach (($office['members'] ?? []) as $member) {
                try {
                    TenantService::addMember(
                        (string) ($member['lic_tenant_id'] ?? $member['company_id'] ?? ''),
                        (string) ($member['user_id'] ?? ''),
                        (string) ($member['position'] ?? 'employee'),
                        (string) ($member['status'] ?? 'active'),
                        false
                    );
                    $members++;
                } catch (\Throwable $e) { $app->log('warn', 'sync: office member failed', ['error' => $e->getMessage()]); }
            }
            $out['office'] = ['tenants' => $tenants, 'users' => $users, 'members' => $members];
        } else {
            $out['office'] = 'unreachable';
        }

        return $out;
    }

    /**
     * Signed POST to a peer, decoding a JSON response.
     * @param array<string,mixed> $payload
     * @return array<string,mixed>|null
     */
    private static function peerPost(string $peer, string $path, array $payload): ?array
    {
        $app = App::instance();
        $base = (string) $app->config(['peers', $peer, 'base_url'], '');
        if ($base === '') { return null; }
        $body = json_encode($payload);
        $ch = curl_init(rtrim($base, '/') . $path);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-Lic-Signature: ' . Crypto::peerSignature($peer, (string) $body),
                'X-Lic-Peer: lic',
            ],
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT        => 30,
        ]);
        $response = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            $app->log('warn', 'sync: peer unreachable', ['peer' => $peer, 'error' => $err]);
            return null;
        }
        $decoded = json_decode((string) $response, true);
        return is_array($decoded) && ($decoded['ok'] ?? false) ? $decoded : null;
    }

    // -- Income-tax snapshots (URA-ready) -----------------------------------

    public static function taxSnapshots(): array
    {
        $app = App::instance();
        // Pull each tenant's financials from office and compute chargeable income.
        $tenants = $app->all("SELECT id FROM tenants WHERE status = 'active' LIMIT 200");
        $written = 0;
        foreach ($tenants as $tenant) {
            $data = self::fetchPeerReport($tenant['id'], 'tax');
            if ($data === null) { continue; }
            $gross = (float) ($data['gross_income'] ?? 0);
            $expenses = (float) ($data['allowable_expenses'] ?? 0);
            $chargeable = max(0, $gross - $expenses);
            $tax = self::ugandaCorporateTax($chargeable);
            $app->run(
                'INSERT INTO tax_snapshots (id, tenant_id, period_start, period_end, gross_income, allowable_expenses, chargeable_income, tax_payable, currency, payload)
                 VALUES (?,?,?,?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE gross_income = VALUES(gross_income), allowable_expenses = VALUES(allowable_expenses),
                   chargeable_income = VALUES(chargeable_income), tax_payable = VALUES(tax_payable), payload = VALUES(payload)',
                [
                    Ids::uuid(), $tenant['id'],
                    $data['period_start'] ?? date('Y-01-01'), $data['period_end'] ?? date('Y-m-d'),
                    $gross, $expenses, $chargeable, $tax, $data['currency'] ?? 'UGX',
                    json_encode($data, JSON_UNESCAPED_SLASHES),
                ]
            );
            $written++;
        }
        return ['snapshots' => $written];
    }

    /**
     * Uganda corporate income tax.
     *  - chargeable income up to the presumptive threshold: 1% presumptive rate
     *  - otherwise the standard 30% corporate rate
     * The threshold is configurable (tax.presumptive_threshold) because the
     * presumptive regime's band changes with each Finance Act.
     */
    public static function ugandaCorporateTax(float $chargeable): float
    {
        if ($chargeable <= 0) {
            return 0.0;
        }
        $threshold = (float) App::instance()->config('tax.presumptive_threshold', 150_000_000);
        if ($chargeable <= $threshold) {
            return round($chargeable * 0.01, 2);
        }
        return round($chargeable * 0.30, 2);
    }

    // -- Unit-trust NAV snapshots -------------------------------------------

    public static function fundSnapshots(): array
    {
        $app = App::instance();
        $tenants = $app->all("SELECT id FROM tenants WHERE status = 'active' LIMIT 200");
        $written = 0;
        foreach ($tenants as $tenant) {
            $data = self::fetchPeerReport($tenant['id'], 'fund');
            if ($data === null) { continue; }
            $assets = (float) ($data['total_assets'] ?? 0);
            $liabilities = (float) ($data['total_liabilities'] ?? 0);
            $units = (float) ($data['units_outstanding'] ?? 0);
            $nav = $units > 0 ? ($assets - $liabilities) / $units : 0;
            $app->run(
                'INSERT INTO fund_snapshots (id, tenant_id, as_of, total_assets, total_liabilities, nav_per_unit, units_outstanding, currency, payload)
                 VALUES (?,?,?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE total_assets = VALUES(total_assets), total_liabilities = VALUES(total_liabilities),
                   nav_per_unit = VALUES(nav_per_unit), units_outstanding = VALUES(units_outstanding), payload = VALUES(payload)',
                [
                    Ids::uuid(), $tenant['id'], $data['as_of'] ?? date('Y-m-d'),
                    $assets, $liabilities, round($nav, 6), $units, $data['currency'] ?? 'UGX',
                    json_encode($data, JSON_UNESCAPED_SLASHES),
                ]
            );
            $written++;
        }
        return ['snapshots' => $written];
    }

    // -- Unit-trust daily automation ----------------------------------------
    // Interest accrual, compounding, NAV recompute, member signals, snapshots
    // and standing orders all live in the office database (run_daily_fund_automation).
    // The office app has no scheduler, so lic pokes it once a day.

    public static function runFundDaily(): array
    {
        $app = App::instance();

        // run-all fires every 30 minutes; compounding and interest accrue once a
        // day, so skip if this job already succeeded today.
        $done = (int) $app->one(
            "SELECT COUNT(*) AS c FROM cron_runs WHERE job = 'fund.daily' AND status = 'ok' AND DATE(finished_at) = CURDATE()"
        )['c'];
        if ($done > 0) { return ['skipped' => 'already ran today']; }

        $base = (string) $app->config(['peers', 'office', 'base_url'], '');
        if ($base === '') { return ['error' => 'office peer not configured']; }

        $body = json_encode(['triggered_at' => date('c')]);
        $ch = curl_init(rtrim($base, '/') . '/api/lic/fund-daily');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-Lic-Signature: ' . Crypto::peerSignature('office', (string) $body),
                'X-Lic-Peer: lic',
            ],
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT        => 60,
        ]);
        $response = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { return ['error' => $err]; }
        $decoded = json_decode((string) $response, true);
        return is_array($decoded) ? $decoded : ['error' => 'invalid response'];
    }

    // -- Renewal reminders (7 and 1 day before expiry) ----------------------

    public static function renewalReminders(): array
    {
        $app = App::instance();
        $rows = $app->all(
            "SELECT l.*, t.name AS tenant_name, t.email AS tenant_email,
                    (SELECT email FROM users u JOIN tenant_members m ON m.user_id = u.id
                     WHERE m.tenant_id = l.tenant_id AND m.is_owner = 1 LIMIT 1) AS owner_email
             FROM licenses l JOIN tenants t ON t.id = l.tenant_id
             WHERE l.status IN ('active','trial')
               AND DATE(l.expires_at) IN (DATE_ADD(CURDATE(), INTERVAL 7 DAY), DATE_ADD(CURDATE(), INTERVAL 1 DAY))"
        );
        $sent = 0;
        foreach ($rows as $lic) {
            $to = $lic['owner_email'] ?: $lic['tenant_email'];
            if (!$to) { continue; }
            $days = (int) ((strtotime((string) $lic['expires_at']) - time()) / 86400);
            MailService::send([$to], 'Your Jackisa Office licence expires soon',
                '<p>Hello,</p><p>The Jackisa Office licence for <strong>' . htmlspecialchars((string) $lic['tenant_name'])
                . '</strong> expires in <strong>' . $days . ' day(s)</strong>.</p>'
                . '<p>Renew to avoid an interruption in service.</p>'
                . '<p><a href="https://office.jackisa.com/app/settings/billing" style="background:#0d5ba3;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Renew now</a></p>',
                [], ['template' => 'renewal_reminder']
            );
            $sent++;
        }
        return ['reminded' => $sent];
    }

    /**
     * Ask a peer for a computed report (tax / fund) for one tenant.
     * @return array<string,mixed>|null
     */
    private static function fetchPeerReport(string $tenantId, string $kind): ?array
    {
        $app = App::instance();
        $base = (string) $app->config(['peers', 'office', 'base_url'], '');
        if ($base === '') { return null; }
        $body = json_encode(['tenant_id' => $tenantId, 'kind' => $kind]);
        $ch = curl_init(rtrim($base, '/') . '/api/lic/report');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-Lic-Signature: ' . Crypto::peerSignature('office', (string) $body),
                'X-Lic-Peer: lic',
            ],
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT        => 30,
        ]);
        $response = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { return null; }
        $decoded = json_decode((string) $response, true);
        return is_array($decoded) && !empty($decoded['ok']) ? ($decoded['data'] ?? null) : null;
    }
}
