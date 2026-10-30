-- ============================================================================
-- Jackisa License & Payments Hub — MySQL synchronised database
-- Database: u388105230_jackisasynccp  (MariaDB 11.x)
--
-- This is the CENTRAL, synchronised store for users, companies (tenants),
-- subscriptions, licences and payments. It is fed by and pushes to:
--   * jackisa.com          (users, individual KYC, profile photos)
--   * office.jackisa.com   (Supabase: tenants, members, education, finance)
--
-- The MySQL schema deliberately MIRRORS the Supabase tenant/member model using
-- UUID strings so that rows can be moved in both directions by id.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------------
-- Tenants (companies / institutions). Mirrors Supabase `companies`.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id                CHAR(36)     NOT NULL,
  name              VARCHAR(255) NOT NULL,
  slug              VARCHAR(160) DEFAULT NULL,
  email             VARCHAR(255) DEFAULT NULL,
  phone             VARCHAR(40)  DEFAULT NULL,
  industry          VARCHAR(100) DEFAULT NULL,
  country           VARCHAR(100) DEFAULT NULL,
  currency          VARCHAR(3)   NOT NULL DEFAULT 'UGX',
  kind              ENUM('company','institution') NOT NULL DEFAULT 'company',
  status            ENUM('active','suspended','closed') NOT NULL DEFAULT 'active',
  logo_url          TEXT         DEFAULT NULL,
  supabase_company_id CHAR(36)   DEFAULT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  synced_at         DATETIME     DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_email (email),
  KEY idx_tenants_supabase (supabase_company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Users. Mirrors Supabase `users`; jackisa_user_id links to jackisa.com.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                 CHAR(36)     NOT NULL,
  email              VARCHAR(255) NOT NULL,
  full_name          VARCHAR(255) NOT NULL,
  phone              VARCHAR(40)  DEFAULT NULL,
  avatar_url         TEXT         DEFAULT NULL,
  jackisa_user_id    VARCHAR(64)  DEFAULT NULL,
  supabase_user_id   CHAR(36)     DEFAULT NULL,
  kyc_status         ENUM('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified',
  kyc_level          ENUM('none','individual','company') NOT NULL DEFAULT 'none',
  kyc_verified_at    DATETIME     DEFAULT NULL,
  is_active          TINYINT(1)   NOT NULL DEFAULT 1,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  synced_at          DATETIME     DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_jackisa (jackisa_user_id),
  KEY idx_users_supabase (supabase_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Tenant memberships (who belongs to which company and with what role).
-- A user may belong to more than one tenant.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_members (
  id                 CHAR(36)     NOT NULL,
  tenant_id          CHAR(36)     NOT NULL,
  user_id            CHAR(36)     NOT NULL,
  role               VARCHAR(60)  NOT NULL DEFAULT 'employee',
  status             ENUM('invited','pending_approval','active','suspended','removed') NOT NULL DEFAULT 'active',
  is_owner           TINYINT(1)   NOT NULL DEFAULT 0,
  joined_at          DATETIME     DEFAULT NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member (tenant_id, user_id),
  KEY idx_member_user (user_id),
  CONSTRAINT fk_member_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Plans (the sellable packages). Price is per cycle; "up to 3 years upfront".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id                CHAR(36)     NOT NULL,
  code              VARCHAR(60)  NOT NULL,
  name              VARCHAR(120) NOT NULL,
  tier              ENUM('basic','pro','platinum','enterprise') NOT NULL DEFAULT 'basic',
  interval_months   TINYINT      NOT NULL DEFAULT 1,
  price             DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency          VARCHAR(3)   NOT NULL DEFAULT 'UGX',
  max_employees     INT          NOT NULL DEFAULT 10,
  max_students      INT          NOT NULL DEFAULT 0,
  storage_gb        INT          NOT NULL DEFAULT 5,
  features          JSON         DEFAULT NULL,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order        INT          NOT NULL DEFAULT 0,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plans_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Licences. One per tenant, SSL-style: a serial + a certificate body + a
-- signature the app verifies offline, and an expiry the app caps against.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS licenses (
  id                CHAR(36)     NOT NULL,
  tenant_id         CHAR(36)     NOT NULL,
  serial            VARCHAR(64)  NOT NULL,
  license_key       VARCHAR(80)  NOT NULL,
  plan_code         VARCHAR(60)  NOT NULL,
  tier              VARCHAR(40)  NOT NULL DEFAULT 'basic',
  status            ENUM('trial','active','grace','expired','suspended','revoked') NOT NULL DEFAULT 'trial',
  interval_months   TINYINT      NOT NULL DEFAULT 1,
  max_employees     INT          NOT NULL DEFAULT 10,
  max_students      INT          NOT NULL DEFAULT 0,
  storage_gb        INT          NOT NULL DEFAULT 5,
  features          JSON         DEFAULT NULL,
  issued_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at      DATETIME     DEFAULT NULL,
  starts_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at        DATETIME     NOT NULL,
  grace_until       DATETIME     DEFAULT NULL,
  last_validated_at DATETIME     DEFAULT NULL,
  last_seen_ip      VARCHAR(64)  DEFAULT NULL,
  revoke_reason     VARCHAR(255) DEFAULT NULL,
  certificate       TEXT         DEFAULT NULL,
  fingerprint       VARCHAR(128) DEFAULT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_licenses_serial (serial),
  UNIQUE KEY uq_licenses_key (license_key),
  KEY idx_licenses_tenant (tenant_id),
  KEY idx_licenses_status (status),
  CONSTRAINT fk_licenses_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Subscriptions. The billing relationship behind a licence.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id                CHAR(36)     NOT NULL,
  tenant_id         CHAR(36)     NOT NULL,
  license_id        CHAR(36)     DEFAULT NULL,
  plan_code         VARCHAR(60)  NOT NULL,
  tier              VARCHAR(40)  NOT NULL DEFAULT 'basic',
  interval_months   TINYINT      NOT NULL DEFAULT 1,
  status            ENUM('trialing','active','past_due','cancelled','expired') NOT NULL DEFAULT 'trialing',
  amount            DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency          VARCHAR(3)   NOT NULL DEFAULT 'UGX',
  current_period_start DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  current_period_end   DATETIME  NOT NULL,
  cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
  trial_ends_at     DATETIME     DEFAULT NULL,
  auto_renew        TINYINT(1)   NOT NULL DEFAULT 1,
  cancelled_at      DATETIME     DEFAULT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_subs_tenant (tenant_id),
  KEY idx_subs_status (status),
  CONSTRAINT fk_subs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Payments. Every collection across every channel (jpesa, relworx, cash...).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                 CHAR(36)     NOT NULL,
  tenant_id          CHAR(36)     DEFAULT NULL,
  user_id            CHAR(36)     DEFAULT NULL,
  subscription_id    CHAR(36)     DEFAULT NULL,
  purpose            ENUM('license','subscription','topup','invoice','other') NOT NULL DEFAULT 'license',
  channel            VARCHAR(40)  NOT NULL DEFAULT 'jpesa',
  provider           VARCHAR(40)  NOT NULL DEFAULT 'jpesa',
  amount             DECIMAL(14,2) NOT NULL DEFAULT 0,
  charged_amount     DECIMAL(14,2) NOT NULL DEFAULT 0,
  fee                DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency           VARCHAR(3)   NOT NULL DEFAULT 'UGX',
  msisdn             VARCHAR(40)  DEFAULT NULL,
  interval_months    TINYINT      DEFAULT NULL,
  plan_code          VARCHAR(60)  DEFAULT NULL,
  merchant_ref       VARCHAR(80)  NOT NULL,
  provider_tid       VARCHAR(80)  DEFAULT NULL,
  status             ENUM('pending','processing','paid','failed','cancelled','expired') NOT NULL DEFAULT 'pending',
  provider_status    VARCHAR(60)  DEFAULT NULL,
  provider_message   VARCHAR(500) DEFAULT NULL,
  raw_request        JSON         DEFAULT NULL,
  raw_response       JSON         DEFAULT NULL,
  reconcile_attempts INT          NOT NULL DEFAULT 0,
  last_checked_at    DATETIME     DEFAULT NULL,
  fulfilled          TINYINT(1)   NOT NULL DEFAULT 0,
  completed_at       DATETIME     DEFAULT NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_merchant_ref (merchant_ref),
  KEY idx_payments_status (status),
  KEY idx_payments_tenant (tenant_id),
  KEY idx_payments_provider_tid (provider_tid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Free trials. Keyed on a device/network fingerprint so a brand-new signup
-- from a genuinely new IP+device gets 7 days, and a re-register does not.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trials (
  id                CHAR(36)     NOT NULL,
  tenant_id         CHAR(36)     NOT NULL,
  user_id           CHAR(36)     DEFAULT NULL,
  fingerprint       VARCHAR(128) NOT NULL,
  ip_address        VARCHAR(64)  DEFAULT NULL,
  msisdn            VARCHAR(40)  DEFAULT NULL,
  started_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at           DATETIME     NOT NULL,
  reminder_sent_at  DATETIME     DEFAULT NULL,
  cancelled_at      DATETIME     DEFAULT NULL,
  converted_at      DATETIME     DEFAULT NULL,
  status            ENUM('active','reminded','cancelled','expired','converted') NOT NULL DEFAULT 'active',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_trials_fingerprint (fingerprint),
  KEY idx_trials_tenant (tenant_id),
  KEY idx_trials_status (status),
  CONSTRAINT fk_trials_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- OTP codes. Generated and approved on the PHP side.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_codes (
  id             CHAR(36)     NOT NULL,
  purpose        VARCHAR(40)  NOT NULL DEFAULT 'login',
  identifier     VARCHAR(255) NOT NULL,
  channel        ENUM('email','sms','whatsapp') NOT NULL DEFAULT 'email',
  code_hash      VARCHAR(255) NOT NULL,
  attempts       INT          NOT NULL DEFAULT 0,
  max_attempts   INT          NOT NULL DEFAULT 6,
  expires_at     DATETIME     NOT NULL,
  consumed_at    DATETIME     DEFAULT NULL,
  ip_address     VARCHAR(64)  DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_otp_lookup (identifier, purpose, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- SSO handoff tokens for "Continue with Jackisa".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sso_tokens (
  id             CHAR(36)     NOT NULL,
  token_hash     VARCHAR(255) NOT NULL,
  jackisa_user_id VARCHAR(64) NOT NULL,
  email          VARCHAR(255) NOT NULL,
  payload        JSON         DEFAULT NULL,
  expires_at     DATETIME     NOT NULL,
  consumed_at    DATETIME     DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sso_hash (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- API keys for machine callers (office.jackisa.com, cron, jackisa.com).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id             CHAR(36)     NOT NULL,
  name           VARCHAR(120) NOT NULL,
  key_id         VARCHAR(64)  NOT NULL,
  secret_hash    VARCHAR(255) NOT NULL,
  scopes         JSON         DEFAULT NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  last_used_at   DATETIME     DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_api_keys_key_id (key_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Sync ledger — idempotent two-way sync with jackisa.com and office.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_log (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  direction      ENUM('in','out') NOT NULL,
  peer           ENUM('jackisa','office','lic') NOT NULL,
  entity_type    VARCHAR(60)  NOT NULL,
  entity_id      CHAR(36)     DEFAULT NULL,
  external_id    VARCHAR(120) DEFAULT NULL,
  payload_hash   VARCHAR(64)  DEFAULT NULL,
  status         ENUM('ok','skipped','error') NOT NULL DEFAULT 'ok',
  message        VARCHAR(500) DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sync_entity (entity_type, entity_id),
  KEY idx_sync_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- KYC records (companies and individuals).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kyc_records (
  id             CHAR(36)     NOT NULL,
  subject_type   ENUM('user','tenant') NOT NULL,
  subject_id     CHAR(36)     NOT NULL,
  level          ENUM('individual','company') NOT NULL DEFAULT 'individual',
  status         ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  document_type  VARCHAR(60)  DEFAULT NULL,
  document_ref   VARCHAR(255) DEFAULT NULL,
  verified_by    CHAR(36)     DEFAULT NULL,
  verified_at    DATETIME     DEFAULT NULL,
  notes          TEXT         DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_kyc_subject (subject_type, subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Outbound message log (email + whatsapp), one row per send.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_log (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  channel        ENUM('email','whatsapp') NOT NULL,
  provider       VARCHAR(40)  DEFAULT NULL,
  to_address     VARCHAR(255) NOT NULL,
  subject        VARCHAR(255) DEFAULT NULL,
  template       VARCHAR(80)  DEFAULT NULL,
  status         ENUM('queued','sent','failed') NOT NULL DEFAULT 'queued',
  provider_id    VARCHAR(120) DEFAULT NULL,
  error          VARCHAR(500) DEFAULT NULL,
  body_preview   VARCHAR(500) DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_msglog_created (created_at),
  KEY idx_msglog_to (to_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Audit trail for privileged/licensing actions.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_type     ENUM('user','api_key','system','cron') NOT NULL DEFAULT 'system',
  actor_id       VARCHAR(64)  DEFAULT NULL,
  action         VARCHAR(80)  NOT NULL,
  entity_type    VARCHAR(60)  DEFAULT NULL,
  entity_id      CHAR(36)     DEFAULT NULL,
  ip_address     VARCHAR(64)  DEFAULT NULL,
  details        JSON         DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_action (action),
  KEY idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Idempotency for webhooks / callbacks.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processed_callbacks (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider       VARCHAR(40)  NOT NULL,
  external_ref   VARCHAR(120) NOT NULL,
  payment_id     CHAR(36)     DEFAULT NULL,
  status         VARCHAR(40)  DEFAULT NULL,
  raw_payload    JSON         DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_callback (provider, external_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Rate-limit buckets (shared across web workers, unlike APCu).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket         VARCHAR(191) NOT NULL,
  hits           INT          NOT NULL DEFAULT 0,
  window_start   DATETIME     NOT NULL,
  PRIMARY KEY (bucket)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Feature registry + per-tier/per-role grants (server-side mirror of the
-- Supabase system_tools / tier_tools / role_tool_mappings tables).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS features (
  id             CHAR(36)     NOT NULL,
  slug           VARCHAR(100) NOT NULL,
  name           VARCHAR(120) NOT NULL,
  category       VARCHAR(80)  NOT NULL,
  min_tier       ENUM('basic','pro','platinum','enterprise') NOT NULL DEFAULT 'basic',
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_features_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Unit trust / investment fund snapshot (computed by cron, pushed to office).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fund_snapshots (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id      CHAR(36)     NOT NULL,
  as_of          DATE         NOT NULL,
  total_assets   DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_liabilities DECIMAL(18,2) NOT NULL DEFAULT 0,
  nav_per_unit   DECIMAL(18,6) NOT NULL DEFAULT 0,
  units_outstanding DECIMAL(18,6) NOT NULL DEFAULT 0,
  currency       VARCHAR(3)   NOT NULL DEFAULT 'UGX',
  payload        JSON         DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fund_snapshot (tenant_id, as_of)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Dividend runs + allocations (computed by cron, pushed to office).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dividend_runs (
  id             CHAR(36)     NOT NULL,
  tenant_id      CHAR(36)     NOT NULL,
  run_date       DATE         NOT NULL,
  total_amount   DECIMAL(18,2) NOT NULL DEFAULT 0,
  currency       VARCHAR(3)   NOT NULL DEFAULT 'UGX',
  status         ENUM('draft','approved','paid') NOT NULL DEFAULT 'draft',
  payload        JSON         DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dividend_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Income-tax filing snapshots (URA-ready), one per tenant/period.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax_snapshots (
  id             CHAR(36)     NOT NULL,
  tenant_id      CHAR(36)     NOT NULL,
  period_start   DATE         NOT NULL,
  period_end     DATE         NOT NULL,
  gross_income   DECIMAL(18,2) NOT NULL DEFAULT 0,
  allowable_expenses DECIMAL(18,2) NOT NULL DEFAULT 0,
  chargeable_income DECIMAL(18,2) NOT NULL DEFAULT 0,
  tax_payable    DECIMAL(18,2) NOT NULL DEFAULT 0,
  currency       VARCHAR(3)   NOT NULL DEFAULT 'UGX',
  payload        JSON         DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tax_tenant (tenant_id, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Cron run bookkeeping.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cron_runs (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job            VARCHAR(80)  NOT NULL,
  started_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at    DATETIME     DEFAULT NULL,
  status         ENUM('running','ok','error') NOT NULL DEFAULT 'running',
  summary        JSON         DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_cron_job (job, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
