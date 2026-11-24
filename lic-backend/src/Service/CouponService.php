<?php
declare(strict_types=1);

namespace Jackisa\Lic\Service;

use Jackisa\Lic\App;
use Jackisa\Lic\Support\Ids;

/**
 * Account-targeted coupons.
 *
 * A coupon answers two questions: *who* may use it, and *what it is worth*.
 * Eligibility is decided here against the live tenant record, so a campaign
 * like "new accounts", "legacy accounts" or "accounts in Uganda" is evaluated
 * by the hub rather than trusted from the client. Pricing is computed here too,
 * so the office app can display a quote but can never invent a discount.
 */
final class CouponService
{
    public const BENEFITS  = ['percent', 'amount', 'waiver', 'free_days'];
    public const DURATIONS = ['once', 'cycles', 'forever'];
    public const AUDIENCES = ['all', 'list', 'new', 'legacy', 'country', 'industry', 'kind', 'tier'];
    public const STATUSES  = ['draft', 'active', 'paused', 'archived'];

    /**
     * Create a coupon. Returns the stored row.
     * @param array<string,mixed> $params
     * @return array<string,mixed>
     */
    public static function create(array $params): array
    {
        $app = App::instance();
        $name = trim((string) ($params['name'] ?? ''));
        if ($name === '') {
            throw new \InvalidArgumentException('A coupon needs a name.');
        }

        $code = self::normalizeCode((string) ($params['code'] ?? ''));
        if ($code !== '' && $app->one('SELECT id FROM coupons WHERE code = ?', [$code]) !== null) {
            throw new \InvalidArgumentException('A coupon with that code already exists.');
        }

        $payload = self::validate($params);
        $id = Ids::uuid();

        $app->run(
            'INSERT INTO coupons
              (id, code, name, description, benefit_type, discount_percent, discount_amount, free_days,
               duration, duration_cycles, applies_plan_codes, applies_intervals,
               audience_type, audience_value, auto_apply, max_uses, max_uses_per_tenant,
               starts_at, expires_at, status, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                $id, $code !== '' ? $code : null, $name, $payload['description'],
                $payload['benefit_type'], $payload['discount_percent'], $payload['discount_amount'], $payload['free_days'],
                $payload['duration'], $payload['duration_cycles'],
                $payload['applies_plan_codes'], $payload['applies_intervals'],
                $payload['audience_type'], $payload['audience_value'], $payload['auto_apply'] ? 1 : 0,
                $payload['max_uses'], $payload['max_uses_per_tenant'],
                $payload['starts_at'], $payload['expires_at'], $payload['status'],
                $params['created_by'] ?? 'system',
            ]
        );

        // Explicit account list (audience_type = 'list').
        if ($payload['audience_type'] === 'list' && !empty($params['audience_tenant_ids']) && is_array($params['audience_tenant_ids'])) {
            self::setAudience($id, $params['audience_tenant_ids']);
        }

        self::audit('coupon.created', $id, ['code' => $code, 'name' => $name, 'audience' => $payload['audience_type']]);
        return self::present($app->one('SELECT * FROM coupons WHERE id = ?', [$id]));
    }

    /**
     * Update an existing coupon. Only the fields present are changed.
     * @param array<string,mixed> $params
     * @return array<string,mixed>
     */
    public static function update(string $couponId, array $params): array
    {
        $app = App::instance();
        $existing = $app->one('SELECT * FROM coupons WHERE id = ?', [$couponId]);
        if ($existing === null) {
            throw new \InvalidArgumentException('Unknown coupon.');
        }

        $merged = array_merge(self::present($existing), $params);
        $payload = self::validate($merged, $existing);

        $code = self::normalizeCode((string) ($merged['code'] ?? ''));
        if ($code !== '' && $code !== (string) $existing['code']) {
            if ($app->one('SELECT id FROM coupons WHERE code = ? AND id <> ?', [$code, $couponId]) !== null) {
                throw new \InvalidArgumentException('A coupon with that code already exists.');
            }
        }

        $app->run(
            'UPDATE coupons SET code=?, name=?, description=?, benefit_type=?, discount_percent=?, discount_amount=?,
                free_days=?, duration=?, duration_cycles=?, applies_plan_codes=?, applies_intervals=?,
                audience_type=?, audience_value=?, auto_apply=?, max_uses=?, max_uses_per_tenant=?,
                starts_at=?, expires_at=?, status=?, updated_at=NOW()
             WHERE id=?',
            [
                $code !== '' ? $code : null, $payload['name'], $payload['description'],
                $payload['benefit_type'], $payload['discount_percent'], $payload['discount_amount'], $payload['free_days'],
                $payload['duration'], $payload['duration_cycles'],
                $payload['applies_plan_codes'], $payload['applies_intervals'],
                $payload['audience_type'], $payload['audience_value'], $payload['auto_apply'] ? 1 : 0,
                $payload['max_uses'], $payload['max_uses_per_tenant'],
                $payload['starts_at'], $payload['expires_at'], $payload['status'],
                $couponId,
            ]
        );

        if ($payload['audience_type'] === 'list' && array_key_exists('audience_tenant_ids', $params) && is_array($params['audience_tenant_ids'])) {
            self::setAudience($couponId, $params['audience_tenant_ids']);
        }

        self::audit('coupon.updated', $couponId, ['status' => $payload['status']]);
        return self::present($app->one('SELECT * FROM coupons WHERE id = ?', [$couponId]));
    }

    /** Replace the explicit account list for a coupon. @param array<int,string> $tenantIds */
    public static function setAudience(string $couponId, array $tenantIds): void
    {
        $app = App::instance();
        $app->run('DELETE FROM coupon_audience WHERE coupon_id = ?', [$couponId]);
        $seen = [];
        foreach ($tenantIds as $tid) {
            $tid = trim((string) $tid);
            if ($tid === '' || isset($seen[$tid])) {
                continue;
            }
            $seen[$tid] = true;
            $app->run(
                'INSERT INTO coupon_audience (id, coupon_id, tenant_id) VALUES (?,?,?)',
                [Ids::uuid(), $couponId, $tid]
            );
        }
    }

    /** @return array<int,string> */
    public static function audienceTenants(string $couponId): array
    {
        return array_map(
            static fn(array $r): string => (string) $r['tenant_id'],
            App::instance()->all('SELECT tenant_id FROM coupon_audience WHERE coupon_id = ?', [$couponId])
        );
    }

    /**
     * Every coupon a tenant is eligible for right now, whether or not it needs
     * a code. Used by the office billing page to show what is available.
     * @return array<int,array<string,mixed>>
     */
    public static function availableFor(string $tenantId, ?string $planCode = null, ?int $intervalMonths = null): array
    {
        $app = App::instance();
        $rows = $app->all("SELECT * FROM coupons WHERE status = 'active' ORDER BY auto_apply DESC, created_at DESC");
        $out = [];
        foreach ($rows as $row) {
            $reason = self::ineligibleReason($row, $tenantId);
            if ($reason !== null) {
                continue;
            }
            $coupon = self::present($row);
            $coupon['audience_tenants'] = $coupon['audience_type'] === 'list' ? self::audienceTenants((string) $row['id']) : [];
            if ($planCode !== null) {
                $coupon['applies_to_selection'] = self::appliesToSelection($row, $planCode, $intervalMonths);
            }
            $out[] = $coupon;
        }
        return $out;
    }

    /**
     * Resolve a code (or the best auto-apply coupon) for a tenant and a plan
     * selection. Returns the coupon plus the price it produces, or null when
     * nothing applies.
     *
     * @return array{coupon:array<string,mixed>,price:array<string,mixed>}|null
     */
    public static function quote(string $tenantId, string $planCode, ?int $intervalMonths, ?string $code, float $baseAmount, string $currency = 'UGX'): ?array
    {
        $app = App::instance();

        $coupon = null;
        if ($code !== null && trim($code) !== '') {
            $normalized = self::normalizeCode($code);
            $row = $app->one('SELECT * FROM coupons WHERE code = ?', [$normalized]);
            if ($row === null) {
                throw new \InvalidArgumentException('That coupon code was not recognised.');
            }
            $reason = self::ineligibleReason($row, $tenantId, true);
            if ($reason !== null) {
                throw new \InvalidArgumentException($reason);
            }
            $selection = self::selectionReason($row, $planCode, $intervalMonths);
            if ($selection !== null) {
                throw new \InvalidArgumentException($selection);
            }
            $coupon = $row;
        } else {
            // Best auto-apply coupon: the one that saves the most.
            $candidates = $app->all("SELECT * FROM coupons WHERE status = 'active' AND auto_apply = 1");
            $best = null;
            $bestSaving = 0.0;
            foreach ($candidates as $row) {
                if (self::ineligibleReason($row, $tenantId) !== null) {
                    continue;
                }
                if (!self::appliesToSelection($row, $planCode, $intervalMonths)) {
                    continue;
                }
                $saving = self::saving($row, $baseAmount);
                if ($best === null || $saving > $bestSaving) {
                    $best = $row;
                    $bestSaving = $saving;
                }
            }
            $coupon = $best;
        }

        if ($coupon === null) {
            return null;
        }

        return [
            'coupon' => self::present($coupon),
            'price'  => self::price($coupon, $baseAmount, $currency),
        ];
    }

    /**
     * Apply a coupon: re-checks eligibility, records the redemption, increments
     * the use counters and returns the price the caller should charge. Called by
     * the payment path with the coupon the client selected.
     *
     * @param array<string,mixed> $coupon
     * @return array<string,mixed> the priced result
     */
    public static function redeem(array $coupon, string $tenantId, string $planCode, ?int $intervalMonths, float $baseAmount, string $currency = 'UGX'): array
    {
        $app = App::instance();
        $fresh = $app->one('SELECT * FROM coupons WHERE id = ?', [$coupon['id'] ?? '']);
        if ($fresh === null) {
            throw new \InvalidArgumentException('That coupon no longer exists.');
        }
        $reason = self::ineligibleReason($fresh, $tenantId, true);
        if ($reason !== null) {
            throw new \InvalidArgumentException($reason);
        }
        $selection = self::selectionReason($fresh, $planCode, $intervalMonths);
        if ($selection !== null) {
            throw new \InvalidArgumentException($selection);
        }

        $price = self::price($fresh, $baseAmount, $currency);
        $cycleIndex = self::redemptionCount((string) $fresh['id'], $tenantId) + 1;

        $app->run(
            'INSERT INTO coupon_redemptions
              (id, coupon_id, tenant_id, code, plan_code, interval_months, benefit_type, discount_percent,
               discount_amount, free_days, amount_before, amount_after, currency, cycle_index, status)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                Ids::uuid(), $fresh['id'], $tenantId, $fresh['code'], $planCode, $intervalMonths,
                $fresh['benefit_type'], $fresh['discount_percent'], $fresh['discount_amount'], (int) $fresh['free_days'],
                round($baseAmount, 2), $price['amount'], $currency, $cycleIndex, 'redeemed',
            ]
        );

        $app->run('UPDATE coupons SET current_uses = current_uses + 1, updated_at = NOW() WHERE id = ?', [$fresh['id']]);
        self::audit('coupon.redeemed', (string) $fresh['id'], [
            'tenant_id' => $tenantId, 'plan' => $planCode, 'before' => $baseAmount, 'after' => $price['amount'],
        ]);

        return $price + ['coupon_id' => $fresh['id'], 'coupon_code' => $fresh['code'], 'cycle_index' => $cycleIndex];
    }

    /**
     * Record the redemption for a charge that was actually paid. Partial
     * discounts never went through redeem() at initiation, so without this the
     * use counters and the redemption list stayed empty and a "once" coupon
     * could be spent again and again. Idempotent on payment_id.
     *
     * @param array<string,mixed> $payment
     */
    public static function recordPayment(array $payment): void
    {
        $couponId = (string) ($payment['coupon_id'] ?? '');
        $paymentId = (string) ($payment['id'] ?? '');
        if ($couponId === '' || $paymentId === '') {
            return;
        }

        $app = App::instance();
        if ($app->one('SELECT id FROM coupon_redemptions WHERE payment_id = ?', [$paymentId]) !== null) {
            return;
        }
        $coupon = $app->one('SELECT * FROM coupons WHERE id = ?', [$couponId]);
        if ($coupon === null) {
            return;
        }

        $tenantId = (string) ($payment['tenant_id'] ?? '');
        $after = round((float) ($payment['amount'] ?? 0), 2);
        $before = round($after + (float) ($payment['coupon_discount'] ?? 0), 2);
        $cycleIndex = self::redemptionCount($couponId, $tenantId) + 1;

        $app->run(
            'INSERT INTO coupon_redemptions
              (id, coupon_id, tenant_id, code, plan_code, interval_months, benefit_type, discount_percent,
               discount_amount, free_days, amount_before, amount_after, currency, cycle_index, payment_id, status)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                Ids::uuid(), $couponId, $tenantId, $coupon['code'],
                $payment['plan_code'] ?? null, $payment['interval_months'] ?? null,
                $coupon['benefit_type'], $coupon['discount_percent'], $coupon['discount_amount'], (int) $coupon['free_days'],
                $before, $after, (string) ($payment['currency'] ?? 'UGX'), $cycleIndex, $paymentId, 'redeemed',
            ]
        );
        $app->run('UPDATE coupons SET current_uses = current_uses + 1, updated_at = NOW() WHERE id = ?', [$couponId]);
        self::audit('coupon.redeemed', $couponId, [
            'tenant_id' => $tenantId, 'payment_id' => $paymentId, 'plan' => $payment['plan_code'] ?? null,
            'before' => $before, 'after' => $after,
        ]);
    }

    /**
     * Compute the price after a coupon. A 'cycles' coupon only discounts while
     * the tenant is inside its allowance; after that the full price applies.
     * @param array<string,mixed> $coupon
     * @return array<string,mixed>
     */
    public static function price(array $coupon, float $baseAmount, string $currency = 'UGX'): array
    {
        $base = round(max(0.0, $baseAmount), 2);
        $percent = (float) ($coupon['discount_percent'] ?? 0);
        $flat = (float) ($coupon['discount_amount'] ?? 0);
        $freeDays = (int) ($coupon['free_days'] ?? 0);
        $type = (string) ($coupon['benefit_type'] ?? 'percent');

        $discount = 0.0;
        $extraDays = 0;
        if ($type === 'waiver') {
            $discount = $base;
        } elseif ($type === 'percent') {
            $discount = $base * (min(max($percent, 0), 100) / 100);
        } elseif ($type === 'amount') {
            $discount = min($base, max($flat, 0));
        } elseif ($type === 'free_days') {
            $extraDays = max($freeDays, 0);
        }

        $discount = round(min($discount, $base), 2);
        $amount = round($base - $discount, 2);

        return [
            'amount'         => $amount,
            'base_amount'    => $base,
            'discount'       => $discount,
            'extra_days'     => $extraDays,
            'currency'       => strtoupper($currency),
            'is_free'        => $amount <= 0.0,
            'benefit_type'   => $type,
        ];
    }

    /** How much a coupon saves on a base amount (for picking the best auto coupon). */
    private static function saving(array $coupon, float $baseAmount): float
    {
        return (float) self::price($coupon, $baseAmount)['discount'];
    }

    /** Number of times a tenant has already redeemed a coupon. */
    private static function redemptionCount(string $couponId, string $tenantId): int
    {
        $row = App::instance()->one(
            "SELECT COUNT(*) AS n FROM coupon_redemptions WHERE coupon_id = ? AND tenant_id = ? AND status <> 'reversed'",
            [$couponId, $tenantId]
        );
        return (int) ($row['n'] ?? 0);
    }

    /**
     * Why a tenant may not use a coupon, or null when they may. When $strict,
     * the reason is a message fit to show the user.
     */
    public static function ineligibleReason(array $coupon, string $tenantId, bool $strict = false): ?string
    {
        $app = App::instance();
        $now = date('Y-m-d H:i:s');

        if (($coupon['status'] ?? '') !== 'active') {
            return $strict ? 'That coupon is not active.' : 'not_active';
        }
        if (!empty($coupon['starts_at']) && $coupon['starts_at'] > $now) {
            return $strict ? 'That coupon is not active yet.' : 'not_started';
        }
        if (!empty($coupon['expires_at']) && $coupon['expires_at'] < $now) {
            return $strict ? 'That coupon has expired.' : 'expired';
        }
        if ($coupon['max_uses'] !== null && (int) $coupon['current_uses'] >= (int) $coupon['max_uses']) {
            return $strict ? 'That coupon has reached its usage limit.' : 'exhausted';
        }
        $used = self::redemptionCount((string) $coupon['id'], $tenantId);
        $duration = (string) ($coupon['duration'] ?? 'once');
        $cycles = max(1, (int) ($coupon['duration_cycles'] ?? 1));
        $allowed = match ($duration) {
            'forever' => null,
            'cycles'  => $cycles,
            default   => 1,
        };
        if ($allowed !== null && $used >= $allowed) {
            return $strict
                ? ($duration === 'once'
                    ? 'That coupon has already been used for this account.'
                    : "That coupon has used all {$cycles} payments it covers for this account.")
                : 'already_used';
        }

        // Older coupons were minted with the console's old default of 1 even
        // when the operator chose "every payment" or a multi-cycle run. Treat
        // that stale default as unlimited and let duration govern; an explicit
        // higher cap is still honoured.
        $perTenant = (int) ($coupon['max_uses_per_tenant'] ?? 0);
        if ($perTenant === 1 && $duration !== 'once') {
            $perTenant = 0;
        }
        if ($perTenant > 0 && $used >= $perTenant) {
            return $strict ? 'That coupon has reached its per-account limit.' : 'already_used';
        }

        $tenant = $app->one('SELECT * FROM tenants WHERE id = ?', [$tenantId]);
        if ($tenant === null) {
            return $strict ? 'We could not find your workspace.' : 'no_tenant';
        }

        $audience = (string) ($coupon['audience_type'] ?? 'all');
        $value = self::decodeValue($coupon['audience_value'] ?? null);

        switch ($audience) {
            case 'all':
                return null;

            case 'list':
                $inList = $app->one(
                    'SELECT id FROM coupon_audience WHERE coupon_id = ? AND tenant_id = ?',
                    [$coupon['id'], $tenantId]
                );
                return $inList !== null ? null : ($strict ? 'That coupon is not available for this account.' : 'not_in_list');

            case 'new':
                // "New" = the workspace has never paid and is inside the grace
                // window from its creation (default 30 days).
                $maxDays = (int) ($value['max_days'] ?? 30);
                $paid = $app->one(
                    "SELECT COUNT(*) AS n FROM payments WHERE tenant_id = ? AND status = 'paid'",
                    [$tenantId]
                );
                if ((int) ($paid['n'] ?? 0) > 0) {
                    return $strict ? 'That coupon is only for new accounts.' : 'not_new';
                }
                $ageDays = (time() - strtotime((string) $tenant['created_at'])) / 86400;
                return $ageDays <= $maxDays ? null : ($strict ? 'That coupon is only for new accounts.' : 'not_new');

            case 'legacy':
                // "Legacy" = the workspace predates a cut-off date.
                $before = (string) ($value['before'] ?? '2025-01-01');
                return strtotime((string) $tenant['created_at']) < strtotime($before)
                    ? null
                    : ($strict ? 'That coupon is only for legacy accounts.' : 'not_legacy');

            case 'country':
                $countries = array_map('strtoupper', array_map('trim', (array) ($value['countries'] ?? [])));
                return in_array(strtoupper((string) $tenant['country']), $countries, true)
                    ? null
                    : ($strict ? 'That coupon is not available in your country.' : 'not_country');

            case 'industry':
                $industries = array_map('strtolower', array_map('trim', (array) ($value['industries'] ?? [])));
                return in_array(strtolower((string) $tenant['industry']), $industries, true)
                    ? null
                    : ($strict ? 'That coupon is not available for your industry.' : 'not_industry');

            case 'kind':
                $kinds = array_map('strtolower', array_map('trim', (array) ($value['kinds'] ?? [])));
                return in_array(strtolower((string) $tenant['kind']), $kinds, true)
                    ? null
                    : ($strict ? 'That coupon is not available for this account type.' : 'not_kind');

            case 'tier':
                $tiers = array_map('strtolower', array_map('trim', (array) ($value['tiers'] ?? [])));
                $lic = $app->one('SELECT tier FROM licenses WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1', [$tenantId]);
                $tier = strtolower((string) ($lic['tier'] ?? ''));
                return in_array($tier, $tiers, true)
                    ? null
                    : ($strict ? 'That coupon is not available on your current plan.' : 'not_tier');
        }

        return $strict ? 'That coupon is not available for this account.' : 'not_available';
    }

    /**
     * Why the coupon does not fit this plan/interval selection, or null when it
     * does. A value in applies_plan_codes is either an exact plan code
     * ("pro_12m") or a package family ("pro"); operators think in packages, so
     * a package-level restriction must cover every billing interval of it.
     */
    private static function selectionReason(array $coupon, string $planCode, ?int $intervalMonths): ?string
    {
        $planCode = strtolower(trim($planCode));
        $plans = array_values(array_filter(array_map(
            static fn($v): string => strtolower(trim((string) $v)),
            self::decodeValue($coupon['applies_plan_codes'] ?? null)
        ), static fn(string $v): bool => $v !== ''));

        if (!empty($plans) && $planCode !== '' && !self::planAllowed($plans, $planCode)) {
            $labels = array_map(static fn(string $p): string => ucfirst($p), $plans);
            return 'That coupon is only valid on the ' . implode(', ', $labels) . ' plan.';
        }

        $intervals = array_values(array_filter(array_map(
            'intval',
            self::decodeValue($coupon['applies_intervals'] ?? null)
        ), static fn(int $v): bool => $v > 0));
        if (!empty($intervals)) {
            $interval = $intervalMonths ?? self::intervalFromPlanCode($planCode);
            if ($interval !== null && !in_array($interval, $intervals, true)) {
                $labels = array_map(static fn(int $m): string => $m . '-month', $intervals);
                return 'That coupon is only valid for ' . implode(', ', $labels) . ' billing.';
            }
        }

        return null;
    }

    /** Does the coupon allow this plan/interval selection? */
    private static function appliesToSelection(array $coupon, string $planCode, ?int $intervalMonths): bool
    {
        return self::selectionReason($coupon, $planCode, $intervalMonths) === null;
    }

    /** @param array<int,string> $allowed lower-cased codes or package families */
    private static function planAllowed(array $allowed, string $planCode): bool
    {
        foreach ($allowed as $entry) {
            if ($entry === $planCode
                || str_starts_with($planCode, $entry . '_')
                || str_starts_with($planCode, $entry . '-')) {
                return true;
            }
        }
        return false;
    }

    /** Pull the billing interval out of a plan code such as "pro_12m". */
    private static function intervalFromPlanCode(string $planCode): ?int
    {
        if (preg_match('/(\d{1,2})m$/i', trim($planCode), $m)) {
            return (int) $m[1];
        }
        return null;
    }

    /** @param array<string,mixed> $params @return array<string,mixed> */
    private static function validate(array $params, ?array $existing = null): array
    {
        $benefit = strtolower((string) ($params['benefit_type'] ?? 'percent'));
        if (!in_array($benefit, self::BENEFITS, true)) {
            throw new \InvalidArgumentException('benefit_type must be one of: ' . implode(', ', self::BENEFITS));
        }
        $duration = strtolower((string) ($params['duration'] ?? 'once'));
        if (!in_array($duration, self::DURATIONS, true)) {
            throw new \InvalidArgumentException('duration must be one of: ' . implode(', ', self::DURATIONS));
        }
        $audience = strtolower((string) ($params['audience_type'] ?? 'all'));
        if (!in_array($audience, self::AUDIENCES, true)) {
            throw new \InvalidArgumentException('audience_type must be one of: ' . implode(', ', self::AUDIENCES));
        }
        $status = strtolower((string) ($params['status'] ?? 'draft'));
        if (!in_array($status, self::STATUSES, true)) {
            throw new \InvalidArgumentException('status must be one of: ' . implode(', ', self::STATUSES));
        }

        $percent = round((float) ($params['discount_percent'] ?? 0), 2);
        $amount = round((float) ($params['discount_amount'] ?? 0), 2);
        $freeDays = (int) ($params['free_days'] ?? 0);
        if ($benefit === 'percent' && ($percent < 0 || $percent > 100)) {
            throw new \InvalidArgumentException('discount_percent must be between 0 and 100.');
        }
        if ($benefit === 'amount' && $amount < 0) {
            throw new \InvalidArgumentException('discount_amount cannot be negative.');
        }
        if ($benefit === 'free_days' && $freeDays <= 0) {
            throw new \InvalidArgumentException('free_days must be greater than zero.');
        }
        // A waiver is a 100% percent coupon, kept consistent for display.
        if ($benefit === 'waiver') {
            $percent = 100.0;
        }

        $cycles = max(1, (int) ($params['duration_cycles'] ?? 1));
        $maxUses = $params['max_uses'] === null || $params['max_uses'] === '' ? null : max(0, (int) $params['max_uses']);
        $perTenant = max(0, (int) ($params['max_uses_per_tenant'] ?? 1));

        $startsAt = self::normalizeDate($params['starts_at'] ?? null);
        $expiresAt = self::normalizeDate($params['expires_at'] ?? null);
        if ($startsAt !== null && $expiresAt !== null && $expiresAt < $startsAt) {
            throw new \InvalidArgumentException('The expiry date must be after the start date.');
        }

        return [
            'name'               => trim((string) ($params['name'] ?? ($existing['name'] ?? ''))),
            'description'        => trim((string) ($params['description'] ?? ($existing['description'] ?? ''))) ?: null,
            'benefit_type'       => $benefit,
            'discount_percent'   => $percent,
            'discount_amount'    => $amount,
            'free_days'          => $freeDays,
            'duration'           => $duration,
            'duration_cycles'    => $cycles,
            'applies_plan_codes' => self::encodeList($params['applies_plan_codes'] ?? null),
            'applies_intervals'  => self::encodeList($params['applies_intervals'] ?? null),
            'audience_type'      => $audience,
            'audience_value'     => self::encodeValue($audience, $params['audience_value'] ?? null),
            'auto_apply'         => !empty($params['auto_apply']),
            'max_uses'           => $maxUses,
            'max_uses_per_tenant' => $perTenant,
            'starts_at'          => $startsAt,
            'expires_at'         => $expiresAt,
            'status'             => $status,
        ];
    }

    /** Normalise an audience value into a JSON blob shaped for its type. */
    private static function encodeValue(string $audience, mixed $value): ?string
    {
        if ($audience === 'all' || $audience === 'list') {
            return null;
        }
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (is_array($decoded)) {
                $value = $decoded;
            } elseif ($value !== '') {
                $value = [$value];
            }
        }
        if (!is_array($value)) {
            $value = [];
        }
        $value = array_values(array_filter(array_map(static fn($v) => is_scalar($v) ? trim((string) $v) : '', $value), static fn($v) => $v !== ''));

        $shape = match ($audience) {
            'new'      => ['max_days' => max(1, (int) ($value[0] ?? 30))],
            'legacy'   => ['before' => (string) ($value[0] ?? '2025-01-01')],
            'country'  => ['countries' => $value],
            'industry' => ['industries' => $value],
            'kind'     => ['kinds' => $value],
            'tier'     => ['tiers' => $value],
            default    => [],
        };
        return $shape === [] ? null : json_encode($shape, JSON_UNESCAPED_SLASHES);
    }

    /** @return array<string,mixed> */
    private static function decodeValue(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }
        if (is_string($value) && $value !== '') {
            $decoded = json_decode($value, true);
            return is_array($decoded) ? $decoded : [];
        }
        return [];
    }

    private static function encodeList(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (is_array($decoded)) {
                $value = $decoded;
            } else {
                $value = array_map('trim', explode(',', $value));
            }
        }
        if (!is_array($value)) {
            return null;
        }
        $value = array_values(array_filter(array_map(static fn($v) => trim((string) $v), $value), static fn($v) => $v !== ''));
        return $value === [] ? null : json_encode($value, JSON_UNESCAPED_SLASHES);
    }

    private static function normalizeDate(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $ts = strtotime((string) $value);
        return $ts === false ? null : date('Y-m-d H:i:s', $ts);
    }

    private static function normalizeCode(string $code): string
    {
        return strtoupper(preg_replace('/[^A-Za-z0-9_-]+/', '', trim($code)) ?? '');
    }

    /** Shape a coupon row for the API, decoding JSON columns. */
    public static function present(?array $row): array
    {
        if ($row === null) {
            return [];
        }
        $row['discount_percent'] = (float) $row['discount_percent'];
        $row['discount_amount'] = (float) $row['discount_amount'];
        $row['free_days'] = (int) $row['free_days'];
        $row['duration_cycles'] = (int) $row['duration_cycles'];
        $row['auto_apply'] = (bool) $row['auto_apply'];
        $row['max_uses'] = $row['max_uses'] === null ? null : (int) $row['max_uses'];
        $row['max_uses_per_tenant'] = (int) $row['max_uses_per_tenant'];
        $row['current_uses'] = (int) $row['current_uses'];
        $row['applies_plan_codes'] = self::decodeValue($row['applies_plan_codes'] ?? null) ?: null;
        $row['applies_intervals'] = self::decodeValue($row['applies_intervals'] ?? null) ?: null;
        $row['audience_value'] = self::decodeValue($row['audience_value'] ?? null) ?: null;
        return $row;
    }

    private static function audit(string $action, string $entityId, array $details = []): void
    {
        try {
            App::instance()->run(
                'INSERT INTO audit_log (actor_type, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)',
                ['system', $action, 'coupon', $entityId, json_encode($details, JSON_UNESCAPED_SLASHES)]
            );
        } catch (\Throwable $e) {
            // Audit must never break the operation it records.
        }
    }
}
