BEGIN;

-- =============================
-- Phase 2 Finance Automation
-- - Payment-to-account routing
-- - Overspend -> auto loan rollover
-- - Loan interest accrual helpers
-- - Dividend payable tracking
-- =============================

-- Helpers: resolve default account IDs per payment method
CREATE OR REPLACE FUNCTION resolve_account_id_from_payment_method(
  p_company_id UUID,
  p_payment_method payment_method_type
) RETURNS UUID AS $$
DECLARE
  v_type company_financial_account_type;
  v_account_id UUID;
BEGIN
  v_type := CASE p_payment_method
    WHEN 'cash' THEN 'cash'::company_financial_account_type
    WHEN 'jackisa_pay' THEN 'jackisa_pay'::company_financial_account_type
    WHEN 'bank_transfer' THEN 'bank'::company_financial_account_type
    WHEN 'visa_mastercard' THEN 'bank'::company_financial_account_type
    ELSE 'bank'::company_financial_account_type
  END;

  -- Prefer default account of that type
  SELECT id INTO v_account_id
  FROM company_financial_accounts
  WHERE company_id = p_company_id
    AND account_type = v_type
  ORDER BY is_default DESC, created_at ASC
  LIMIT 1;

  IF v_account_id IS NULL THEN
    PERFORM ensure_company_financial_accounts(p_company_id);
    SELECT id INTO v_account_id
    FROM company_financial_accounts
    WHERE company_id = p_company_id
      AND account_type = v_type
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1;
  END IF;

  RETURN v_account_id;
END;
$$ LANGUAGE plpgsql;

-- Auto company loan for shortfalls
CREATE OR REPLACE FUNCTION ensure_auto_company_loan(p_company_id UUID)
RETURNS UUID AS $$
DECLARE
  v_loan_id UUID;
BEGIN
  SELECT id INTO v_loan_id
  FROM company_loans
  WHERE company_id = p_company_id
    AND loan_name = 'Auto Company Loan'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_loan_id IS NOT NULL THEN
    RETURN v_loan_id;
  END IF;

  INSERT INTO company_loans (
    company_id,
    loan_name,
    lender_name,
    principal_amount,
    principal_outstanding,
    annual_interest_rate,
    notes
  ) VALUES (
    p_company_id,
    'Auto Company Loan',
    'Internal Facility',
    0,
    0,
    0.12, -- default 12% simple annual; adjust as needed
    'Auto-created to cover operating shortfalls'
  ) RETURNING id INTO v_loan_id;

  RETURN v_loan_id;
END;
$$ LANGUAGE plpgsql;

-- Account balance updater with automatic shortfall coverage via auto-loan
CREATE OR REPLACE FUNCTION update_company_account_balance_with_autoloan(
  p_company_id UUID,
  p_account_id UUID,
  p_direction VARCHAR,
  p_amount DECIMAL
) RETURNS VOID AS $$
DECLARE
  v_balance DECIMAL;
  v_shortfall DECIMAL;
  v_loan_id UUID;
BEGIN
  SELECT current_balance INTO v_balance FROM company_financial_accounts WHERE id = p_account_id FOR UPDATE;

  IF p_direction = 'outflow' THEN
    v_shortfall := GREATEST(0, p_amount - COALESCE(v_balance, 0));
    IF v_shortfall > 0 THEN
      v_loan_id := ensure_auto_company_loan(p_company_id);
      -- raise principal and top up the account
      UPDATE company_loans
      SET principal_outstanding = principal_outstanding + v_shortfall,
          principal_amount = principal_amount + v_shortfall,
          updated_at = NOW()
      WHERE id = v_loan_id;

      UPDATE company_financial_accounts
      SET current_balance = current_balance + v_shortfall,
          updated_at = NOW()
      WHERE id = p_account_id;

      INSERT INTO company_account_transactions (
        company_id,
        account_id,
        reference_table,
        reference_id,
        direction,
        amount,
        description,
        metadata
      ) VALUES (
        p_company_id,
        p_account_id,
        'company_loans',
        v_loan_id,
        'inflow',
        v_shortfall,
        'Auto-loan top-up for shortfall',
        jsonb_build_object('auto_loan', true)
      );
    END IF;
  END IF;

  UPDATE company_financial_accounts
  SET current_balance = current_balance + CASE WHEN p_direction = 'inflow' THEN p_amount ELSE -p_amount END,
      updated_at = NOW()
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql;

-- Interest accrual (simple daily)
CREATE OR REPLACE FUNCTION accrue_company_loan_interest(p_loan_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_loan company_loans%ROWTYPE;
  v_daily_rate DECIMAL;
  v_interest DECIMAL;
BEGIN
  SELECT * INTO v_loan FROM company_loans WHERE id = p_loan_id;
  IF NOT FOUND OR v_loan.status <> 'active' THEN RETURN 0; END IF;

  v_daily_rate := v_loan.annual_interest_rate / 365;
  v_interest := ROUND((v_loan.principal_outstanding + v_loan.accrued_interest) * v_daily_rate, 2);

  IF v_interest > 0 THEN
    UPDATE company_loans
    SET accrued_interest = accrued_interest + v_interest,
        updated_at = NOW()
    WHERE id = p_loan_id;
  END IF;

  RETURN v_interest;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION accrue_all_company_loans()
RETURNS VOID AS $$
DECLARE
  v_loan_id UUID;
BEGIN
  FOR v_loan_id IN SELECT id FROM company_loans WHERE status = 'active' LOOP
    PERFORM accrue_company_loan_interest(v_loan_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Dividend payable tracking
CREATE TABLE IF NOT EXISTS dividend_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dividend_id UUID NOT NULL REFERENCES dividends(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id UUID REFERENCES company_financial_accounts(id) ON DELETE SET NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(20, 2) NOT NULL CHECK (amount >= 0),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dividends ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(20, 2) NOT NULL DEFAULT 0;
ALTER TABLE dividends ADD COLUMN IF NOT EXISTS outstanding_amount DECIMAL(20, 2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION sync_dividend_financials(p_dividend_id UUID)
RETURNS VOID AS $$
DECLARE
  v_div dividends%ROWTYPE;
  v_paid DECIMAL := 0;
BEGIN
  SELECT * INTO v_div FROM dividends WHERE id = p_dividend_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM dividend_payments WHERE dividend_id = p_dividend_id;

  UPDATE dividends
  SET paid_amount = v_paid,
      outstanding_amount = GREATEST(COALESCE(total_amount, 0) - v_paid, 0),
      status = CASE
        WHEN v_paid >= COALESCE(total_amount, 0) AND COALESCE(total_amount, 0) > 0 THEN 'paid'
        WHEN v_paid > 0 THEN 'approved'
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = p_dividend_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_sync_dividend_financials()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM sync_dividend_financials(COALESCE(NEW.dividend_id, OLD.dividend_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_dividend_payment_sync ON dividend_payments;
CREATE TRIGGER after_dividend_payment_sync
AFTER INSERT OR UPDATE OR DELETE ON dividend_payments
FOR EACH ROW
EXECUTE FUNCTION trg_sync_dividend_financials();

-- Re-declare payment hooks to use account IDs and auto-loan protection
CREATE OR REPLACE FUNCTION create_credit_note_for_invoice_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_account_id UUID;
BEGIN
  IF NEW.status <> 'success' OR NEW.direction <> 'collection' OR NEW.module_reference_type <> 'invoices' OR NEW.module_reference_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM credit_notes WHERE payment_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_account_id := resolve_account_id_from_payment_method(NEW.company_id, NEW.payment_method);

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
    NULL,
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

  PERFORM update_company_account_balance_with_autoloan(NEW.company_id, v_account_id, 'inflow', COALESCE(NEW.net_amount, NEW.gross_amount, 0));
  PERFORM sync_invoice_financials(NEW.module_reference_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_debit_note_for_expense_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_account_id UUID;
BEGIN
  IF NEW.status <> 'success' OR NEW.direction <> 'disbursement' OR NEW.module_reference_type <> 'expenses' OR NEW.module_reference_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM debit_notes WHERE payment_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_account_id := resolve_account_id_from_payment_method(NEW.company_id, NEW.payment_method);

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
    NULL,
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

  PERFORM update_company_account_balance_with_autoloan(NEW.company_id, v_account_id, 'outflow', COALESCE(NEW.net_amount, NEW.gross_amount, 0));
  PERFORM sync_expense_financials(NEW.module_reference_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate triggers to ensure updated functions are used
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

-- Seed outstanding columns for dividends where missing
UPDATE dividends
SET outstanding_amount = GREATEST(COALESCE(total_amount, 0) - COALESCE(paid_amount, 0), 0)
WHERE outstanding_amount = 0;

COMMIT;
