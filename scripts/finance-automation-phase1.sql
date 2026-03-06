BEGIN;

DO $$ BEGIN
  CREATE TYPE company_financial_account_type AS ENUM (
    'bank',
    'cash',
    'jackisa_pay',
    'internal_sales',
    'internal_expenses',
    'internal_loans',
    'internal_savings',
    'internal_donations',
    'internal_share_capital',
    'internal_dividend_reserve',
    'internal_investment'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE company_loan_status AS ENUM ('active', 'repaid', 'defaulted', 'restructured');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS company_financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_name VARCHAR(255) NOT NULL,
  account_type company_financial_account_type NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'UGX',
  bank_name VARCHAR(255),
  account_number VARCHAR(100),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  current_balance DECIMAL(20, 2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_company_financial_account UNIQUE (company_id, account_type, account_name)
);

CREATE INDEX IF NOT EXISTS idx_company_financial_accounts_company ON company_financial_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_company_financial_accounts_type ON company_financial_accounts(company_id, account_type);

CREATE TABLE IF NOT EXISTS company_account_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES company_financial_accounts(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  credit_note_id UUID REFERENCES credit_notes(id) ON DELETE SET NULL,
  debit_note_id UUID REFERENCES debit_notes(id) ON DELETE SET NULL,
  reference_table VARCHAR(100),
  reference_id UUID,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inflow', 'outflow')),
  amount DECIMAL(20, 2) NOT NULL CHECK (amount >= 0),
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_account_transactions_company ON company_account_transactions(company_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_company_account_transactions_account ON company_account_transactions(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS company_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  loan_name VARCHAR(255) NOT NULL,
  lender_name VARCHAR(255),
  principal_amount DECIMAL(20, 2) NOT NULL CHECK (principal_amount >= 0),
  principal_outstanding DECIMAL(20, 2) NOT NULL DEFAULT 0 CHECK (principal_outstanding >= 0),
  annual_interest_rate DECIMAL(12, 8) NOT NULL DEFAULT 0 CHECK (annual_interest_rate >= 0),
  accrued_interest DECIMAL(20, 2) NOT NULL DEFAULT 0 CHECK (accrued_interest >= 0),
  disbursed_to_account_id UUID REFERENCES company_financial_accounts(id) ON DELETE SET NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  maturity_date DATE,
  status company_loan_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_loans_company ON company_loans(company_id, status);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS outstanding_amount DECIMAL(15, 2) NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS outstanding_amount DECIMAL(15, 2) NOT NULL DEFAULT 0;

ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id) ON DELETE SET NULL;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS source_account_id UUID REFERENCES company_financial_accounts(id) ON DELETE SET NULL;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS source_account_type company_financial_account_type;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL;
ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS company_loan_id UUID REFERENCES company_loans(id) ON DELETE SET NULL;
ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id) ON DELETE SET NULL;
ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS source_account_id UUID REFERENCES company_financial_accounts(id) ON DELETE SET NULL;
ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS source_account_type company_financial_account_type;
ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS interest_portion DECIMAL(15, 2) NOT NULL DEFAULT 0;
ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS principal_portion DECIMAL(15, 2) NOT NULL DEFAULT 0;
ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION ensure_company_financial_accounts(p_company_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO company_financial_accounts (company_id, account_name, account_type, is_default)
  VALUES
    (p_company_id, 'Default Bank', 'bank', TRUE),
    (p_company_id, 'Cash Account', 'cash', FALSE),
    (p_company_id, 'Jackisa Pay Account', 'jackisa_pay', FALSE),
    (p_company_id, 'Sales Internal', 'internal_sales', FALSE),
    (p_company_id, 'Expenses Internal', 'internal_expenses', FALSE),
    (p_company_id, 'Loans Internal', 'internal_loans', FALSE),
    (p_company_id, 'Savings Internal', 'internal_savings', FALSE),
    (p_company_id, 'Donations Internal', 'internal_donations', FALSE),
    (p_company_id, 'Share Capital Internal', 'internal_share_capital', FALSE),
    (p_company_id, 'Dividend Reserve Internal', 'internal_dividend_reserve', FALSE),
    (p_company_id, 'Investment Internal', 'internal_investment', FALSE)
  ON CONFLICT (company_id, account_type, account_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_or_create_financial_account(
  p_company_id UUID,
  p_account_type company_financial_account_type
) RETURNS UUID AS $$
DECLARE
  v_account_id UUID;
BEGIN
  PERFORM ensure_company_financial_accounts(p_company_id);

  SELECT id INTO v_account_id
  FROM company_financial_accounts
  WHERE company_id = p_company_id
    AND account_type = p_account_type
  ORDER BY is_default DESC, created_at ASC
  LIMIT 1;

  RETURN v_account_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_invoice_financials(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
  v_credit_total DECIMAL(15, 2) := 0;
  v_status invoice_status;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_credit_total
  FROM credit_notes
  WHERE invoice_id = p_invoice_id;

  v_credit_total := LEAST(v_credit_total, COALESCE(v_invoice.total_amount, 0));

  IF v_credit_total >= COALESCE(v_invoice.total_amount, 0) AND COALESCE(v_invoice.total_amount, 0) > 0 THEN
    v_status := 'paid';
  ELSIF v_credit_total > 0 THEN
    v_status := 'partially_paid';
  ELSIF v_invoice.status = 'draft' THEN
    v_status := 'draft';
  ELSIF v_invoice.status = 'cancelled' THEN
    v_status := 'cancelled';
  ELSIF v_invoice.status = 'overdue' THEN
    v_status := 'overdue';
  ELSE
    v_status := 'sent';
  END IF;

  UPDATE invoices
  SET paid_amount = v_credit_total,
      outstanding_amount = GREATEST(COALESCE(total_amount, 0) - v_credit_total, 0),
      status = v_status,
      updated_at = NOW()
  WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_expense_financials(p_expense_id UUID)
RETURNS VOID AS $$
DECLARE
  v_expense expenses%ROWTYPE;
  v_paid_total DECIMAL(15, 2) := 0;
  v_status VARCHAR(20);
BEGIN
  SELECT * INTO v_expense FROM expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid_total
  FROM debit_notes
  WHERE expense_id = p_expense_id;

  v_paid_total := LEAST(v_paid_total, COALESCE(v_expense.amount, 0));

  IF v_paid_total >= COALESCE(v_expense.amount, 0) AND COALESCE(v_expense.amount, 0) > 0 THEN
    v_status := 'paid';
  ELSIF v_paid_total > 0 THEN
    v_status := 'partially_paid';
  ELSE
    v_status := v_expense.status;
  END IF;

  UPDATE expenses
  SET paid_amount = v_paid_total,
      outstanding_amount = GREATEST(COALESCE(amount, 0) - v_paid_total, 0),
      status = v_status,
      updated_at = NOW()
  WHERE id = p_expense_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_company_account_balance(
  p_account_id UUID,
  p_direction VARCHAR,
  p_amount DECIMAL
) RETURNS VOID AS $$
BEGIN
  UPDATE company_financial_accounts
  SET current_balance = current_balance + CASE WHEN p_direction = 'inflow' THEN p_amount ELSE -p_amount END,
      updated_at = NOW()
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION resolve_account_type_from_payment_method(p_payment_method payment_method_type)
RETURNS company_financial_account_type AS $$
BEGIN
  RETURN CASE p_payment_method
    WHEN 'cash' THEN 'cash'::company_financial_account_type
    WHEN 'jackisa_pay' THEN 'jackisa_pay'::company_financial_account_type
    WHEN 'bank_transfer' THEN 'bank'::company_financial_account_type
    WHEN 'visa_mastercard' THEN 'bank'::company_financial_account_type
    ELSE 'bank'::company_financial_account_type
  END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_credit_note_for_invoice_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_account_type company_financial_account_type;
  v_account_id UUID;
BEGIN
  IF NEW.status <> 'success' OR NEW.direction <> 'collection' OR NEW.module_reference_type <> 'invoices' OR NEW.module_reference_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM credit_notes WHERE payment_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_account_type := resolve_account_type_from_payment_method(NEW.payment_method);
  v_account_id := get_or_create_financial_account(NEW.company_id, v_account_type);

  INSERT INTO credit_notes (
    company_id,
    credit_note_number,
    invoice_id,
    credit_date,
    reason,
    amount,
    created_by,
    payment_id,
    source_account_id,
    source_account_type,
    metadata
  ) VALUES (
    NEW.company_id,
    'CN-' || EXTRACT(EPOCH FROM NOW())::BIGINT,
    NEW.module_reference_id,
    CURRENT_DATE,
    COALESCE(NEW.description, 'Invoice settlement'),
    COALESCE(NEW.net_amount, NEW.gross_amount, 0),
    NEW.initiated_by,
    NEW.id,
    v_account_id,
    v_account_type,
    jsonb_build_object('payment_method', NEW.payment_method, 'module', NEW.module)
  );

  INSERT INTO company_account_transactions (
    company_id,
    account_id,
    payment_id,
    invoice_id,
    reference_table,
    reference_id,
    direction,
    amount,
    description,
    created_by,
    metadata
  ) VALUES (
    NEW.company_id,
    v_account_id,
    NEW.id,
    NEW.module_reference_id,
    'payments',
    NEW.id,
    'inflow',
    COALESCE(NEW.net_amount, NEW.gross_amount, 0),
    COALESCE(NEW.description, 'Invoice collection'),
    NEW.initiated_by,
    jsonb_build_object('payment_method', NEW.payment_method, 'module', NEW.module)
  );

  PERFORM update_company_account_balance(v_account_id, 'inflow', COALESCE(NEW.net_amount, NEW.gross_amount, 0));
  PERFORM sync_invoice_financials(NEW.module_reference_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_debit_note_for_expense_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_account_type company_financial_account_type;
  v_account_id UUID;
BEGIN
  IF NEW.status <> 'success' OR NEW.direction <> 'disbursement' OR NEW.module_reference_type <> 'expenses' OR NEW.module_reference_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM debit_notes WHERE payment_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_account_type := resolve_account_type_from_payment_method(NEW.payment_method);
  v_account_id := get_or_create_financial_account(NEW.company_id, v_account_type);

  INSERT INTO debit_notes (
    company_id,
    debit_note_number,
    expense_id,
    debit_date,
    reason,
    amount,
    created_by,
    payment_id,
    source_account_id,
    source_account_type,
    metadata
  ) VALUES (
    NEW.company_id,
    'DN-' || EXTRACT(EPOCH FROM NOW())::BIGINT,
    NEW.module_reference_id,
    CURRENT_DATE,
    COALESCE(NEW.description, 'Expense settlement'),
    COALESCE(NEW.net_amount, NEW.gross_amount, 0),
    NEW.initiated_by,
    NEW.id,
    v_account_id,
    v_account_type,
    jsonb_build_object('payment_method', NEW.payment_method, 'module', NEW.module)
  );

  INSERT INTO company_account_transactions (
    company_id,
    account_id,
    payment_id,
    expense_id,
    reference_table,
    reference_id,
    direction,
    amount,
    description,
    created_by,
    metadata
  ) VALUES (
    NEW.company_id,
    v_account_id,
    NEW.id,
    NEW.module_reference_id,
    'payments',
    NEW.id,
    'outflow',
    COALESCE(NEW.net_amount, NEW.gross_amount, 0),
    COALESCE(NEW.description, 'Expense reimbursement'),
    NEW.initiated_by,
    jsonb_build_object('payment_method', NEW.payment_method, 'module', NEW.module)
  );

  PERFORM update_company_account_balance(v_account_id, 'outflow', COALESCE(NEW.net_amount, NEW.gross_amount, 0));
  PERFORM sync_expense_financials(NEW.module_reference_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_sync_invoice_financials_from_credit_note()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM sync_invoice_financials(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_sync_expense_financials_from_debit_note()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM sync_expense_financials(COALESCE(NEW.expense_id, OLD.expense_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_payment_success_credit_note ON payments;
CREATE TRIGGER after_payment_success_credit_note
AFTER UPDATE OF status ON payments
FOR EACH ROW
WHEN (NEW.status = 'success' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION create_credit_note_for_invoice_payment();

DROP TRIGGER IF EXISTS after_payment_success_debit_note ON payments;
CREATE TRIGGER after_payment_success_debit_note
AFTER UPDATE OF status ON payments
FOR EACH ROW
WHEN (NEW.status = 'success' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION create_debit_note_for_expense_payment();

DROP TRIGGER IF EXISTS after_credit_note_sync_invoice ON credit_notes;
CREATE TRIGGER after_credit_note_sync_invoice
AFTER INSERT OR UPDATE OR DELETE ON credit_notes
FOR EACH ROW
EXECUTE FUNCTION trg_sync_invoice_financials_from_credit_note();

DROP TRIGGER IF EXISTS after_debit_note_sync_expense ON debit_notes;
CREATE TRIGGER after_debit_note_sync_expense
AFTER INSERT OR UPDATE OR DELETE ON debit_notes
FOR EACH ROW
EXECUTE FUNCTION trg_sync_expense_financials_from_debit_note();

UPDATE invoices
SET outstanding_amount = GREATEST(COALESCE(total_amount, 0) - COALESCE(paid_amount, 0), 0)
WHERE outstanding_amount = 0;

UPDATE expenses
SET outstanding_amount = GREATEST(COALESCE(amount, 0) - COALESCE(paid_amount, 0), 0)
WHERE outstanding_amount = 0;

DO $$
DECLARE
  v_company RECORD;
BEGIN
  FOR v_company IN SELECT id FROM companies LOOP
    PERFORM ensure_company_financial_accounts(v_company.id);
  END LOOP;
END $$;

COMMIT;
