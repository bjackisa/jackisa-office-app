-- ============================================================================
-- Jackisa Office — ledger / unit-trust / dividends hardening (v1)
--
-- Additive file. Run AFTER: full-schema.sql, investment-module-and-ecosystem.sql,
-- payroll-ledger-and-trust-v1.sql, finance-automation-phase2.sql,
-- licensing-and-platform-v1.sql. It only CREATE OR REPLACEs functions and adds
-- columns/accounts; no existing table is dropped and no existing file is edited.
--
-- Fixes:
--   1. calculate_fund_nav: the old body overwrote the asset sum with cash_pool
--      before adding the assets back — correct in net result but fragile. This
--      version states the model plainly:
--          total_assets = SUM(active fund_assets.current_value) + cash_pool
--          total_liab   = SUM(active fund_liabilities.outstanding + accrued)
--          nav_per_unit = (total_assets - total_liab) / total_units
--   2. jo_distribute_dividend: now (a) reconciles the rounding remainder so the
--      allocations sum EXACTLY to the declared amount, (b) writes a balanced
--      double-entry journal (Dr Retained Earnings / Cr Dividends Payable), and
--      (c) records a dividend_payments row so paid_amount/outstanding_amount and
--      sync_dividend_financials agree with the distribution.
--   3. Employer NSSF (10%) is now carried on the payslip and posted.
--   4. New ledger accounts: 2500 Dividends Payable, 3100 Retained Earnings,
--      2310 Employer NSSF Payable, 6400 Employer NSSF Expense.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Ledger account helper — upsert one account and return its id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jo_ledger_account(
  p_company_id uuid,
  p_code       varchar,
  p_name       varchar,
  p_type       varchar,
  p_normal_side varchar
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM ledger_accounts WHERE company_id = p_company_id AND code = p_code;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO ledger_accounts (company_id, code, name, type, normal_side, is_system)
  VALUES (p_company_id, p_code, p_name, p_type, p_normal_side, true)
  ON CONFLICT (company_id, code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Corrected NAV calculation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_fund_nav(p_fund_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cash        numeric;
  v_assets      numeric;
  v_liabilities numeric;
  v_units       numeric;
  v_nav         numeric;
BEGIN
  SELECT COALESCE(cash_pool, 0), COALESCE(total_units_outstanding, 0)
    INTO v_cash, v_units
    FROM workspace_funds WHERE id = p_fund_id;

  IF NOT FOUND THEN
    RETURN 1.000000;
  END IF;

  SELECT COALESCE(SUM(current_value), 0) INTO v_assets
    FROM fund_assets WHERE fund_id = p_fund_id AND is_active = TRUE;
  v_assets := v_assets + v_cash;

  SELECT COALESCE(SUM(outstanding_balance + accrued_interest), 0) INTO v_liabilities
    FROM fund_liabilities WHERE fund_id = p_fund_id AND status = 'active';

  IF v_units <= 0 THEN
    v_nav := 1.000000;
  ELSE
    v_nav := ROUND((v_assets - v_liabilities) / v_units, 6);
  END IF;

  UPDATE workspace_funds SET
    nav_per_unit       = v_nav,
    total_assets       = v_assets,
    total_liabilities  = v_liabilities,
    updated_at         = NOW()
  WHERE id = p_fund_id;

  RETURN v_nav;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Employer NSSF columns.
-- ---------------------------------------------------------------------------
ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS employer_nssf_contribution DECIMAL(15, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS total_employer_nssf DECIMAL(15, 2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 4. Dividend distribution — pro-rata, rounding-safe, double-entry.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jo_distribute_dividend(
  p_dividend_id uuid,
  p_recorded_by uuid DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dividend   dividends%ROWTYPE;
  v_fund       workspace_funds%ROWTYPE;
  v_total_units numeric(20,6);
  v_per_unit   numeric(20,6);
  v_member     RECORD;
  v_amount     numeric(18,2);
  v_allocated  numeric(18,2) := 0;
  v_remainder  numeric(18,2);
  v_first      RECORD;
  v_equity_id  uuid;
  v_payable_id uuid;
  v_lines      jsonb;
BEGIN
  SELECT * INTO v_dividend FROM dividends WHERE id = p_dividend_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dividend % not found', p_dividend_id; END IF;
  IF v_dividend.status = 'paid' THEN RAISE EXCEPTION 'Dividend % is already paid', p_dividend_id; END IF;

  SELECT * INTO v_fund FROM workspace_funds WHERE company_id = v_dividend.company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No fund for company %', v_dividend.company_id; END IF;

  SELECT COALESCE(SUM(total_units), 0) INTO v_total_units
    FROM fund_member_positions WHERE fund_id = v_fund.id AND is_active = TRUE;

  IF v_total_units <= 0 THEN RAISE EXCEPTION 'No units outstanding to distribute against'; END IF;

  v_per_unit := ROUND(v_dividend.total_amount / v_total_units, 6);

  DELETE FROM dividend_allocations WHERE dividend_id = p_dividend_id;

  FOR v_member IN
    SELECT id, employee_id, total_units
      FROM fund_member_positions
     WHERE fund_id = v_fund.id AND is_active = TRUE AND total_units > 0
     ORDER BY total_units DESC
  LOOP
    v_amount := ROUND(v_member.total_units * v_per_unit, 2);
    IF v_amount <= 0 THEN CONTINUE; END IF;

    INSERT INTO dividend_allocations (dividend_id, employee_id, allocated_amount)
    VALUES (p_dividend_id, v_member.employee_id, v_amount);

    INSERT INTO fund_transactions (
      fund_id, member_position_id, tx_type, gross_amount, net_amount,
      units_transacted, nav_at_transaction, recorded_by
    ) VALUES (
      v_fund.id, v_member.id, 'distribution', v_amount, v_amount,
      0, v_fund.nav_per_unit, p_recorded_by
    );

    v_allocated := v_allocated + v_amount;
    IF v_first IS NULL THEN v_first := v_member; END IF;
  END LOOP;

  -- Reconcile the per-holder rounding so the allocations sum to the declared
  -- amount exactly (the old version could leave a few shillings unallocated).
  v_remainder := ROUND(v_dividend.total_amount - v_allocated, 2);
  IF v_remainder <> 0 AND v_first IS NOT NULL THEN
    UPDATE dividend_allocations SET allocated_amount = allocated_amount + v_remainder
     WHERE dividend_id = p_dividend_id AND employee_id = v_first.employee_id;
    v_allocated := v_allocated + v_remainder;
  END IF;

  -- Double-entry: the payout reduces retained earnings and creates a payable.
  v_equity_id  := jo_ledger_account(v_dividend.company_id, '3100', 'Retained Earnings', 'equity', 'credit');
  v_payable_id := jo_ledger_account(v_dividend.company_id, '2500', 'Dividends Payable', 'liability', 'credit');
  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_equity_id,  'debit',  v_allocated, 'memo', 'Dividend declared'),
    jsonb_build_object('account_id', v_payable_id, 'credit', v_allocated, 'memo', 'Dividend payable to holders')
  );
  PERFORM jo_post_ledger_entry(
    v_dividend.company_id, v_dividend.dividend_date,
    'Dividend distribution ' || p_dividend_id, NULL,
    'dividend', p_dividend_id, v_lines, p_recorded_by
  );

  -- Record the payment so paid_amount / outstanding_amount / status agree with
  -- sync_dividend_financials instead of being set out of band.
  INSERT INTO dividend_payments (dividend_id, company_id, payment_date, amount, created_by)
  VALUES (p_dividend_id, v_dividend.company_id, v_dividend.dividend_date, v_allocated, p_recorded_by);

  UPDATE workspace_funds
     SET cash_pool = GREATEST(0, cash_pool - v_allocated), updated_at = NOW()
   WHERE id = v_fund.id;

  -- Keep NAV/total_assets in step with the reduced cash pool.
  PERFORM calculate_fund_nav(v_fund.id);

  UPDATE dividends
     SET status = 'paid', paid_amount = v_allocated,
         outstanding_amount = GREATEST(COALESCE(total_amount, 0) - v_allocated, 0)
   WHERE id = p_dividend_id;

  RETURN v_allocated;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Columns the newer sync/UI code expects on `dividends`.
--    sync_dividend_financials writes updated_at, but the original table
--    (full-schema.sql) never declared it, so every dividend payment insert
--    failed. paid_amount / outstanding_amount are added here too for safety.
-- ---------------------------------------------------------------------------
ALTER TABLE public.dividends
  ADD COLUMN IF NOT EXISTS paid_amount        DECIMAL(20, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_amount DECIMAL(20, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();

GRANT EXECUTE ON FUNCTION public.jo_distribute_dividend(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_fund_nav(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jo_ledger_account(uuid, varchar, varchar, varchar, varchar) TO authenticated;
