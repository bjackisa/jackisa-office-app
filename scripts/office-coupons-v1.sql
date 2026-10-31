-- ============================================================================
-- office-coupons-v1.sql
-- ----------------------------------------------------------------------------
-- Office-side mirror of the licence hub's coupon system. The hub (lic) is the
-- authority on eligibility and pricing; these columns simply record what was
-- applied to a payment so the workspace ledger and receipts can show it without
-- calling back to the hub.
--
-- Additive and idempotent. Safe to run more than once.
-- ============================================================================

-- The coupon fields on a local payment row.
ALTER TABLE license_payments
  ADD COLUMN IF NOT EXISTS coupon_code     text,
  ADD COLUMN IF NOT EXISTS coupon_id       uuid,
  ADD COLUMN IF NOT EXISTS coupon_discount numeric(14,2) NOT NULL DEFAULT 0;

-- A light local cache of coupons the workspace has seen, so the billing page
-- can show a friendly name even if the hub is momentarily unreachable. The hub
-- remains authoritative; this is display-only and refreshed on each fetch.
CREATE TABLE IF NOT EXISTS coupon_cache (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_coupon_id   text UNIQUE NOT NULL,
  code            text,
  name            text NOT NULL,
  benefit_type    text,
  discount_percent numeric(5,2),
  discount_amount numeric(14,2),
  free_days       integer,
  duration        text,
  duration_cycles integer,
  audience_type   text,
  auto_apply      boolean NOT NULL DEFAULT false,
  status          text,
  expires_at      timestamptz,
  synced_at       timestamptz NOT NULL DEFAULT now()
);

-- Local record of a redemption, mirrored from the hub for reporting.
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_redemption_id text UNIQUE,
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  hub_coupon_id    text NOT NULL,
  code             text,
  plan_code        text,
  interval_months  integer,
  amount_before    numeric(14,2) NOT NULL DEFAULT 0,
  amount_after     numeric(14,2) NOT NULL DEFAULT 0,
  currency         text NOT NULL DEFAULT 'UGX',
  cycle_index      integer NOT NULL DEFAULT 1,
  payment_id       text,
  status           text NOT NULL DEFAULT 'redeemed',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_company ON coupon_redemptions(company_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_code ON coupon_redemptions(code);

-- RLS: a company sees only its own redemptions. The cache is platform-wide and
-- read-only to authenticated users.
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coupon_redemptions_member_select ON coupon_redemptions;
CREATE POLICY coupon_redemptions_member_select ON coupon_redemptions
  FOR SELECT USING (public.jo_is_company_member(company_id));

DROP POLICY IF EXISTS coupon_redemptions_service_write ON coupon_redemptions;
CREATE POLICY coupon_redemptions_service_write ON coupon_redemptions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

ALTER TABLE coupon_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coupon_cache_read ON coupon_cache;
CREATE POLICY coupon_cache_read ON coupon_cache
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
