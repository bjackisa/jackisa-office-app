-- ============================================================================
-- Jackisa Office — legacy backfill (v1)
--
-- One-shot, IDEMPOTENT migration that adapts data created before the licence
-- hub / double-entry ledger existed, so the new invariants hold for old rows.
-- Safe to run repeatedly: every statement guards with NOT EXISTS / COALESCE.
--
-- Run AFTER:
--   full-schema.sql, investment-module-and-ecosystem.sql,
--   payroll-ledger-and-trust-v1.sql, finance-automation-phase2.sql,
--   licensing-and-platform-v1.sql, office-ledger-trust-hardening-v1.sql,
--   office-membership-and-trial-v2.sql, office-unit-trust-ledger-v2.sql.
--
-- What it does:
--   1.  Standard chart of accounts for every company (jo_ensure_chart_of_accounts).
--   2.  Employer NSSF (10%) back-filled on legacy payroll records/runs.
--   3.  Ledger entries back-filled for legacy fund contributions / redemptions /
--       revenue allocations / approved payroll runs / paid dividends.
--   4.  dividend_payments rows created where a dividend is marked paid without one.
--   5.  A "Member" default role + role on role-less employees (belt & braces).
--   6.  A workspace fund for any company missing one.
--   7.  platform_licenses: exactly one is_current row per company.
--   8.  trial_registrations mirrored from legacy trial licences.
--   9.  Company owners linked as active employees where the link is missing.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Standard chart of accounts as a SQL function (mirrors lib/ledger.ts).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jo_ensure_chart_of_accounts(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('1000','Cash & Bank','asset','debit'),
      ('1100','Mobile Money Float','asset','debit'),
      ('1200','Accounts Receivable','asset','debit'),
      ('1500','Fund Investments','asset','debit'),
      ('2000','Accounts Payable','liability','credit'),
      ('2100','VAT Payable','liability','credit'),
      ('2200','PAYE Payable','liability','credit'),
      ('2300','NSSF Payable','liability','credit'),
      ('2310','Employer NSSF Payable','liability','credit'),
      ('2400','Net Salaries Payable','liability','credit'),
      ('2500','Dividends Payable','liability','credit'),
      ('2600','Fund Units Redeemable','liability','credit'),
      ('3000','Owner''s Equity','equity','credit'),
      ('3100','Retained Earnings','equity','credit'),
      ('4000','Sales Revenue','income','credit'),
      ('4500','Fund Management Revenue','income','credit'),
      ('4900','Other Income','income','credit'),
      ('5000','Cost of Goods Sold','expense','debit'),
      ('6000','Salaries & Wages','expense','debit'),
      ('6100','Rent','expense','debit'),
      ('6200','Utilities','expense','debit'),
      ('6300','Marketing','expense','debit'),
      ('6400','Employer NSSF','expense','debit'),
      ('6500','Fund Operating Expense','expense','debit'),
      ('6900','General Expenses','expense','debit')
    ) AS t(code, name, type, normal_side)
  LOOP
    INSERT INTO ledger_accounts (company_id, code, name, type, normal_side, is_system)
    VALUES (p_company_id, r.code, r.name, r.type, r.normal_side, true)
    ON CONFLICT (company_id, code) DO UPDATE SET name = EXCLUDED.name;
  END LOOP;
END;
$$;

-- 1. Chart of accounts for every company.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM jo_ensure_chart_of_accounts(c.id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Employer NSSF on legacy payroll.
-- ---------------------------------------------------------------------------
UPDATE public.payroll_records
   SET employer_nssf_contribution = ROUND(COALESCE(gross_salary, 0) * 0.10, 2)
 WHERE COALESCE(employer_nssf_contribution, 0) = 0
   AND COALESCE(gross_salary, 0) > 0;

UPDATE public.payroll_runs pr
   SET total_employer_nssf = sub.total
  FROM (
    SELECT payroll_run_id, ROUND(SUM(COALESCE(employer_nssf_contribution, 0)), 2) AS total
      FROM public.payroll_records
     GROUP BY payroll_run_id
  ) sub
 WHERE pr.id = sub.payroll_run_id
   AND COALESCE(pr.total_employer_nssf, 0) = 0;

-- ---------------------------------------------------------------------------
-- 3a. Ledger backfill — fund contributions.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t RECORD; v_cash uuid; v_units uuid; v_company uuid;
BEGIN
  FOR t IN
    SELECT ft.* FROM fund_transactions ft
     WHERE ft.tx_type = 'contribution'
       AND NOT EXISTS (SELECT 1 FROM ledger_entries le
                        WHERE le.source_module = 'fund_contribution' AND le.source_id = ft.id)
  LOOP
    SELECT company_id INTO v_company FROM workspace_funds WHERE id = t.fund_id;
    CONTINUE WHEN v_company IS NULL OR COALESCE(t.net_amount,0) = 0;
    PERFORM jo_ensure_chart_of_accounts(v_company);
    v_cash  := jo_ledger_account(v_company, '1000', 'Cash & Bank', 'asset', 'debit');
    v_units := jo_ledger_account(v_company, '2600', 'Fund Units Redeemable', 'liability', 'credit');
    PERFORM jo_post_ledger_entry(v_company, COALESCE(t.created_at::date, CURRENT_DATE),
      'Unit contribution (backfill)', t.id::text, 'fund_contribution', t.id,
      jsonb_build_array(
        jsonb_build_object('account_id', v_cash,  'debit',  t.net_amount, 'memo', 'Cash received'),
        jsonb_build_object('account_id', v_units, 'credit', t.net_amount, 'memo', 'Units issued')
      ), NULL);
  END LOOP;
END $$;

-- 3b. Ledger backfill — fund redemptions.
DO $$
DECLARE
  t RECORD; v_units uuid; v_cash uuid; v_ap uuid; v_tax uuid; v_company uuid;
BEGIN
  FOR t IN
    SELECT ft.* FROM fund_transactions ft
     WHERE ft.tx_type = 'redemption'
       AND NOT EXISTS (SELECT 1 FROM ledger_entries le
                        WHERE le.source_module = 'fund_redemption' AND le.source_id = ft.id)
  LOOP
    SELECT company_id INTO v_company FROM workspace_funds WHERE id = t.fund_id;
    CONTINUE WHEN v_company IS NULL OR COALESCE(t.gross_amount,0) = 0;
    PERFORM jo_ensure_chart_of_accounts(v_company);
    v_units := jo_ledger_account(v_company, '2600', 'Fund Units Redeemable', 'liability', 'credit');
    v_cash  := jo_ledger_account(v_company, '1000', 'Cash & Bank', 'asset', 'debit');
    v_ap    := jo_ledger_account(v_company, '2000', 'Accounts Payable', 'liability', 'credit');
    v_tax   := jo_ledger_account(v_company, '2100', 'VAT Payable', 'liability', 'credit');
    PERFORM jo_post_ledger_entry(v_company, COALESCE(t.created_at::date, CURRENT_DATE),
      'Unit redemption (backfill)', t.id::text, 'fund_redemption', t.id,
      jsonb_strip_nulls(jsonb_build_array(
        jsonb_build_object('account_id', v_units, 'debit',  t.gross_amount,          'memo', 'Units redeemed'),
        jsonb_build_object('account_id', v_cash,  'credit', t.net_amount,            'memo', 'Cash paid out'),
        jsonb_build_object('account_id', v_ap,    'credit', COALESCE(t.jackisa_fee,0),'memo', 'Exit fee owed'),
        jsonb_build_object('account_id', v_tax,   'credit', COALESCE(t.withholding_tax,0), 'memo', 'WHT')
      )), NULL);
  END LOOP;
END $$;

-- 3c. Ledger backfill — revenue allocations.
DO $$
DECLARE
  t RECORD; v_cash uuid; v_fee uuid; v_inc uuid; v_company uuid;
BEGIN
  FOR t IN
    SELECT ft.* FROM fund_transactions ft
     WHERE ft.tx_type = 'revenue_alloc'
       AND NOT EXISTS (SELECT 1 FROM ledger_entries le
                        WHERE le.source_module = 'fund_revenue_alloc' AND le.source_id = ft.id)
  LOOP
    SELECT company_id INTO v_company FROM workspace_funds WHERE id = t.fund_id;
    CONTINUE WHEN v_company IS NULL OR COALESCE(t.gross_amount,0) = 0;
    PERFORM jo_ensure_chart_of_accounts(v_company);
    v_cash := jo_ledger_account(v_company, '1000', 'Cash & Bank', 'asset', 'debit');
    v_fee  := jo_ledger_account(v_company, '6500', 'Fund Operating Expense', 'expense', 'debit');
    v_inc  := jo_ledger_account(v_company, '4900', 'Other Income', 'income', 'credit');
    PERFORM jo_post_ledger_entry(v_company, COALESCE(t.created_at::date, CURRENT_DATE),
      'Sale revenue allocation (backfill)', t.id::text, 'fund_revenue_alloc', t.id,
      jsonb_strip_nulls(jsonb_build_array(
        jsonb_build_object('account_id', v_cash, 'debit',  t.net_amount, 'memo', 'Cash into fund'),
        jsonb_build_object('account_id', v_fee,  'debit',  COALESCE(t.jackisa_fee,0) + COALESCE(t.mgmt_fee,0), 'memo', 'Platform fees'),
        jsonb_build_object('account_id', v_inc,  'credit', t.gross_amount, 'memo', 'Fund income')
      )), NULL);
  END LOOP;
END $$;

-- 3d. Ledger backfill — approved payroll runs.
DO $$
DECLARE
  run RECORD;
BEGIN
  FOR run IN
    SELECT * FROM payroll_runs
     WHERE status = 'approved'
       AND NOT EXISTS (SELECT 1 FROM ledger_entries le
                        WHERE le.source_module = 'payroll_run' AND le.source_id = payroll_runs.id)
  LOOP
    PERFORM jo_ensure_chart_of_accounts(run.company_id);
    PERFORM jo_post_ledger_entry(run.company_id, COALESCE(run.period_end, run.created_at::date),
      'Payroll run (backfill)', run.id::text, 'payroll_run', run.id,
      jsonb_strip_nulls(jsonb_build_array(
        jsonb_build_object('account_id', jo_ledger_account(run.company_id,'6000','Salaries & Wages','expense','debit'),
                           'debit', COALESCE(run.total_gross,0), 'memo', 'Gross salaries'),
        jsonb_build_object('account_id', jo_ledger_account(run.company_id,'6400','Employer NSSF','expense','debit'),
                           'debit', COALESCE(run.total_employer_nssf,0), 'memo', 'Employer NSSF'),
        jsonb_build_object('account_id', jo_ledger_account(run.company_id,'2200','PAYE Payable','liability','credit'),
                           'credit', COALESCE(run.total_paye,0), 'memo', 'PAYE payable'),
        jsonb_build_object('account_id', jo_ledger_account(run.company_id,'2300','NSSF Payable','liability','credit'),
                           'credit', COALESCE(run.total_nssf,0) + COALESCE(run.total_employer_nssf,0), 'memo', 'NSSF payable'),
        jsonb_build_object('account_id', jo_ledger_account(run.company_id,'2400','Net Salaries Payable','liability','credit'),
                           'credit', COALESCE(run.total_net,0), 'memo', 'Net salaries payable')
      )), NULL);
  END LOOP;
END $$;

-- 3e. Ledger backfill — paid dividends.
DO $$
DECLARE
  d RECORD;
BEGIN
  FOR d IN
    SELECT * FROM dividends
     WHERE status = 'paid' AND COALESCE(paid_amount, 0) > 0
       AND NOT EXISTS (SELECT 1 FROM ledger_entries le
                        WHERE le.source_module = 'dividend' AND le.source_id = dividends.id)
  LOOP
    PERFORM jo_ensure_chart_of_accounts(d.company_id);
    PERFORM jo_post_ledger_entry(d.company_id, d.dividend_date,
      'Dividend distribution (backfill)', d.id::text, 'dividend', d.id,
      jsonb_build_array(
        jsonb_build_object('account_id', jo_ledger_account(d.company_id,'3100','Retained Earnings','equity','credit'),
                           'debit', d.paid_amount, 'memo', 'Dividend declared'),
        jsonb_build_object('account_id', jo_ledger_account(d.company_id,'2500','Dividends Payable','liability','credit'),
                           'credit', d.paid_amount, 'memo', 'Dividend payable')
      ), NULL);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. dividend_payments rows for dividends marked paid without a payment row.
-- ---------------------------------------------------------------------------
INSERT INTO dividend_payments (dividend_id, company_id, payment_date, amount)
SELECT d.id, d.company_id, d.dividend_date, d.paid_amount
  FROM dividends d
 WHERE d.status = 'paid' AND COALESCE(d.paid_amount, 0) > 0
   AND NOT EXISTS (SELECT 1 FROM dividend_payments dp WHERE dp.dividend_id = d.id);

-- Keep paid/outstanding in step with the payment rows.
DO $$
DECLARE d RECORD;
BEGIN
  FOR d IN SELECT id FROM dividends LOOP
    PERFORM sync_dividend_financials(d.id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Default role + role-less employees (belt & braces with v2 membership file).
-- ---------------------------------------------------------------------------
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM jo_default_company_role(c.id);
  END LOOP;
END $$;

UPDATE public.company_employees ce
   SET company_role_id = public.jo_default_company_role(ce.company_id)
 WHERE ce.company_role_id IS NULL;

-- ---------------------------------------------------------------------------
-- 6. A workspace fund for any company missing one.
-- ---------------------------------------------------------------------------
INSERT INTO workspace_funds (company_id, fund_name, currency, inception_date)
SELECT c.id, c.name || ' Investment Fund', COALESCE(c.currency, 'UGX'), CURRENT_DATE
  FROM companies c
 WHERE NOT EXISTS (SELECT 1 FROM workspace_funds wf WHERE wf.company_id = c.id);

-- ---------------------------------------------------------------------------
-- 7. Exactly one current licence per company (flag the newest).
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT id, company_id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY
           CASE WHEN is_current THEN 0 ELSE 1 END,
           COALESCE(expires_at, created_at) DESC, created_at DESC) AS rn
    FROM platform_licenses
)
UPDATE platform_licenses pl
   SET is_current = (ranked.rn = 1)
  FROM ranked
 WHERE pl.id = ranked.id
   AND pl.is_current IS DISTINCT FROM (ranked.rn = 1);

-- ---------------------------------------------------------------------------
-- 8. Mirror legacy trial licences into trial_registrations.
-- ---------------------------------------------------------------------------
INSERT INTO trial_registrations (company_id, fingerprint, ip_address, ends_at, status)
SELECT pl.company_id, 'legacy:' || pl.company_id::text, '0.0.0.0',
       COALESCE(pl.expires_at, pl.created_at + interval '7 days'),
       CASE WHEN pl.expires_at IS NOT NULL AND pl.expires_at < now() THEN 'expired' ELSE 'active' END
  FROM platform_licenses pl
 WHERE pl.status = 'trial'
   AND NOT EXISTS (SELECT 1 FROM trial_registrations tr WHERE tr.company_id = pl.company_id);

-- ---------------------------------------------------------------------------
-- 9. Link each company owner as an active administrator employee if missing.
-- ---------------------------------------------------------------------------
INSERT INTO company_employees (company_id, user_id, company_role_id, position, status, joined_at)
SELECT c.id, c.owner_user_id,
       public.jo_default_company_role(c.id), 'Administrator', 'active', now()
  FROM companies c
 WHERE c.owner_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM company_employees ce
                    WHERE ce.company_id = c.id AND ce.user_id = c.owner_user_id);
