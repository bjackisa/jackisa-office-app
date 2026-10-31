-- ============================================================================
-- 005 — Payout rail + payment purpose coverage
--
-- Two fixes:
--   1. `payments.purpose` never allowed 'change', yet a plan change (upgrade /
--      downgrade / interval switch) records a payment with purpose='change'.
--      On MySQL the INSERT failed the enum check, so a paid plan change could
--      not be recorded. 'payout' is added for the new outgoing rail.
--   2. A JPesa DEBIT (money out: salaries, refunds, vendor payouts) is now a
--      first-class payment. It reuses the same verified reconciliation loop as
--      a credit, so a payout is only ever marked paid after JPesa confirms it.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1. Extend the purpose enum (idempotent: MODIFY is safe to re-run).
ALTER TABLE payments
  MODIFY COLUMN purpose
  ENUM('license','subscription','topup','invoice','other','change','payout')
  NOT NULL DEFAULT 'license';

-- 2. Payout-specific columns on `payments`.
--    `payee` holds the structured recipient (name, phone, bank, employee id);
--    `direction` distinguishes money in (credit) from money out (debit).
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS direction ENUM('credit','debit') NOT NULL DEFAULT 'credit' AFTER channel,
  ADD COLUMN IF NOT EXISTS payee JSON DEFAULT NULL AFTER msisdn,
  ADD COLUMN IF NOT EXISTS external_ref VARCHAR(120) DEFAULT NULL AFTER merchant_ref,
  ADD COLUMN IF NOT EXISTS callback_payload JSON DEFAULT NULL AFTER raw_response;

-- 3. A payout is initiated by a peer (office) with an idempotency key so a
--    retried request cannot double-pay an employee.
CREATE TABLE IF NOT EXISTS payout_requests (
  id               CHAR(36)     NOT NULL,
  tenant_id        CHAR(36)     NOT NULL,
  payment_id       CHAR(36)     DEFAULT NULL,
  idempotency_key  VARCHAR(120) NOT NULL,
  module           VARCHAR(60)  NOT NULL DEFAULT 'payslip',
  module_ref_id    VARCHAR(80)  DEFAULT NULL,
  payee_type       ENUM('employee','vendor','refund','other') NOT NULL DEFAULT 'employee',
  payee            JSON         DEFAULT NULL,
  amount           DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency         VARCHAR(3)   NOT NULL DEFAULT 'UGX',
  status           ENUM('pending','processing','paid','failed','cancelled') NOT NULL DEFAULT 'pending',
  provider         VARCHAR(40)  NOT NULL DEFAULT 'jpesa',
  provider_tid     VARCHAR(80)  DEFAULT NULL,
  provider_message VARCHAR(500) DEFAULT NULL,
  created_by       CHAR(36)     DEFAULT NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payout_idem (tenant_id, idempotency_key),
  KEY idx_payout_tenant (tenant_id),
  KEY idx_payout_status (status),
  KEY idx_payout_payment (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
