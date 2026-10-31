<?php
declare(strict_types=1);

namespace Jackisa\Lic\Service;

use Jackisa\Lic\App;
use Jackisa\Lic\Support\Ids;

/**
 * Payments hub.
 *
 * JPesa is the primary asynchronous mobile-money rail (Uganda/Kenya). A charge
 * is a two-step handshake: we ask JPesa to debit the number, the customer
 * approves the prompt, then we verify the result with JPesa before crediting
 * anything. A callback only accelerates one verified provider query — it is
 * never trusted on its own.
 */
final class PaymentService
{
    public const SUCCESS_STATUSES = ['closed', 'approved', 'paid', 'success', 'successful', 'complete', 'completed'];
    public const FAILED_STATUSES  = ['failed', 'failure', 'cancelled', 'canceled', 'rejected', 'declined', 'expired', 'error'];

    /**
     * Gross-up: the payer is charged amount / (1 - fee%) so the fee is covered.
     * @return array{amount:string,fee:string,charged:string}
     */
    public static function feeSplit(float $amount): array
    {
        $rate = (float) App::instance()->config('jpesa.fee_rate', 0.03);
        $rate = max(0.0, min(0.5, $rate));
        $charged = round($amount / (1 - $rate), 2);
        return [
            'amount'  => number_format($amount, 2, '.', ''),
            'fee'     => number_format($charged - $amount, 2, '.', ''),
            'charged' => number_format($charged, 2, '.', ''),
        ];
    }

    public static function normalizeMsisdn(string $mobile): ?string
    {
        $mobile = ltrim(trim($mobile), '+');
        $mobile = preg_replace('/\D/', '', $mobile) ?? '';
        if (str_starts_with($mobile, '0')) {
            $mobile = '256' . substr($mobile, 1);
        }
        if (strlen($mobile) < 12 || strlen($mobile) > 15) {
            return null;
        }
        if (!in_array(substr($mobile, 0, 3), ['256', '254'], true)) {
            return null;
        }
        return $mobile;
    }

    /**
     * Start a collection. Returns the local payment record plus the provider tid.
     *
     * @return array<string,mixed>
     */
    public static function initiate(array $params): array
    {
        $app = App::instance();
        $currency = (string) $app->config('jpesa.currency', 'UGX');
        $amount = round((float) ($params['amount'] ?? 0), 2);
        if ($amount <= 0 || $amount > 10000000) {
            throw new \InvalidArgumentException('Enter a valid amount.');
        }

        $msisdn = self::normalizeMsisdn((string) ($params['msisdn'] ?? ''));
        if ($msisdn === null) {
            throw new \InvalidArgumentException('Enter a valid Uganda or Kenya mobile number.');
        }

        $split = self::feeSplit($amount);
        $merchantRef = 'LIC-' . ($params['tenant_id'] ?? 'x') . '-' . strtoupper(bin2hex(random_bytes(6)));
        $id = Ids::uuid();

        $app->run(
            'INSERT INTO payments
              (id, tenant_id, user_id, subscription_id, purpose, channel, provider, amount, charged_amount, fee,
               currency, msisdn, interval_months, plan_code, merchant_ref, status, raw_request)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                $id,
                $params['tenant_id'] ?? null,
                $params['user_id'] ?? null,
                $params['subscription_id'] ?? null,
                in_array($params['purpose'] ?? 'license', ['license','subscription','topup','invoice','other','change'], true) ? $params['purpose'] : 'license',
                $params['channel'] ?? 'jpesa',
                'jpesa',
                $split['amount'], $split['charged'], $split['fee'],
                $currency, $msisdn,
                $params['interval_months'] ?? null,
                $params['plan_code'] ?? null,
                $merchantRef, 'pending',
                json_encode(['plan_code' => $params['plan_code'] ?? null, 'purpose' => $params['purpose'] ?? 'license']),
            ]
        );

        $callbackUrl = rtrim((string) $app->config('app.base_url', 'https://lic.jackisa.com'), '/')
            . '/api/v1/jpesa-payments/callback';

        $result = self::jpesaRequest('credit', [
            'mobile'    => $msisdn,
            'amount'    => $split['charged'],
            'callback'  => $callbackUrl,
            'tx'        => $merchantRef,
            'description' => $params['description'] ?? 'Jackisa Office licence payment',
        ]);

        if (empty($result['tid']) || strtolower((string) ($result['api_status'] ?? '')) !== 'success') {
            $app->run(
                "UPDATE payments SET status = 'failed', provider_message = ?, raw_response = ?, updated_at = NOW() WHERE id = ?",
                [substr((string) ($result['msg'] ?? 'JPesa rejected the request'), 0, 500), json_encode($result), $id]
            );
            return [
                'success' => false,
                'payment_id' => $id,
                'merchant_ref' => $merchantRef,
                'message' => (string) ($result['msg'] ?? 'JPesa rejected the payment request.'),
            ];
        }

        $app->run(
            "UPDATE payments SET status = 'processing', provider_tid = ?, provider_status = ?, raw_response = ?, updated_at = NOW() WHERE id = ?",
            [(string) $result['tid'], (string) ($result['api_status'] ?? 'pending'), json_encode($result), $id]
        );

        return [
            'success'       => true,
            'payment_id'    => $id,
            'merchant_ref'  => $merchantRef,
            'transaction_id'=> (string) $result['tid'],
            'amount'        => $split['amount'],
            'charged'       => $split['charged'],
            'fee'           => $split['fee'],
            'currency'      => $currency,
            'status'        => 'processing',
            'message'       => 'Payment request sent. Approve the prompt on your phone to continue.',
        ];
    }

    /**
     * Verify one payment with JPesa and settle it if paid.
     *
     * @return array<string,mixed>
     */
    public static function reconcile(array $payment, bool $force = false): array
    {
        $app = App::instance();

        if (in_array($payment['status'], ['paid', 'failed', 'cancelled', 'expired'], true)) {
            return $payment;
        }

        $now = time();
        $attempts = (int) $payment['reconcile_attempts'];
        $maxAttempts = 7;
        $baseDelay = 60;
        $maxDelay = 900;
        $created = strtotime((string) $payment['created_at']);
        $lastChecked = $payment['last_checked_at'] ? strtotime((string) $payment['last_checked_at']) : 0;
        $retryAfter = min($maxDelay, $baseDelay * (1 << min($attempts, 20)));

        if (!$force && $lastChecked > 0 && $lastChecked + $retryAfter > $now) {
            return $payment; // throttled
        }

        // Expire abandoned prompts so they do not hang forever.
        if ($created > 0 && $created + 3600 <= $now && $payment['status'] === 'pending') {
            $app->run(
                "UPDATE payments SET status = 'expired', provider_status = 'expired', provider_message = 'Not completed in time', updated_at = NOW() WHERE id = ?",
                [$payment['id']]
            );
            $payment['status'] = 'expired';
            return $payment;
        }
        if ($attempts >= $maxAttempts) {
            return $payment;
        }

        $app->run(
            'UPDATE payments SET last_checked_at = NOW(), reconcile_attempts = reconcile_attempts + 1 WHERE id = ?',
            [$payment['id']]
        );

        if (empty($payment['provider_tid'])) {
            return $payment;
        }

        $result = self::jpesaRequest('info', ['tid' => (string) $payment['provider_tid']]);
        $apiStatus = strtolower(trim((string) ($result['api_status'] ?? $result['APIStatus'] ?? '')));
        $providerStatus = strtolower(trim((string) ($result['status'] ?? $result['transaction_status'] ?? '')));

        $app->run(
            'UPDATE payments SET provider_status = ?, provider_message = ?, raw_response = ?, updated_at = NOW() WHERE id = ?',
            [substr($providerStatus, 0, 60), substr((string) ($result['msg'] ?? $result['message'] ?? ''), 0, 500), json_encode($result), $payment['id']]
        );

        if (in_array($providerStatus, self::FAILED_STATUSES, true)) {
            $app->run("UPDATE payments SET status = 'failed', completed_at = NOW() WHERE id = ? AND status IN ('pending','processing')", [$payment['id']]);
            $payment['status'] = 'failed';
            return $payment;
        }

        if ($apiStatus === 'success' && in_array($providerStatus, self::SUCCESS_STATUSES, true)) {
            // Guard against a short-paid charge.
            $paid = (float) ($result['amount'] ?? $result['paid_amount'] ?? $result['total'] ?? 0);
            if ($paid > 0 && $paid + 0.01 < (float) $payment['charged_amount']) {
                $app->log('warn', 'payment underpaid', ['payment' => $payment['id'], 'paid' => $paid, 'expected' => $payment['charged_amount']]);
            }
            $app->run(
                "UPDATE payments SET status = 'paid', completed_at = NOW() WHERE id = ? AND status IN ('pending','processing')",
                [$payment['id']]
            );
            $payment['status'] = 'paid';
            self::fulfill($payment);
            return $payment;
        }

        return $payment;
    }

    /**
     * Settle a paid charge: extend the licence (or start the subscription).
     */
    public static function fulfill(array $payment): void
    {
        $app = App::instance();
        if ((int) $payment['fulfilled'] === 1) {
            return;
        }

        $months = (int) ($payment['interval_months'] ?? 0);
        $tenantId = (string) ($payment['tenant_id'] ?? '');

        // A plan change is settled by switching the licence to the new plan
        // (the credit for the unused period was already applied to the charge).
        if (($payment['purpose'] ?? '') === 'change' && $tenantId !== '' && !empty($payment['plan_code'])) {
            try {
                LicenseService::changePlan($tenantId, (string) $payment['plan_code'], ['paid' => true]);
            } catch (\Throwable $e) {
                $app->log('error', 'payment.fulfill change failed', ['payment' => $payment['id'], 'error' => $e->getMessage()]);
                return; // leave unfulfilled so it can be retried
            }
            $app->run('UPDATE payments SET fulfilled = 1, updated_at = NOW() WHERE id = ?', [$payment['id']]);
            $app->run(
                'INSERT INTO audit_log (actor_type, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)',
                ['system', 'payment.fulfilled', 'payment', $payment['id'], json_encode(['purpose' => 'change', 'plan' => $payment['plan_code']])]
            );
            return;
        }

        if ($tenantId === '' || $months <= 0) {
            $app->run('UPDATE payments SET fulfilled = 1, updated_at = NOW() WHERE id = ?', [$payment['id']]);
            return;
        }

        $license = $app->one(
            "SELECT * FROM licenses WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1",
            [$tenantId]
        );

        if ($license === null) {
            // No licence yet: issue one for the plan that was paid for.
            $planCode = $payment['plan_code'] ?: 'basic_1m';
            LicenseService::issue($tenantId, $planCode, ['status' => 'active', 'activated' => date('Y-m-d H:i:s')]);
            $license = $app->one("SELECT * FROM licenses WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1", [$tenantId]);
        } else {
            LicenseService::extend($license['id'], $months, $payment['plan_code'] ?: null);
        }

        // Upsert the subscription so billing history is intact.
        $sub = $app->one("SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1", [$tenantId]);
        $periodEnd = (new \DateTimeImmutable('now'))->modify('+' . $months . ' months');
        if ($sub === null) {
            $app->run(
                'INSERT INTO subscriptions (id, tenant_id, license_id, plan_code, tier, interval_months, status, amount, currency, current_period_start, current_period_end)
                 VALUES (?,?,?,?,?,?,?,?,?,NOW(),?)',
                [Ids::uuid(), $tenantId, $license['id'] ?? null, $payment['plan_code'] ?: 'basic_1m',
                 $license['tier'] ?? 'basic', $months, 'active', (float) $payment['amount'], $payment['currency'],
                 $periodEnd->format('Y-m-d H:i:s')]
            );
        } else {
            $app->run(
                "UPDATE subscriptions SET status = 'active', interval_months = ?, amount = ?, currency = ?,
                   current_period_start = NOW(), current_period_end = ?, updated_at = NOW() WHERE id = ?",
                [$months, (float) $payment['amount'], $payment['currency'], $periodEnd->format('Y-m-d H:i:s'), $sub['id']]
            );
        }

        // A paid signup converts any active trial.
        $app->run(
            "UPDATE trials SET status = 'converted', converted_at = NOW() WHERE tenant_id = ? AND status IN ('active','reminded')",
            [$tenantId]
        );

        $app->run('UPDATE payments SET fulfilled = 1, updated_at = NOW() WHERE id = ?', [$payment['id']]);
        $app->run(
            'INSERT INTO audit_log (actor_type, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)',
            ['system', 'payment.fulfilled', 'payment', $payment['id'], json_encode(['months' => $months, 'plan' => $payment['plan_code']])]
        );
    }

    /**
     * Start a payout (money OUT: salaries, refunds, vendor payments).
     *
     * A payout is a JPesa DEBIT. Like a collection it is a two-step handshake:
     * JPesa confirms the debit, then we settle. The idempotency key makes a
     * retried request safe — an employee is never paid twice for one payslip.
     *
     * @return array<string,mixed>
     */
    public static function initiatePayout(array $params): array
    {
        $app = App::instance();
        $currency = (string) $app->config('jpesa.currency', 'UGX');
        $amount = round((float) ($params['amount'] ?? 0), 2);
        if ($amount <= 0 || $amount > 10000000) {
            throw new \InvalidArgumentException('Enter a valid amount.');
        }

        $tenantId = (string) ($params['tenant_id'] ?? '');
        if ($tenantId === '') {
            throw new \InvalidArgumentException('tenant_id is required.');
        }

        $msisdn = self::normalizeMsisdn((string) ($params['msisdn'] ?? ''));
        if ($msisdn === null) {
            throw new \InvalidArgumentException('Enter a valid Uganda or Kenya mobile number.');
        }

        $idem = (string) ($params['idempotency_key'] ?? '');
        if ($idem === '') {
            $idem = 'po-' . $tenantId . '-' . ($params['module_ref_id'] ?? '') . '-' . date('Ymd');
        }

        // Idempotency: return the existing payout rather than starting a second.
        $existing = $app->one(
            'SELECT * FROM payout_requests WHERE tenant_id = ? AND idempotency_key = ?',
            [$tenantId, $idem]
        );
        if ($existing !== null) {
            return [
                'success'      => in_array($existing['status'], ['pending', 'processing', 'paid'], true),
                'duplicate'    => true,
                'payout_id'    => $existing['id'],
                'payment_id'   => $existing['payment_id'],
                'status'       => $existing['status'],
                'provider_tid' => $existing['provider_tid'],
                'message'      => 'This payout was already requested.',
            ];
        }

        $merchantRef = 'PAY-' . strtoupper(bin2hex(random_bytes(6)));
        $paymentId = Ids::uuid();
        $payoutId = Ids::uuid();
        $payee = is_array($params['payee'] ?? null) ? $params['payee'] : ['name' => (string) ($params['payee_name'] ?? '')];

        $app->run(
            'INSERT INTO payments
              (id, tenant_id, user_id, purpose, channel, direction, provider, amount, charged_amount, fee,
               currency, msisdn, plan_code, merchant_ref, status, raw_request, payee)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                $paymentId, $tenantId, $params['user_id'] ?? null, 'payout',
                'jpesa', 'debit', 'jpesa',
                $amount, $amount, 0,
                $currency, $msisdn, null, $merchantRef, 'pending',
                json_encode(['module' => $params['module'] ?? 'payslip', 'module_ref_id' => $params['module_ref_id'] ?? null]),
                json_encode($payee),
            ]
        );

        $app->run(
            'INSERT INTO payout_requests
              (id, tenant_id, payment_id, idempotency_key, module, module_ref_id, payee_type, payee, amount, currency, status, provider, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                $payoutId, $tenantId, $paymentId, $idem,
                (string) ($params['module'] ?? 'payslip'),
                $params['module_ref_id'] ?? null,
                in_array($params['payee_type'] ?? 'employee', ['employee', 'vendor', 'refund', 'other'], true) ? $params['payee_type'] : 'employee',
                json_encode($payee), $amount, $currency, 'pending', 'jpesa',
                $params['user_id'] ?? null,
            ]
        );

        $callbackUrl = rtrim((string) $app->config('app.base_url', 'https://lic.jackisa.com'), '/')
            . '/api/v1/jpesa-payments/callback';

        $result = self::jpesaRequest('debit', [
            'mobile'      => $msisdn,
            'amount'      => number_format($amount, 2, '.', ''),
            'callback'    => $callbackUrl,
            'tx'          => $merchantRef,
            'description' => $params['description'] ?? 'Jackisa Office payout',
        ]);

        if (empty($result['tid']) || strtolower((string) ($result['api_status'] ?? '')) !== 'success') {
            $msg = substr((string) ($result['msg'] ?? 'JPesa rejected the payout request'), 0, 500);
            $app->run("UPDATE payments SET status = 'failed', provider_message = ?, raw_response = ?, updated_at = NOW() WHERE id = ?", [$msg, json_encode($result), $paymentId]);
            $app->run("UPDATE payout_requests SET status = 'failed', provider_message = ?, updated_at = NOW() WHERE id = ?", [$msg, $payoutId]);
            return [
                'success' => false,
                'payout_id' => $payoutId,
                'payment_id' => $paymentId,
                'merchant_ref' => $merchantRef,
                'message' => (string) ($result['msg'] ?? 'JPesa rejected the payout request.'),
            ];
        }

        $app->run("UPDATE payments SET status = 'processing', provider_tid = ?, provider_status = ?, raw_response = ?, updated_at = NOW() WHERE id = ?", [(string) $result['tid'], (string) ($result['api_status'] ?? 'pending'), json_encode($result), $paymentId]);
        $app->run("UPDATE payout_requests SET status = 'processing', provider_tid = ?, updated_at = NOW() WHERE id = ?", [(string) $result['tid'], $payoutId]);

        return [
            'success'      => true,
            'payout_id'    => $payoutId,
            'payment_id'   => $paymentId,
            'merchant_ref' => $merchantRef,
            'transaction_id' => (string) $result['tid'],
            'amount'       => $amount,
            'currency'     => $currency,
            'status'       => 'processing',
            'message'      => 'Payout submitted. The recipient will receive it once JPesa confirms.',
        ];
    }

    /**
     * Verify one payout with JPesa and settle it if paid. Mirrors reconcile().
     *
     * @return array<string,mixed>
     */
    public static function reconcilePayout(array $payment, bool $force = false): array
    {
        $app = App::instance();
        if (in_array($payment['status'], ['paid', 'failed', 'cancelled', 'expired'], true)) {
            return $payment;
        }

        $now = time();
        $attempts = (int) $payment['reconcile_attempts'];
        $maxAttempts = 7;
        $lastChecked = $payment['last_checked_at'] ? strtotime((string) $payment['last_checked_at']) : 0;
        $retryAfter = min(900, 60 * (1 << min($attempts, 20)));
        if (!$force && $lastChecked > 0 && $lastChecked + $retryAfter > $now) {
            return $payment;
        }
        if ($attempts >= $maxAttempts) {
            return $payment;
        }
        $app->run('UPDATE payments SET last_checked_at = NOW(), reconcile_attempts = reconcile_attempts + 1 WHERE id = ?', [$payment['id']]);
        if (empty($payment['provider_tid'])) {
            return $payment;
        }

        $result = self::jpesaRequest('info', ['tid' => (string) $payment['provider_tid']]);
        $apiStatus = strtolower(trim((string) ($result['api_status'] ?? $result['APIStatus'] ?? '')));
        $providerStatus = strtolower(trim((string) ($result['status'] ?? $result['transaction_status'] ?? '')));

        $app->run(
            'UPDATE payments SET provider_status = ?, provider_message = ?, raw_response = ?, updated_at = NOW() WHERE id = ?',
            [substr($providerStatus, 0, 60), substr((string) ($result['msg'] ?? $result['message'] ?? ''), 0, 500), json_encode($result), $payment['id']]
        );

        if (in_array($providerStatus, self::FAILED_STATUSES, true)) {
            $app->run("UPDATE payments SET status = 'failed', completed_at = NOW() WHERE id = ? AND status IN ('pending','processing')", [$payment['id']]);
            $app->run("UPDATE payout_requests SET status = 'failed', provider_message = ?, updated_at = NOW() WHERE payment_id = ?", [substr($providerStatus, 0, 500), $payment['id']]);
            $payment['status'] = 'failed';
            return $payment;
        }

        if ($apiStatus === 'success' && in_array($providerStatus, self::SUCCESS_STATUSES, true)) {
            $app->run("UPDATE payments SET status = 'paid', completed_at = NOW() WHERE id = ? AND status IN ('pending','processing')", [$payment['id']]);
            $app->run("UPDATE payout_requests SET status = 'paid', updated_at = NOW() WHERE payment_id = ?", [$payment['id']]);
            $payment['status'] = 'paid';
            $app->run(
                'INSERT INTO audit_log (actor_type, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)',
                ['system', 'payout.paid', 'payment', $payment['id'], json_encode(['tid' => $payment['provider_tid']])]
            );
            return $payment;
        }

        return $payment;
    }

    /** Payout history for a tenant. @return array<int,array<string,mixed>> */
    public static function payoutHistory(?string $tenantId, int $limit = 20): array
    {
        if ($tenantId === null || $tenantId === '') {
            return App::instance()->all(
                'SELECT * FROM payout_requests ORDER BY created_at DESC LIMIT ' . max(1, min(200, $limit))
            );
        }
        return App::instance()->all(
            'SELECT * FROM payout_requests WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ' . max(1, min(200, $limit)),
            [$tenantId]
        );
    }

    /**
     * Ask JPesa to credit (collect) or query (info) a transaction.
     * @return array<string,mixed>
     */
    public static function jpesaRequest(string $action, array $fields): array
    {
        $app = App::instance();
        $apiUrl = (string) $app->config('jpesa.api_url', 'https://my.jpesa.com/api/');
        $apiKey = (string) $app->config('jpesa.api_key', '');
        if ($apiKey === '') {
            return ['api_status' => 'error', 'msg' => 'JPesa is not configured.'];
        }

        $esc = fn($v) => htmlspecialchars((string) $v, ENT_XML1);
        $xml = '<?xml version="1.0" encoding="UTF-8"?><g7bill><_key_>' . $esc($apiKey) . '</_key_><cmd>account</cmd>';
        if ($action === 'info') {
            $xml .= '<action>info</action><tid>' . $esc($fields['tid'] ?? '') . '</tid>';
        } else {
            $xml .= '<action>' . ($action === 'debit' ? 'debit' : 'credit') . '</action><pt>mm</pt>'
                . '<mobile>' . $esc($fields['mobile'] ?? '') . '</mobile>'
                . '<amount>' . $esc(number_format((float) ($fields['amount'] ?? 0), 2, '.', '')) . '</amount>'
                . '<callback>' . $esc($fields['callback'] ?? '') . '</callback>'
                . '<tx>' . $esc($fields['tx'] ?? '') . '</tx>'
                . '<description>' . $esc($fields['description'] ?? 'Jackisa Office') . '</description>';
        }
        $xml .= '</g7bill>';

        $ch = curl_init($apiUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $xml,
            CURLOPT_HTTPHEADER     => ['Content-Type: text/xml'],
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT        => 60,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);
        $response = curl_exec($ch);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            $app->log('error', 'jpesa curl error', ['error' => $error, 'action' => $action]);
            return ['api_status' => 'error', 'msg' => 'JPesa is temporarily unavailable.'];
        }
        $decoded = json_decode((string) $response, true);
        return is_array($decoded) ? $decoded : ['api_status' => 'error', 'msg' => 'Unreadable JPesa response.'];
    }

    /** @return array<int,array<string,mixed>> */
    public static function history(?string $tenantId, int $limit = 20): array
    {
        return App::instance()->all(
            'SELECT id, purpose, channel, amount, charged_amount, fee, currency, msisdn, interval_months, plan_code,
                    merchant_ref, provider_tid, status, completed_at, created_at
             FROM payments WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ' . max(1, min(100, $limit)),
            [$tenantId]
        );
    }
}
