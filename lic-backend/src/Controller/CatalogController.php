<?php
declare(strict_types=1);

namespace Jackisa\Lic\Controller;

use Jackisa\Lic\App;
use Jackisa\Lic\Http\Request;
use Jackisa\Lic\Http\Response;
use Jackisa\Lic\Middleware\Auth;
use Jackisa\Lic\Service\LicenseService;
use Jackisa\Lic\Support\Ids;

/**
 * /api/v1/admin — the package/plan and feature catalogue.
 *
 * This is how new packages and modules are added to Jackisa Office without a
 * code change: an operator creates a plan (tier + price + caps + feature flags)
 * or a feature (slug + minimum tier), and every peer picks it up on the next
 * sync. Writes require an API key carrying the `admin` scope.
 */
final class CatalogController
{
    private const TIERS = ['basic', 'pro', 'platinum', 'enterprise'];
    private const INTERVALS = [1, 3, 6, 12, 24, 36];

    /** POST /api/v1/admin/plans */
    public static function plans(Request $request): void
    {
        self::requireAdmin($request);
        $action = $request->string('action', 'list');
        $app = App::instance();

        switch ($action) {
            case 'list':
                $rows = $app->all('SELECT * FROM plans ORDER BY sort_order, tier, interval_months');
                Response::ok(['plans' => array_map([self::class, 'presentPlan'], $rows)]);
                return;

            case 'create':
                $code = self::slug($request->string('code'));
                if ($code === '') {
                    Response::error('422', 'code is required', 422);
                }
                if ($app->one('SELECT id FROM plans WHERE code = ?', [$code]) !== null) {
                    Response::error('409', 'A plan with that code already exists', 409);
                }
                $plan = self::planPayload($request, $code);
                $app->run(
                    'INSERT INTO plans (id, code, name, tier, interval_months, price, currency,
                        max_employees, max_students, storage_gb, features, is_active, sort_order)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    [
                        Ids::uuid(), $code, $plan['name'], $plan['tier'], $plan['interval_months'],
                        $plan['price'], $plan['currency'], $plan['max_employees'], $plan['max_students'],
                        $plan['storage_gb'], json_encode($plan['features']), $plan['is_active'] ? 1 : 0,
                        $plan['sort_order'],
                    ]
                );
                Response::ok(['plan' => self::presentPlan($app->one('SELECT * FROM plans WHERE code = ?', [$code]))]);
                return;

            case 'update':
                $code = self::slug($request->string('code'));
                $existing = $app->one('SELECT * FROM plans WHERE code = ?', [$code]);
                if ($existing === null) {
                    Response::error('404', 'Plan not found', 404);
                }
                $plan = self::planPayload($request, $code, $existing);
                $app->run(
                    'UPDATE plans SET name=?, tier=?, interval_months=?, price=?, currency=?,
                        max_employees=?, max_students=?, storage_gb=?, features=?, is_active=?, sort_order=?,
                        updated_at=NOW() WHERE code=?',
                    [
                        $plan['name'], $plan['tier'], $plan['interval_months'], $plan['price'], $plan['currency'],
                        $plan['max_employees'], $plan['max_students'], $plan['storage_gb'],
                        json_encode($plan['features']), $plan['is_active'] ? 1 : 0, $plan['sort_order'], $code,
                    ]
                );
                Response::ok(['plan' => self::presentPlan($app->one('SELECT * FROM plans WHERE code = ?', [$code]))]);
                return;

            case 'deactivate':
                $code = self::slug($request->string('code'));
                $app->run('UPDATE plans SET is_active = 0, updated_at = NOW() WHERE code = ?', [$code]);
                Response::ok(['deactivated' => $code]);
                return;

            default:
                Response::error('422', 'Unknown action', 422);
        }
    }

    /** POST /api/v1/admin/features */
    public static function features(Request $request): void
    {
        self::requireAdmin($request);
        $action = $request->string('action', 'list');
        $app = App::instance();

        switch ($action) {
            case 'list':
                Response::ok(['features' => $app->all('SELECT * FROM features ORDER BY category, slug')]);
                return;

            case 'create':
            case 'update':
                $slug = self::slug($request->string('slug'));
                if ($slug === '') {
                    Response::error('422', 'slug is required', 422);
                }
                $name = $request->string('name', ucwords(str_replace('_', ' ', $slug)));
                $category = $request->string('category', 'core');
                $minTier = strtolower($request->string('min_tier', 'basic'));
                if (!in_array($minTier, self::TIERS, true)) {
                    Response::error('422', 'min_tier must be one of: ' . implode(', ', self::TIERS), 422);
                }
                $isActive = $request->bool('is_active', true) ? 1 : 0;

                if ($app->one('SELECT id FROM features WHERE slug = ?', [$slug]) !== null) {
                    $app->run(
                        'UPDATE features SET name=?, category=?, min_tier=?, is_active=? WHERE slug=?',
                        [$name, $category, $minTier, $isActive, $slug]
                    );
                } else {
                    $app->run(
                        'INSERT INTO features (id, slug, name, category, min_tier, is_active) VALUES (?,?,?,?,?,?)',
                        [Ids::uuid(), $slug, $name, $category, $minTier, $isActive]
                    );
                }
                Response::ok(['feature' => $app->one('SELECT * FROM features WHERE slug = ?', [$slug])]);
                return;

            case 'deactivate':
                $slug = self::slug($request->string('slug'));
                $app->run('UPDATE features SET is_active = 0 WHERE slug = ?', [$slug]);
                Response::ok(['deactivated' => $slug]);
                return;

            default:
                Response::error('422', 'Unknown action', 422);
        }
    }

    private static function requireAdmin(Request $request): void
    {
        Auth::requireApiKey($request);
        if (!in_array('admin', Auth::scopes(), true)) {
            Response::error('403', 'This API key is not allowed to manage the catalogue', 403);
        }
    }

    /** @param array<string,mixed> $row */
    private static function presentPlan(array $row): array
    {
        $row['features'] = LicenseService::decodeFeatures($row['features']);
        $row['price'] = (float) $row['price'];
        $row['is_active'] = (bool) $row['is_active'];
        return $row;
    }

    /**
     * Validate and normalise a plan payload. Missing fields fall back to the
     * existing row (on update) or sensible defaults (on create).
     * @param array<string,mixed>|null $existing
     * @return array<string,mixed>
     */
    private static function planPayload(Request $request, string $code, ?array $existing = null): array
    {
        $tier = strtolower($request->string('tier', (string) ($existing['tier'] ?? 'basic')));
        if (!in_array($tier, self::TIERS, true)) {
            Response::error('422', 'tier must be one of: ' . implode(', ', self::TIERS), 422);
        }
        $interval = $request->int('interval_months', (int) ($existing['interval_months'] ?? 1));
        if (!in_array($interval, self::INTERVALS, true)) {
            Response::error('422', 'interval_months must be one of: ' . implode(', ', self::INTERVALS), 422);
        }
        $price = $request->input('price');
        $price = $price === null ? (float) ($existing['price'] ?? 0) : (float) $price;
        if ($price < 0) {
            Response::error('422', 'price cannot be negative', 422);
        }
        $features = $request->input('features');
        if (!is_array($features)) {
            $features = $existing ? LicenseService::decodeFeatures($existing['features']) : [];
        }

        return [
            'name'           => $request->string('name', (string) ($existing['name'] ?? $code)),
            'tier'           => $tier,
            'interval_months' => $interval,
            'price'          => $price,
            'currency'       => strtoupper($request->string('currency', (string) ($existing['currency'] ?? 'UGX'))),
            'max_employees'  => max(0, $request->int('max_employees', (int) ($existing['max_employees'] ?? 10))),
            'max_students'   => max(0, $request->int('max_students', (int) ($existing['max_students'] ?? 0))),
            'storage_gb'     => max(0, $request->int('storage_gb', (int) ($existing['storage_gb'] ?? 5))),
            'features'       => $features,
            'is_active'      => $request->input('is_active') === null
                ? (bool) ($existing['is_active'] ?? true)
                : $request->bool('is_active', true),
            'sort_order'     => $request->int('sort_order', (int) ($existing['sort_order'] ?? 100)),
        ];
    }

    private static function slug(string $value): string
    {
        $value = strtolower(trim($value));
        return preg_replace('/[^a-z0-9_]+/', '_', $value) ?? '';
    }
}
