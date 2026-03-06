-- ============================================================
-- JACKISA OFFICE - PAYMENT GATEWAY & FINANCIAL DOCUMENTS
-- Migration: payment-gateway.sql
-- Relworx API Integration + Cash + Jackisa Pay
-- ============================================================

-- ============================================================
-- 1. ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE payment_direction AS ENUM ('collection', 'disbursement');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_method_type AS ENUM (
    'cash',
    'mtn_mobile_money',
    'airtel_money',
    'visa_mastercard',
    'bank_transfer',
    'jackisa_pay',
    'internal_transfer'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'success', 'failed', 'timed_out', 'cancelled', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_module AS ENUM (
    'invoicing', 'sales', 'payroll', 'investment', 'expenses',
    'commissions', 'procurement', 'subscription', 'petty_cash',
    'reimbursement', 'statutory', 'inter_company', 'club_investment',
    'profit_distribution', 'refund', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE financial_doc_type AS ENUM (
    'receipt', 'credit_note', 'debit_note', 'refund_voucher',
    'payment_voucher', 'payslip', 'remittance_advice',
    'unit_subscription_confirmation', 'redemption_statement',
    'distribution_notice', 'platform_fee_invoice', 'sales_receipt',
    'deposit_receipt', 'petty_cash_voucher', 'expense_reimbursement_slip',
    'standing_order_confirmation', 'inter_company_settlement_note'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE doc_status AS ENUM ('active', 'voided');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. GATEWAY CONFIGURATION (per-workspace Relworx accounts)
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_gateway_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider        VARCHAR(50) NOT NULL DEFAULT 'relworx',
  account_no      VARCHAR(50) NOT NULL,          -- RELxxxxxxx
  account_label   VARCHAR(100),                  -- e.g. "Main Collections", "Payroll"
  api_key_hash    TEXT,                           -- encrypted/hashed API key reference
  webhook_secret  TEXT,                           -- for signature verification
  is_active       BOOLEAN DEFAULT true,
  is_default      BOOLEAN DEFAULT false,          -- default account for this workspace
  currency        VARCHAR(3) DEFAULT 'UGX',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_gateway_config_account UNIQUE (company_id, account_no)
);

CREATE INDEX IF NOT EXISTS idx_gateway_config_company ON payment_gateway_config(company_id);

-- ============================================================
-- 3. CENTRAL PAYMENTS TABLE (authoritative record)
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Module context
  module                payment_module NOT NULL,
  module_reference_id   UUID,                     -- FK to the originating record (invoice, payslip, etc.)
  module_reference_type VARCHAR(100),              -- table name for polymorphic ref

  -- Relworx references
  gateway_config_id     UUID REFERENCES payment_gateway_config(id),
  relworx_account_no    VARCHAR(50),
  our_reference         VARCHAR(36) NOT NULL,       -- UUID v4 we generate
  relworx_internal_ref  VARCHAR(100),               -- from Relworx response
  customer_reference    VARCHAR(100),               -- mobile network ref (from webhook)
  provider_tx_id        VARCHAR(100),               -- network backend ref

  -- Payment details
  direction             payment_direction NOT NULL,
  payment_method        payment_method_type NOT NULL,
  msisdn                VARCHAR(20),                -- phone number (null for card/cash)
  currency              VARCHAR(3) DEFAULT 'UGX',
  gross_amount          DECIMAL(20, 2) NOT NULL,
  relworx_charge        DECIMAL(20, 2) DEFAULT 0,
  jackisa_fee           DECIMAL(20, 2) DEFAULT 0,
  workspace_fee         DECIMAL(20, 2) DEFAULT 0,
  net_amount            DECIMAL(20, 2),

  -- Status tracking
  status                payment_status DEFAULT 'pending',
  status_message        TEXT,
  failure_reason        TEXT,

  -- Timestamps
  initiated_at          TIMESTAMPTZ DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  webhook_received_at   TIMESTAMPTZ,

  -- Context
  description           TEXT,
  metadata              JSONB DEFAULT '{}',
  initiated_by          UUID REFERENCES users(id),

  -- Card payments
  card_payment_url      TEXT,                       -- Relworx hosted payment page URL
  card_return_url       TEXT,

  -- Retry tracking
  retry_count           INT DEFAULT 0,
  last_retry_at         TIMESTAMPTZ,

  -- Audit
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_company        ON payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_status         ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_our_ref        ON payments(our_reference);
CREATE INDEX IF NOT EXISTS idx_payments_relworx_ref    ON payments(relworx_internal_ref);
CREATE INDEX IF NOT EXISTS idx_payments_module         ON payments(module, module_reference_id);
CREATE INDEX IF NOT EXISTS idx_payments_initiated      ON payments(initiated_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_company_status ON payments(company_id, status);

-- ============================================================
-- 4. PAYMENT GATEWAY LOG (every API call logged)
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_gateway_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      UUID REFERENCES payments(id),
  company_id      UUID REFERENCES companies(id),
  direction       VARCHAR(10),                    -- 'outbound' (to Relworx) or 'inbound' (webhook)
  endpoint        VARCHAR(255),
  http_method     VARCHAR(10),
  request_body    JSONB,
  response_status INT,
  response_body   JSONB,
  error_message   TEXT,
  latency_ms      INT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gw_log_payment ON payment_gateway_log(payment_id);
CREATE INDEX IF NOT EXISTS idx_gw_log_created ON payment_gateway_log(created_at DESC);

-- ============================================================
-- 5. PROCESSED WEBHOOKS (idempotency table)
-- ============================================================

CREATE TABLE IF NOT EXISTS processed_webhooks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relworx_internal_ref VARCHAR(100) NOT NULL UNIQUE,
  payment_id           UUID REFERENCES payments(id),
  status               VARCHAR(20),
  processed_at         TIMESTAMPTZ DEFAULT NOW(),
  raw_payload          JSONB
);

CREATE INDEX IF NOT EXISTS idx_processed_wh_ref ON processed_webhooks(relworx_internal_ref);

-- ============================================================
-- 6. FINANCIAL DOCUMENTS (auto-generated by payment events)
-- ============================================================

CREATE TABLE IF NOT EXISTS financial_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payment_id        UUID REFERENCES payments(id),

  -- Document identification
  doc_type          financial_doc_type NOT NULL,
  doc_reference     VARCHAR(50) NOT NULL,          -- Sequential: RCT-2025-0001, PV-2025-0001, etc.
  doc_status        doc_status DEFAULT 'active',

  -- Content
  title             VARCHAR(255),
  description       TEXT,
  amount            DECIMAL(20, 2),
  currency          VARCHAR(3) DEFAULT 'UGX',

  -- Parties
  payer_name        VARCHAR(255),
  payer_contact     VARCHAR(100),
  payee_name        VARCHAR(255),
  payee_contact     VARCHAR(100),

  -- References
  module            payment_module,
  module_reference_id UUID,
  relworx_reference VARCHAR(100),

  -- Line items stored as JSON array
  line_items        JSONB DEFAULT '[]',

  -- Voiding
  voided_at         TIMESTAMPTZ,
  voided_by         UUID REFERENCES users(id),
  void_reason       TEXT,
  offsetting_doc_id UUID REFERENCES financial_documents(id),

  -- Timestamps
  issued_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_docs_company   ON financial_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_fin_docs_payment   ON financial_documents(payment_id);
CREATE INDEX IF NOT EXISTS idx_fin_docs_type      ON financial_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_fin_docs_reference ON financial_documents(doc_reference);

-- ============================================================
-- 7. DOCUMENT SEQUENCE COUNTERS (for sequential reference numbers)
-- ============================================================

CREATE TABLE IF NOT EXISTS document_sequences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_prefix  VARCHAR(10) NOT NULL,                -- 'RCT', 'PV', 'PSL', 'USC', etc.
  current_seq INT DEFAULT 0,
  year        INT DEFAULT EXTRACT(YEAR FROM NOW()),

  CONSTRAINT uq_doc_seq UNIQUE (company_id, doc_prefix, year)
);

-- Function to get next document reference
CREATE OR REPLACE FUNCTION next_doc_reference(
  p_company_id UUID,
  p_prefix     VARCHAR
) RETURNS VARCHAR AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM NOW());
  v_seq  INT;
BEGIN
  INSERT INTO document_sequences (company_id, doc_prefix, current_seq, year)
  VALUES (p_company_id, p_prefix, 1, v_year)
  ON CONFLICT (company_id, doc_prefix, year)
  DO UPDATE SET current_seq = document_sequences.current_seq + 1
  RETURNING current_seq INTO v_seq;

  RETURN p_prefix || '-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 8. RECONCILIATION
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_reconciliation_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  run_date        DATE NOT NULL,
  total_collected DECIMAL(20, 2) DEFAULT 0,
  total_disbursed DECIMAL(20, 2) DEFAULT 0,
  total_charges   DECIMAL(20, 2) DEFAULT 0,
  matched_count   INT DEFAULT 0,
  exception_count INT DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'completed',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reconciliation_exceptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id    UUID REFERENCES payment_reconciliation_runs(id),
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  exception_type       VARCHAR(50),                -- 'missing_in_jackisa', 'missing_in_relworx', 'status_mismatch', 'amount_mismatch'
  relworx_reference    VARCHAR(100),
  jackisa_payment_id   UUID REFERENCES payments(id),
  expected_status      VARCHAR(20),
  actual_status        VARCHAR(20),
  expected_amount      DECIMAL(20, 2),
  actual_amount        DECIMAL(20, 2),
  resolved             BOOLEAN DEFAULT false,
  resolved_at          TIMESTAMPTZ,
  resolved_by          UUID REFERENCES users(id),
  resolution_notes     TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 9. CASH PAYMENTS TABLE (for cash transactions without Relworx)
-- ============================================================

CREATE TABLE IF NOT EXISTS cash_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id          UUID NOT NULL REFERENCES payments(id),
  received_by         UUID REFERENCES users(id),
  cash_tendered       DECIMAL(20, 2),
  change_given        DECIMAL(20, 2) DEFAULT 0,
  receipt_number      VARCHAR(50),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. RLS POLICIES
-- ============================================================

ALTER TABLE payment_gateway_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_gateway_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_payments ENABLE ROW LEVEL SECURITY;

-- Gateway config: only company members
CREATE POLICY gateway_config_company ON payment_gateway_config
  USING (company_id IN (
    SELECT company_id FROM company_employees WHERE user_id = auth.uid() AND status = 'active'
  ));

-- Payments: company members can see their workspace payments
CREATE POLICY payments_company ON payments
  USING (company_id IN (
    SELECT company_id FROM company_employees WHERE user_id = auth.uid() AND status = 'active'
  ));

-- Gateway log: company members
CREATE POLICY gw_log_company ON payment_gateway_log
  USING (company_id IN (
    SELECT company_id FROM company_employees WHERE user_id = auth.uid() AND status = 'active'
  ));

-- Processed webhooks: accessible via service role only (no user RLS needed)
CREATE POLICY webhooks_service ON processed_webhooks
  USING (true);

-- Financial documents: company members
CREATE POLICY fin_docs_company ON financial_documents
  USING (company_id IN (
    SELECT company_id FROM company_employees WHERE user_id = auth.uid() AND status = 'active'
  ));

-- Document sequences: company members
CREATE POLICY doc_seq_company ON document_sequences
  USING (company_id IN (
    SELECT company_id FROM company_employees WHERE user_id = auth.uid() AND status = 'active'
  ));

-- Reconciliation: company members
CREATE POLICY recon_runs_company ON payment_reconciliation_runs
  USING (company_id IN (
    SELECT company_id FROM company_employees WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY recon_exceptions_company ON reconciliation_exceptions
  USING (company_id IN (
    SELECT company_id FROM company_employees WHERE user_id = auth.uid() AND status = 'active'
  ));

-- Cash payments: via parent payment company
CREATE POLICY cash_payments_company ON cash_payments
  USING (payment_id IN (
    SELECT id FROM payments WHERE company_id IN (
      SELECT company_id FROM company_employees WHERE user_id = auth.uid() AND status = 'active'
    )
  ));

-- ============================================================
-- 11. HELPER FUNCTIONS
-- ============================================================

-- Generate financial document after payment completion
CREATE OR REPLACE FUNCTION generate_payment_document(
  p_payment_id UUID,
  p_doc_type   financial_doc_type
) RETURNS UUID AS $$
DECLARE
  v_payment   payments%ROWTYPE;
  v_prefix    VARCHAR(10);
  v_doc_ref   VARCHAR(50);
  v_doc_id    UUID;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Determine prefix based on doc type
  v_prefix := CASE p_doc_type
    WHEN 'receipt' THEN 'RCT'
    WHEN 'credit_note' THEN 'CN'
    WHEN 'debit_note' THEN 'DN'
    WHEN 'refund_voucher' THEN 'RFV'
    WHEN 'payment_voucher' THEN 'PV'
    WHEN 'payslip' THEN 'PSL'
    WHEN 'remittance_advice' THEN 'RMA'
    WHEN 'unit_subscription_confirmation' THEN 'USC'
    WHEN 'redemption_statement' THEN 'RDS'
    WHEN 'distribution_notice' THEN 'DST'
    WHEN 'platform_fee_invoice' THEN 'PFI'
    WHEN 'sales_receipt' THEN 'SRC'
    WHEN 'deposit_receipt' THEN 'DRC'
    WHEN 'petty_cash_voucher' THEN 'PCV'
    WHEN 'expense_reimbursement_slip' THEN 'ERS'
    WHEN 'standing_order_confirmation' THEN 'SOC'
    WHEN 'inter_company_settlement_note' THEN 'ICS'
    ELSE 'DOC'
  END;

  v_doc_ref := next_doc_reference(v_payment.company_id, v_prefix);

  INSERT INTO financial_documents (
    company_id, payment_id, doc_type, doc_reference, title, description,
    amount, currency, module, module_reference_id, relworx_reference
  ) VALUES (
    v_payment.company_id, p_payment_id, p_doc_type, v_doc_ref,
    INITCAP(REPLACE(p_doc_type::TEXT, '_', ' ')) || ' - ' || v_doc_ref,
    v_payment.description,
    v_payment.gross_amount, v_payment.currency,
    v_payment.module, v_payment.module_reference_id,
    v_payment.relworx_internal_ref
  ) RETURNING id INTO v_doc_id;

  RETURN v_doc_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 12. SEED SYSTEM TOOLS
-- ============================================================

ALTER TABLE IF EXISTS system_tools
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;

INSERT INTO system_tools (name, slug, description, category, icon, route, sort_order, enabled)
VALUES
  ('Payment Gateway', 'payment-gateway', 'Centralised payment processing via Relworx - Mobile Money, Visa, Mastercard, Cash', 'Administration', 'CreditCard', '/app/payments', 65, true),
  ('Financial Documents', 'financial-documents', 'Auto-generated receipts, vouchers, payslips, and statements from payment events', 'Administration', 'FileText', '/app/payments', 66, true)
ON CONFLICT (slug) DO NOTHING;
