<?php
declare(strict_types=1);

namespace Jackisa\Lic\Controller;

use Jackisa\Lic\App;
use Jackisa\Lic\Http\Request;
use Jackisa\Lic\Http\Response;
use Jackisa\Lic\Middleware\Auth;
use Jackisa\Lic\Service\PaymentService;

/**
 * /api/v1/jpesa-payments — the payment hub.
 */
final class PaymentController
{
    /** POST /api/v1/jpesa-payments/initiate */
    public static function initiate(Request $request): void
    {
        Auth::requirePeer($request);
        try {
            $result = PaymentService::initiate([
                'tenant_id'       => $request->string('tenant_id'),
                'user_id'         => $request->string('user_id') ?: null,
                'subscription_id' => $request->string('subscription_id') ?: null,
                'purpose'         => $request->string('purpose', 'license'),
                'channel'         => $request->string('channel', 'jpesa'),
                'amount'          => $request->float('amount'),
                'msisdn'          => $request->string('msisdn'),
                'interval_months' => $request->int('interval_months') ?: null,
                'plan_code'       => $request->string('plan_code') ?: null,
                'description'     => $request->string('description', 'Jackisa Office licence payment'),
            ]);
            Response::ok($result, $result['success'] ? '200' : '400');
        } catch (\InvalidArgumentException $e) {
            Response::error('422', $e->getMessage(), 422);
        }
    }

    /** POST /api/v1/jpesa-payments/status */
    public static function status(Request $request): void
    {
        Auth::requirePeer($request);
        $app = App::instance();
        $paymentId = $request->string('payment_id');
        $merchantRef = $request->string('merchant_ref');
        $payment = $paymentId !== ''
            ? $app->one('SELECT * FROM payments WHERE id = ?', [$paymentId])
            : ($merchantRef !== '' ? $app->one('SELECT * FROM payments WHERE merchant_ref = ?', [$merchantRef]) : null);

        if ($payment === null) {
            Response::error('404', 'Payment not found', 404);
        }

        if ($payment['status'] === 'pending' || $payment['status'] === 'processing') {
            $payment = PaymentService::reconcile($payment);
        }

        Response::ok([
            'payment_id'     => $payment['id'],
            'merchant_ref'   => $payment['merchant_ref'],
            'status'         => $payment['status'],
            'fulfilled'      => (int) $payment['fulfilled'],
            'amount'         => (float) $payment['amount'],
            'charged'        => (float) $payment['charged_amount'],
            'fee'            => (float) $payment['fee'],
            'currency'       => $payment['currency'],
            'plan_code'      => $payment['plan_code'],
            'interval_months'=> $payment['interval_months'] !== null ? (int) $payment['interval_months'] : null,
            'provider_status'=> $payment['provider_status'],
            'completed_at'   => $payment['completed_at'],
        ]);
    }

    /** POST /api/v1/jpesa-payments/history */
    public static function history(Request $request): void
    {
        Auth::requirePeer($request);
        $tenantId = $request->string('tenant_id') ?: null;
        Response::ok(['payments' => PaymentService::history($tenantId, $request->int('limit', 20))]);
    }

    /** POST /api/v1/jpesa-payments/fee — the gross-up preview. */
    public static function fee(Request $request): void
    {
        $amount = $request->float('amount');
        if ($amount <= 0) {
            Response::error('422', 'Enter a valid amount.', 422);
        }
        $split = PaymentService::feeSplit($amount);
        Response::ok(array_merge($split, [
            'currency' => App::instance()->config('jpesa.currency', 'UGX'),
            'note'     => 'The customer approves `charged`; `amount` is credited to the licence.',
        ]));
    }

    /**
     * GET/POST /api/v1/jpesa-payments/callback — JPesa IPN.
     * Never trusted directly: it only triggers one verified provider query.
     */
    public static function callback(Request $request): void
    {
        $app = App::instance();
        $tid = $request->string('tid') ?: $request->string('transaction_id');
        $ref = $request->string('ref') ?: $request->string('tx');
        $status = $request->string('status');

        $app->log('info', 'jpesa callback', ['tid' => $tid, 'ref' => $ref, 'status' => $status]);

        $payment = null;
        if ($ref !== '') {
            $payment = $app->one('SELECT * FROM payments WHERE merchant_ref = ?', [$ref]);
        }
        if ($payment === null && $tid !== '') {
            $payment = $app->one('SELECT * FROM payments WHERE provider_tid = ?', [$tid]);
        }
        if ($payment === null) {
            Response::ok(['received' => true, 'matched' => false]);
        }

        // Idempotency: a repeated callback is acknowledged, not reprocessed.
        try {
            $app->run(
                'INSERT INTO processed_callbacks (provider, external_ref, payment_id, status, raw_payload) VALUES (?,?,?,?,?)',
                ['jpesa', $ref !== '' ? $ref : $tid, $payment['id'], $status, json_encode($request->all())]
            );
        } catch (\Throwable $e) {
            Response::ok(['received' => true, 'duplicate' => true]);
        }

        PaymentService::reconcile($payment, true);
        Response::ok(['received' => true, 'matched' => true]);
    }

    /** GET /api/v1/jpesa-payments/channels — what the UI may offer. */
    public static function channels(Request $request): void
    {
        Response::ok([
            'channels' => [
                ['code' => 'jpesa', 'label' => 'JPesa Mobile Money', 'currencies' => ['UGX', 'KES'], 'enabled' => (bool) App::instance()->config('jpesa.enabled', true)],
                ['code' => 'mtn_mobile_money', 'label' => 'MTN Mobile Money', 'currencies' => ['UGX'], 'enabled' => true, 'rail' => 'jpesa'],
                ['code' => 'airtel_money', 'label' => 'Airtel Money', 'currencies' => ['UGX'], 'enabled' => true, 'rail' => 'jpesa'],
            ],
        ]);
    }
}
