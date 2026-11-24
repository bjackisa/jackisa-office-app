-- ============================================================================
-- 009_coupon_usage_defaults.sql
-- ----------------------------------------------------------------------------
-- A coupon duration already says how many payments it covers. The old
-- per-account default of 1 silently turned "every payment" and multi-cycle
-- coupons into one-shot coupons, so new rows default to unlimited and the
-- duration governs.
--
-- Additive and idempotent.
-- ============================================================================

ALTER TABLE coupons ALTER COLUMN max_uses_per_tenant SET DEFAULT 0;
