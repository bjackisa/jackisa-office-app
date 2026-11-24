<?php
declare(strict_types=1);

namespace Jackisa\Lic\Controller;

use Jackisa\Lic\App;
use Jackisa\Lic\Http\Request;
use Jackisa\Lic\Http\Response;
use Jackisa\Lic\Middleware\Auth;
use Jackisa\Lic\Service\CouponService;
use Jackisa\Lic\Service\LicenseService;

/**
 * /api/v1/coupons — account-targeted coupons for the office plans.
 *
 * Reads are peer-signed (the office app asks "what is available for this
 * account, and what would it cost?"). Writes require an admin API key, so only
 * the operator console can mint or retire a coupon.
 */
final class CouponController
{
    /** POST /api/v1/coupons/available — { tenant_id, plan_code?, interval_months? } */
    public static function available(Request $request): void
    {
        Auth::requirePeer($request);
        $tenantId = $request->string('tenant_id');
        if ($tenantId === '') {
            Response::error('422', 'tenant_id is required', 422);
        }
        Response::ok([
            'coupons' => CouponService::availableFor(
                $tenantId,
                $request->string('plan_code') ?: null,
                $request->int('interval_months') ?: null
            ),
        ]);
    }

    /** POST /api/v1/coupons/validate — { tenant_id, code, plan_code?, interval_months?, amount } */
    public static function validate(Request $request): void
    {
        Auth::requirePeer($request);
        $tenantId = $request->string('tenant_id');
        $code = $request->string('code');
        $amount = $request->float('amount');
        if ($tenantId === '' || $code === '') {
            Response::error('422', 'tenant_id and code are required', 422);
        }
        try {
            $result = CouponService::quote(
                $tenantId,
                $request->string('plan_code'),
                $request->int('interval_months') ?: null,
                $code,
                $amount
            );
            if ($result === null) {
                Response::error('404', 'That coupon is not available for this account.', 404);
            }
            Response::ok($result);
        } catch (\InvalidArgumentException $e) {
            Response::error('422', $e->getMessage(), 422);
        }
    }

    /** POST /api/v1/coupons/quote — best auto-apply coupon for a selection. */
    public static function quote(Request $request): void
    {
        Auth::requirePeer($request);
        $tenantId = $request->string('tenant_id');
        if ($tenantId === '') {
            Response::error('422', 'tenant_id is required', 422);
        }
        try {
            $result = CouponService::quote(
                $tenantId,
                $request->string('plan_code'),
                $request->int('interval_months') ?: null,
                $request->string('code') ?: null,
                $request->float('amount')
            );
            Response::ok(['quote' => $result]);
        } catch (\InvalidArgumentException $e) {
            Response::error('422', $e->getMessage(), 422);
        }
    }

    /** POST /api/v1/admin/coupons — list/create/update/archive (admin key). */
    public static function admin(Request $request): void
    {
        Auth::requireApiKey($request);
        if (!in_array('admin', Auth::scopes(), true)) {
            Response::error('403', 'This API key is not allowed to manage coupons', 403);
        }
        $action = $request->string('action', 'list');
        $app = App::instance();

        try {
            switch ($action) {
                case 'list':
                    $rows = $app->all('SELECT * FROM coupons ORDER BY created_at DESC');
                    $coupons = array_map(static function (array $row): array {
                        $coupon = CouponService::present($row);
                        $coupon['audience_tenants'] = $coupon['audience_type'] === 'list'
                            ? CouponService::audienceTenants((string) $row['id'])
                            : [];
                        return $coupon;
                    }, $rows);
                    Response::ok(['coupons' => $coupons]);
                    return;

                case 'get':
                    $row = $app->one('SELECT * FROM coupons WHERE id = ? OR code = ?', [
                        $request->string('id'), $request->string('code'),
                    ]);
                    if ($row === null) {
                        Response::error('404', 'Coupon not found', 404);
                    }
                    $coupon = CouponService::present($row);
                    $coupon['audience_tenants'] = CouponService::audienceTenants((string) $row['id']);
                    Response::ok(['coupon' => $coupon]);
                    return;

                case 'create':
                    Response::ok(['coupon' => CouponService::create(self::payload($request))]);
                    return;

                case 'update':
                    $id = $request->string('id');
                    if ($id === '') {
                        Response::error('422', 'id is required', 422);
                    }
                    Response::ok(['coupon' => CouponService::update($id, self::payload($request))]);
                    return;

                case 'archive':
                case 'deactivate':
                    $id = $request->string('id');
                    if ($id === '') {
                        Response::error('422', 'id is required', 422);
                    }
                    $app->run("UPDATE coupons SET status = 'archived', updated_at = NOW() WHERE id = ?", [$id]);
                    Response::ok(['archived' => $id]);
                    return;

                case 'redemptions':
                    $couponId = $request->string('id');
                    $rows = $couponId !== ''
                        ? $app->all('SELECT * FROM coupon_redemptions WHERE coupon_id = ? ORDER BY created_at DESC LIMIT 200', [$couponId])
                        : $app->all('SELECT * FROM coupon_redemptions ORDER BY created_at DESC LIMIT 200');
                    Response::ok(['redemptions' => $rows]);
                    return;

                default:
                    Response::error('422', 'Unknown action', 422);
            }
        } catch (\InvalidArgumentException $e) {
            Response::error('422', $e->getMessage(), 422);
        }
    }

    /**
     * The coupon fields from a request. audience_tenant_ids is passed through
     * untouched so an explicit account list can be set in one call.
     * @return array<string,mixed>
     */
    private static function payload(Request $request): array
    {
        $keys = [
            'name', 'code', 'description', 'benefit_type', 'discount_percent', 'discount_amount', 'free_days',
            'duration', 'duration_cycles', 'applies_plan_codes', 'applies_intervals',
            'audience_type', 'audience_value', 'auto_apply', 'max_uses', 'max_uses_per_tenant',
            'starts_at', 'expires_at', 'status', 'audience_tenant_ids',
        ];
        $out = [];
        foreach ($keys as $key) {
            $value = $request->input($key);
            if ($value !== null) {
                $out[$key] = $value;
            }
        }
        return $out;
    }
}
