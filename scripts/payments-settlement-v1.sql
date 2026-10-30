-- ============================================================================
-- Jackisa Office — Payments settlement v1
-- ----------------------------------------------------------------------------
-- NEW migration. Adds nothing to the existing schema; it only creates two new
-- functions and one new trigger, and replaces one helper function with a
-- superset of its old behaviour.
--
-- What it fixes:
--   * Successful payments were never reflected on the company's financial
--     account, so sales never contributed to company income and salary
--     disbursements never left the company account.
--   * A paid salary left its payslip in `draft` forever (salaries "enter once
--     and stay static").
--
-- Relationship to the existing triggers: invoice collections and expense
-- reimbursements are already posted by `create_credit_note_for_invoice_payment`
-- and `create_debit_note_for_expense_payment`. This trigger name sorts after
-- both, and it skips any payment that already has a company_account_transactions
-- row, so those two keep their credit/debit-note behaviour and everything else
-- (payroll, direct sales, POS) is posted here — exactly once.
--
-- After this runs, every payment that reaches status = 'success' posts a
-- company_account_transactions row and moves the account balance, and a
-- successful payroll disbursement marks its payslip(s) paid.
-- ============================================================================

-- 1. Map every mobile-money rail to the Jackisa Pay account (the old helper
--    funnelled mtn/airtel into 'bank', which is wrong).
CREATE OR REPLACE FUNCTION resolve_account_type_from_payment_method(p_payment_method payment_method_type)
RETURNS company_financial_account_type AS $$
BEGIN
  RETURN CASE p_payment_method
    WHEN 'cash' THEN 'cash'::company_financial_account_type
    WHEN 'jackisa_pay' THEN 'jackisa_pay'::company_financial_account_type
    WHEN 'mtn_mobile_money' THEN 'jackisa_pay'::company_financial_account_type
    WHEN 'airtel_money' THEN 'jackisa_pay'::company_financial_account_type
    WHEN 'visa_mastercard' THEN 'bank'::company_financial_account_type
    WHEN 'bank_transfer' THEN 'bank'::company_financial_account_type
    WHEN 'internal_transfer' THEN 'internal_sales'::company_financial_account_type
    ELSE 'bank'::company_financial_account_type
  END;
END;
$$ LANGUAGE plpgsql;

-- 2. Post a settled payment onto the company's financial account and settle
--    any payroll it represents. Idempotent: a payment is posted at most once.
CREATE OR REPLACE FUNCTION post_payment_to_company_account()
RETURNS TRIGGER AS $$
DECLARE
  v_account_id UUID;
  v_amount     DECIMAL(20,2);
  v_direction  VARCHAR(10);
BEGIN
  -- Only a transition INTO 'success' is posted.
  IF NEW.status <> 'success' OR OLD.status IS NOT DISTINCT FROM 'success' THEN
    RETURN NEW;
  END IF;

  -- Idempotency guard: never double-post the same payment.
  IF EXISTS (SELECT 1 FROM company_account_transactions WHERE payment_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_amount := COALESCE(NEW.net_amount, NEW.gross_amount, 0);
  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_direction := CASE WHEN NEW.direction = 'disbursement' THEN 'outflow' ELSE 'inflow' END;
  v_account_id := get_or_create_financial_account(NEW.company_id, resolve_account_type_from_payment_method(NEW.payment_method));

  INSERT INTO company_account_transactions (
    company_id, account_id, payment_id, reference_table, reference_id,
    entry_date, direction, amount, description, metadata, created_by
  ) VALUES (
    NEW.company_id, v_account_id, NEW.id,
    NEW.module_reference_type, NEW.module_reference_id,
    COALESCE(NEW.completed_at::DATE, CURRENT_DATE),
    v_direction, v_amount,
    COALESCE(NEW.description, 'Payment ' || NEW.our_reference),
    jsonb_build_object('module', NEW.module, 'method', NEW.payment_method, 'reference', NEW.our_reference),
    NEW.initiated_by
  );

  PERFORM update_company_account_balance(v_account_id, v_direction, v_amount);

  -- Settle payroll: a disbursement tagged to a payslip, a whole run, or an employee.
  IF NEW.module = 'payroll' AND NEW.direction = 'disbursement' THEN
    IF NEW.module_reference_type = 'payroll_run' AND NEW.module_reference_id IS NOT NULL THEN
      UPDATE payroll_records
         SET status = 'paid', payment_id = NEW.id, paid_at = NOW()
       WHERE payroll_run_id = NEW.module_reference_id AND status <> 'paid';
    ELSIF NEW.module_reference_type = 'company_employees' AND NEW.module_reference_id IS NOT NULL THEN
      UPDATE payroll_records
         SET status = 'paid', payment_id = NEW.id, paid_at = NOW()
       WHERE id = (
         SELECT id FROM payroll_records
          WHERE company_id = NEW.company_id
            AND employee_id = NEW.module_reference_id
            AND status <> 'paid'
          ORDER BY payroll_period_start DESC
          LIMIT 1
       );
    ELSIF NEW.module_reference_id IS NOT NULL THEN
      UPDATE payroll_records
         SET status = 'paid', payment_id = NEW.id, paid_at = NOW()
       WHERE id = NEW.module_reference_id AND status <> 'paid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Fire the posting on the status transition.
DROP TRIGGER IF EXISTS after_payment_success_post_to_company_account ON payments;
CREATE TRIGGER after_payment_success_post_to_company_account
AFTER UPDATE OF status ON payments
FOR EACH ROW
EXECUTE FUNCTION post_payment_to_company_account();

-- 4. Backfill: post any already-successful payments that were never reflected
--    on a company account. Safe to re-run thanks to the idempotency guard.
DO $$
DECLARE
  r            RECORD;
  v_account_id UUID;
  v_amount     DECIMAL(20,2);
  v_direction  VARCHAR(10);
BEGIN
  FOR r IN
    SELECT * FROM payments
     WHERE status = 'success'
       AND COALESCE(net_amount, gross_amount, 0) > 0
       AND NOT EXISTS (SELECT 1 FROM company_account_transactions t WHERE t.payment_id = payments.id)
  LOOP
    v_amount := COALESCE(r.net_amount, r.gross_amount, 0);
    v_direction := CASE WHEN r.direction = 'disbursement' THEN 'outflow' ELSE 'inflow' END;
    v_account_id := get_or_create_financial_account(r.company_id, resolve_account_type_from_payment_method(r.payment_method));

    INSERT INTO company_account_transactions (
      company_id, account_id, payment_id, reference_table, reference_id,
      entry_date, direction, amount, description, metadata, created_by
    ) VALUES (
      r.company_id, v_account_id, r.id, r.module_reference_type, r.module_reference_id,
      COALESCE(r.completed_at::DATE, CURRENT_DATE), v_direction, v_amount,
      COALESCE(r.description, 'Payment ' || r.our_reference),
      jsonb_build_object('module', r.module, 'method', r.payment_method, 'reference', r.our_reference, 'backfill', true),
      r.initiated_by
    );

    PERFORM update_company_account_balance(v_account_id, v_direction, v_amount);

    IF r.module = 'payroll' AND r.direction = 'disbursement' THEN
      IF r.module_reference_type = 'payroll_run' AND r.module_reference_id IS NOT NULL THEN
        UPDATE payroll_records SET status = 'paid', payment_id = r.id, paid_at = NOW()
         WHERE payroll_run_id = r.module_reference_id AND status <> 'paid';
      ELSIF r.module_reference_id IS NOT NULL THEN
        UPDATE payroll_records SET status = 'paid', payment_id = r.id, paid_at = NOW()
         WHERE id = r.module_reference_id AND status <> 'paid';
      END IF;
    END IF;
  END LOOP;
END $$;
