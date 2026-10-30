-- ============================================================================
-- 003_trial_plan.sql
-- ----------------------------------------------------------------------------
-- Remember the plan a visitor chose when they start a free trial, so the
-- automatic charge at the end of the trial matches that choice (previously it
-- was hard-coded to pro_1m). Additive and idempotent.
-- ============================================================================

ALTER TABLE trials
  ADD COLUMN IF NOT EXISTS plan_code VARCHAR(60) DEFAULT NULL AFTER msisdn,
  ADD COLUMN IF NOT EXISTS interval_months TINYINT DEFAULT NULL AFTER plan_code;
