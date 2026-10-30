-- ============================================================================
-- Jackisa Office — Payroll Runs, Double-Entry Ledger & Dividend Distribution (v1)
--
-- ADDITIVE ONLY. Creates new tables and adds nullable columns. It never alters
-- or drops an existing definition, because full-schema.sql, payment-gateway.sql,
-- investment-module-and-ecosystem.sql and licensing-and-platform-v1.sql are
-- already imported into Supabase.
--
-- NOTE: the unit-trust fund model (workspace_funds, fund_member_positions,
-- fund_transactions, nav_snapshots, calculate_fund_nav, process_contribution,
-- process_redemption, run_daily_fund_automation) already exists in
-- investment-module-and-ecosystem.sql. This file does NOT recreate it — it only
-- adds the pieces that were missing: payroll runs, a real double-entry ledger,
-- and a dividend distribution routine that rides on the existing fund model.
--
-- Sections
--   1. Payroll runs + payslip columns
--   2. Double-entry ledger (accounts, entries, lines) + balance trigger
--   3. Dividend distribution (fund-based, pro-rata by units)
--   4. Grants + RLS
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. PAYROLL
--    A payroll run is one month's batch. Records are the per-employee payslips,
--    generated from salary_structures (not a static column), and each can be
--    linked to the payment that actually disbursed it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  status            varchar(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','approved','paid','cancelled')),
  currency          varchar(3) NOT NULL DEFAULT 'UGX',
  employee_count    integer NOT NULL DEFAULT 0,
  total_gross       numeric(18,2) NOT NULL DEFAULT 0,
  total_nssf        numeric(18,2) NOT NULL DEFAULT 0,
  total_paye        numeric(18,2) NOT NULL DEFAULT 0,
  total_net         numeric(18,2) NOT NULL DEFAULT 0,
  notes             text,
  created_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at       timestamptz,
  paid_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_company ON public.payroll_runs (company_id, period_start DESC);

-- Link each payslip to its run and to the disbursement payment.
ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS payroll_run_id  uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payslip_number  varchar(50),
  ADD COLUMN IF NOT EXISTS payment_id      uuid,
  ADD COLUMN IF NOT EXISTS paid_at         timestamptz,
  ADD COLUMN IF NOT EXISTS currency        varchar(3) DEFAULT 'UGX',
  ADD COLUMN IF NOT EXISTS snapshot        jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_payroll_records_run ON public.payroll_records (payroll_run_id);

-- ============================================================================
-- 2. DOUBLE-ENTRY LEDGER
--    Every posting is a balanced entry (sum of debits = sum of credits), enforced
--    by a deferred constraint trigger so a multi-line insert can be validated
--    once the whole entry is present.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code          varchar(20) NOT NULL,
  name          varchar(255) NOT NULL,
  type          varchar(20) NOT NULL
                CHECK (type IN ('asset','liability','equity','income','expense')),
  normal_side   varchar(6) NOT NULL CHECK (normal_side IN ('debit','credit')),
  currency      varchar(3) NOT NULL DEFAULT 'UGX',
  is_system     boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entry_date     date NOT NULL,
  memo           text,
  reference      varchar(100),
  source_module  varchar(50),
  source_id      uuid,
  currency       varchar(3) NOT NULL DEFAULT 'UGX',
  status         varchar(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','void')),
  created_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_company ON public.ledger_entries (company_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_source ON public.ledger_entries (source_module, source_id);

CREATE TABLE IF NOT EXISTS public.ledger_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id        uuid NOT NULL REFERENCES public.ledger_entries(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES public.ledger_accounts(id),
  debit           numeric(18,2) NOT NULL DEFAULT 0,
  credit          numeric(18,2) NOT NULL DEFAULT 0,
  memo            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0))
);

CREATE INDEX IF NOT EXISTS idx_ledger_lines_entry ON public.ledger_lines (entry_id);
CREATE INDEX IF NOT EXISTS idx_ledger_lines_account ON public.ledger_lines (account_id);

-- Balanced-entry enforcement: every entry must have the same debit and credit
-- totals. Runs as a constraint trigger deferred to the end of the transaction
-- so the caller can insert all lines before validation.
CREATE OR REPLACE FUNCTION public.jo_ledger_check_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry uuid := COALESCE(NEW.entry_id, OLD.entry_id);
  v_count integer;
  v_debit numeric(18,2);
  v_credit numeric(18,2);
BEGIN
  SELECT COUNT(*), COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO v_count, v_debit, v_credit
    FROM public.ledger_lines WHERE entry_id = v_entry;

  IF v_count > 0 AND v_debit <> v_credit THEN
    RAISE EXCEPTION 'Ledger entry % is unbalanced: debit % <> credit %', v_entry, v_debit, v_credit;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_balance ON public.ledger_lines;
CREATE CONSTRAINT TRIGGER trg_ledger_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.ledger_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.jo_ledger_check_balance();

-- Atomic posting helper. Inserts an entry and all of its lines in one
-- transaction, so the deferred balance trigger sees the whole entry. Returns
-- the new entry id. Rejects an unbalanced posting up front with a clear error.
CREATE OR REPLACE FUNCTION public.jo_post_ledger_entry(
  p_company_id uuid,
  p_entry_date date,
  p_memo text,
  p_reference varchar,
  p_source_module varchar,
  p_source_id uuid,
  p_lines jsonb,
  p_created_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry uuid;
  v_debit numeric(18,2) := 0;
  v_credit numeric(18,2) := 0;
  v_line jsonb;
BEGIN
  IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'A ledger entry needs at least two lines';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_debit := v_debit + COALESCE((v_line->>'debit')::numeric, 0);
    v_credit := v_credit + COALESCE((v_line->>'credit')::numeric, 0);
  END LOOP;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Unbalanced ledger entry: debit % <> credit %', v_debit, v_credit;
  END IF;

  INSERT INTO public.ledger_entries
    (company_id, entry_date, memo, reference, source_module, source_id, created_by)
  VALUES
    (p_company_id, p_entry_date, p_memo, p_reference, p_source_module, p_source_id, p_created_by)
  RETURNING id INTO v_entry;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.ledger_lines (entry_id, company_id, account_id, debit, credit, memo)
    VALUES (
      v_entry,
      p_company_id,
      (v_line->>'account_id')::uuid,
      COALESCE((v_line->>'debit')::numeric, 0),
      COALESCE((v_line->>'credit')::numeric, 0),
      v_line->>'memo'
    );
  END LOOP;

  RETURN v_entry;
END;
$$;

-- ============================================================================
-- 3. DIVIDEND DISTRIBUTION
--    Pays a declared dividend out of the fund to its unit holders, pro-rata by
--    units held. Rides on the existing fund_member_positions / fund_transactions
--    model (tx_type 'distribution') and reduces the fund cash pool. Records a
--    row per member in dividend_allocations so the existing dividends UI shows
--    the split. Returns the total distributed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.jo_distribute_dividend(
  p_dividend_id uuid,
  p_recorded_by uuid DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dividend dividends%ROWTYPE;
  v_fund workspace_funds%ROWTYPE;
  v_total_units numeric(20,6);
  v_per_unit numeric(20,6);
  v_member RECORD;
  v_amount numeric(18,2);
  v_total numeric(18,2) := 0;
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

    v_total := v_total + v_amount;
  END LOOP;

  UPDATE workspace_funds
     SET cash_pool = GREATEST(0, cash_pool - v_total), updated_at = NOW()
   WHERE id = v_fund.id;

  UPDATE dividends
     SET status = 'paid'
   WHERE id = p_dividend_id;

  RETURN v_total;
END;
$$;

-- ============================================================================
-- 4. GRANTS + RLS
--    RLS is enabled here; policies use the jo_is_company_member / admin helpers
--    from licensing-and-platform-v1.sql.
-- ============================================================================

ALTER TABLE public.payroll_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_lines    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payroll_runs','ledger_accounts','ledger_entries','ledger_lines'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'jo_member_select_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.jo_is_company_member(company_id))',
      'jo_member_select_' || t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'jo_admin_write_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.jo_is_company_admin(company_id)) WITH CHECK (public.jo_is_company_admin(company_id))',
      'jo_admin_write_' || t, t);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.jo_post_ledger_entry(uuid, date, text, varchar, varchar, uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jo_distribute_dividend(uuid, uuid) TO authenticated;

COMMIT;
