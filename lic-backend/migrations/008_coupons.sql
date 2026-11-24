-- ============================================================================
-- 008_coupons.sql
-- ----------------------------------------------------------------------------
-- Account-targeted coupons for Jackisa Office plans.
--
-- A coupon is a campaign, not a code: it carries who may use it (a specific
-- account, a list of accounts, or a group such as new accounts, legacy
-- accounts, accounts in Uganda, an industry, a workspace kind or a tier), what
-- it is worth (percent off, a flat amount off, a full waiver, or extra free
-- days), how long the benefit lasts (a single cycle, N cycles, or forever),
-- and when it expires. Auto-apply coupons need no code at all.
--
-- The hub is the authority: it decides eligibility, computes the discounted
-- price and records every redemption. The office app mirrors the outcome so
-- the workspace can show what was applied without trusting the client.
--
-- Additive and idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS coupons (
  id                 CHAR(36)      NOT NULL,
  code               VARCHAR(60)   DEFAULT NULL,
  name               VARCHAR(160)  NOT NULL,
  description        VARCHAR(500)  DEFAULT NULL,

  -- What the coupon is worth. A waiver is discount_percent = 100.
  benefit_type       ENUM('percent','amount','waiver','free_days') NOT NULL DEFAULT 'percent',
  discount_percent   DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  discount_amount    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  free_days          INT           NOT NULL DEFAULT 0,

  -- How long the benefit lasts once redeemed.
  duration           ENUM('once','cycles','forever') NOT NULL DEFAULT 'once',
  duration_cycles    INT           NOT NULL DEFAULT 1,

  -- Scope: which plans and intervals the coupon may be used on. NULL = any.
  applies_plan_codes LONGTEXT      DEFAULT NULL,
  applies_intervals  LONGTEXT      DEFAULT NULL,

  -- Who may redeem it.
  audience_type      ENUM('all','list','new','legacy','country','industry','kind','tier')
                     NOT NULL DEFAULT 'all',
  audience_value     LONGTEXT      DEFAULT NULL,
  auto_apply         TINYINT(1)    NOT NULL DEFAULT 0,

  -- Limits and window.
  max_uses           INT           DEFAULT NULL,
  max_uses_per_tenant INT          NOT NULL DEFAULT 0, -- 0 = no per-account limit
  current_uses       INT           NOT NULL DEFAULT 0,
  starts_at          DATETIME      DEFAULT NULL,
  expires_at         DATETIME      DEFAULT NULL,

  status             ENUM('draft','active','paused','archived') NOT NULL DEFAULT 'draft',
  created_by         VARCHAR(120)  DEFAULT NULL,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_coupons_code (code),
  KEY idx_coupons_status (status),
  KEY idx_coupons_window (starts_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Explicit account lists for audience_type = 'list'. Kept in a table so a
-- coupon can target a long, auditable set of accounts.
CREATE TABLE IF NOT EXISTS coupon_audience (
  id         CHAR(36)     NOT NULL,
  coupon_id  CHAR(36)     NOT NULL,
  tenant_id  CHAR(36)     NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupon_audience (coupon_id, tenant_id),
  KEY idx_coupon_audience_tenant (tenant_id),
  CONSTRAINT fk_coupon_audience_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per redemption. cycle_index counts which billing cycle of a
-- multi-cycle coupon this is, so a 'cycles' benefit can be spent down.
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id               CHAR(36)      NOT NULL,
  coupon_id        CHAR(36)      NOT NULL,
  tenant_id        CHAR(36)      NOT NULL,
  code             VARCHAR(60)   DEFAULT NULL,
  plan_code        VARCHAR(60)   DEFAULT NULL,
  interval_months  INT           DEFAULT NULL,
  benefit_type     ENUM('percent','amount','waiver','free_days') NOT NULL DEFAULT 'percent',
  discount_percent DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  discount_amount  DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  free_days        INT           NOT NULL DEFAULT 0,
  amount_before    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  amount_after     DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  currency         VARCHAR(3)    NOT NULL DEFAULT 'UGX',
  cycle_index      INT           NOT NULL DEFAULT 1,
  payment_id       CHAR(36)      DEFAULT NULL,
  status           ENUM('applied','redeemed','reversed') NOT NULL DEFAULT 'applied',
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_redemptions_coupon (coupon_id),
  KEY idx_redemptions_tenant (tenant_id),
  KEY idx_redemptions_payment (payment_id),
  CONSTRAINT fk_redemptions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Record the coupon on the payment itself so a receipt and the local ledger
-- can show what was applied without a join. `status = 'paid'` on a zero-amount
-- row is how a fully-waived licence is represented (nothing was debited).
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS coupon_id       CHAR(36)      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS coupon_code     VARCHAR(60)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS coupon_discount DECIMAL(14,2) NOT NULL DEFAULT 0.00;

