<?php
declare(strict_types=1);

namespace Jackisa\Lic\Controller;

use Jackisa\Lic\App;
use Jackisa\Lic\Http\Request;
use Jackisa\Lic\Http\Response;
use Jackisa\Lic\Middleware\Auth;
use Jackisa\Lic\Service\LicenseService;
use Jackisa\Lic\Service\TenantService;

/**
 * /api/v1/office-license — issue, activate, validate, revoke, renew.
 */
final class LicenseController
{
    /** POST /api/v1/office-license/issue */
    public static function issue(Request $request): void
    {
        Auth::requirePeer($request);
        try {
            $tenantId = $request->string('tenant_id');
            $planCode = $request->string('plan_code', 'basic_1m');
            if ($tenantId === '') {
                Response::error('422', 'tenant_id is required', 422);
            }
            $certificate = LicenseService::issue($tenantId, $planCode, [
                'interval_months' => $request->int('interval_months') ?: null,
                'status'          => $request->string('status', 'active'),
            ]);
            Response::ok(['certificate' => $certificate]);
        } catch (\InvalidArgumentException $e) {
            Response::error('422', $e->getMessage(), 422);
        }
    }

    /** POST /api/v1/office-license/activate */
    public static function activate(Request $request): void
    {
        Auth::requirePeer($request);
        $key = $request->string('license_key');
        $app = App::instance();
        $lic = $app->one('SELECT * FROM licenses WHERE license_key = ?', [$key]);
        if ($lic === null) {
            Response::error('404', 'Licence not found', 404);
        }
        $app->run(
            "UPDATE licenses SET status = IF(status = 'trial','trial','active'), activated_at = COALESCE(activated_at, NOW()), updated_at = NOW() WHERE id = ?",
            [$lic['id']]
        );
        Response::ok(['certificate' => LicenseService::certify($lic['id'])]);
    }

    /**
     * POST /api/v1/office-license/validate — the twice-daily heartbeat.
     * Accepts usage counts so the server decides caps, not the app.
     */
    public static function validate(Request $request): void
    {
        // The app proves itself with its licence key; peers may also call it.
        $key = $request->string('license_key');
        if ($key === '') {
            $key = (string) $request->header('X-License-Key', '');
        }
        if ($key === '') {
            Response::error('422', 'license_key is required', 422);
        }

        $usage = [
            'max_employees' => $request->int('employees', 0),
            'max_students'  => $request->int('students', 0),
            'storage_gb'    => $request->int('storage_gb', 0),
        ];

        $result = LicenseService::validate($key, $usage, $request->ip());
        $result['badge'] = self::badgeFor($result['tenant_id'] ?? null);
        Response::ok($result);
    }

    /** POST /api/v1/office-license/revoke */
    public static function revoke(Request $request): void
    {
        Auth::requireApiKey($request);
        $ok = LicenseService::revoke($request->string('license_key'), $request->string('reason', 'Revoked by operator'));
        $ok ? Response::ok(['revoked' => true]) : Response::error('404', 'Licence not found', 404);
    }

    /** POST /api/v1/office-license/suspend */
    public static function suspend(Request $request): void
    {
        Auth::requireApiKey($request);
        $ok = LicenseService::suspend($request->string('license_key'), $request->string('reason', 'Suspended'));
        $ok ? Response::ok(['suspended' => true]) : Response::error('404', 'Licence not found', 404);
    }

    /** POST /api/v1/office-license/renew */
    public static function renew(Request $request): void
    {
        Auth::requirePeer($request);
        $licenseKey = $request->string('license_key');
        $months = $request->int('interval_months', 1);
        $app = App::instance();
        $lic = $app->one('SELECT * FROM licenses WHERE license_key = ?', [$licenseKey]);
        if ($lic === null) {
            Response::error('404', 'Licence not found', 404);
        }
        $certificate = LicenseService::extend($lic['id'], $months, $request->string('plan_code') ?: null);
        Response::ok(['certificate' => $certificate]);
    }

    /** GET /api/v1/office-license/status?tenant_id=... */
    public static function status(Request $request): void
    {
        Auth::requirePeer($request);
        $tenantId = $request->string('tenant_id');
        if ($tenantId === '') {
            Response::error('422', 'tenant_id is required', 422);
        }
        try {
            $summary = TenantService::tenantSummary($tenantId);
            $summary['badge'] = self::badgeFor($tenantId);
            Response::ok($summary);
        } catch (\InvalidArgumentException $e) {
            Response::error('404', $e->getMessage(), 404);
        }
    }

    /** POST /api/v1/office-license/trial */
    public static function trial(Request $request): void
    {
        Auth::requirePeer($request);
        $tenantId = $request->string('tenant_id');
        $fingerprint = $request->string('fingerprint');
        if ($tenantId === '' || $fingerprint === '') {
            Response::error('422', 'tenant_id and fingerprint are required', 422);
        }
        $result = LicenseService::startTrial($tenantId, $fingerprint, [
            'user_id' => $request->string('user_id') ?: null,
            'msisdn'  => $request->string('msisdn') ?: null,
            'ip'      => $request->ip(),
        ]);
        Response::ok($result);
    }

    /** GET /api/v1/office-license/plans */
    public static function plans(Request $request): void
    {
        $plans = App::instance()->all('SELECT * FROM plans WHERE is_active = 1 ORDER BY sort_order');
        foreach ($plans as &$plan) {
            $plan['features'] = LicenseService::decodeFeatures($plan['features']);
            $plan['price'] = (float) $plan['price'];
        }
        Response::ok(['plans' => $plans, 'intervals' => LicenseService::INTERVALS]);
    }

    private static function badgeFor(?string $tenantId): ?array
    {
        if ($tenantId === null) {
            return null;
        }
        $app = App::instance();
        $company = $app->one(
            "SELECT id FROM kyc_records WHERE subject_type = 'tenant' AND subject_id = ? AND status = 'verified' LIMIT 1",
            [$tenantId]
        );
        if ($company !== null) {
            return ['type' => 'company', 'color' => 'gold', 'label' => 'Verified Company'];
        }
        return null;
    }
}
