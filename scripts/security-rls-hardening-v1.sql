-- ============================================================================
-- security-rls-hardening-v1.sql
-- ----------------------------------------------------------------------------
-- Closes the largest hole in the Jackisa Office schema: most public tables were
-- created WITHOUT row level security, while scripts/grant-public-schema-access.sql
-- handed full SELECT/INSERT/UPDATE/DELETE on every table to the `anon` and
-- `authenticated` roles. Because the anon key ships in the browser bundle, that
-- combination let any visitor read and write every tenant's data (users,
-- companies, payroll, invoices, ...).
--
-- This migration is ADDITIVE and IDEMPOTENT. It does not alter or replace any
-- existing table definition or policy; it only:
--   1. Revokes the blanket grants from `anon` (nothing before sign-in should
--      touch tables; Supabase auth does not need table access).
--   2. Enables RLS on every table in the public schema.
--   3. Installs scoped policies: tenant-scoped for tables with company_id,
--      owner-scoped for tables with user_id, parent-scoped for child tables
--      (invoice_items -> invoices, fund_* -> workspace_funds, ...), and
--      read-only for global reference tables.
--   4. Denies all client access to platform-internal tables.
--
-- Run it in the Supabase SQL editor. Re-running is safe.
--
-- Verify afterwards (both queries must return zero rows):
--   SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;
--   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--     WHERE n.nspname='public' AND c.relkind='r'
--       AND NOT EXISTS (SELECT 1 FROM pg_policies p
--                       WHERE p.schemaname='public' AND p.tablename=c.relname);
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Lock down the anon role.
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- authenticated keeps its grants; RLS (below) is what scopes it.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helper: two users "share a company" if both are members of one company.
--    SECURITY DEFINER so the check does not recurse into RLS on company_employees.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jo_shares_company(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_employees mine
    JOIN public.company_employees theirs ON theirs.company_id = mine.company_id
    WHERE mine.user_id = auth.uid()
      AND theirs.user_id = p_user_id
      AND mine.status IN ('active', 'pending_invitation')
      AND theirs.status IN ('active', 'pending_invitation')
  )
$$;

GRANT EXECUTE ON FUNCTION public.jo_shares_company(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Turn on RLS everywhere in public.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Identity tables (no company_id/user_id column, handled explicitly).
-- ---------------------------------------------------------------------------
-- users: see yourself and anyone you share a company with; edit only yourself.
DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.jo_shares_company(id));

DROP POLICY IF EXISTS users_update ON public.users;
CREATE POLICY users_update ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- companies: members read; admins update.
DROP POLICY IF EXISTS companies_select ON public.companies;
CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated
  USING (public.jo_is_company_member(id));

DROP POLICY IF EXISTS companies_update ON public.companies;
CREATE POLICY companies_update ON public.companies FOR UPDATE TO authenticated
  USING (public.jo_is_company_admin(id)) WITH CHECK (public.jo_is_company_admin(id));

-- ---------------------------------------------------------------------------
-- 5. Child tables scoped through their parent. The predicate resolves to the
--    owning company, so a member of company X can only touch X's rows.
-- ---------------------------------------------------------------------------
DO $$
DECLARE m record;
BEGIN
  FOR m IN SELECT * FROM (VALUES
    ('coursework_days',            'module_id IN (SELECT id FROM public.education_modules WHERE public.jo_is_company_member(company_id))'),
    ('final_exams',                'module_id IN (SELECT id FROM public.education_modules WHERE public.jo_is_company_member(company_id))'),
    ('student_enrollments',        'student_id IN (SELECT id FROM public.students WHERE public.jo_is_company_member(company_id))'),
    ('student_grades_coursework',  'student_id IN (SELECT id FROM public.students WHERE public.jo_is_company_member(company_id))'),
    ('student_grades_final_exam',  'student_id IN (SELECT id FROM public.students WHERE public.jo_is_company_member(company_id))'),
    ('invoice_items',              'invoice_id IN (SELECT id FROM public.invoices WHERE public.jo_is_company_member(company_id))'),
    ('sales_order_items',          'sales_order_id IN (SELECT id FROM public.sales_orders WHERE public.jo_is_company_member(company_id))'),
    ('cash_payments',              'payment_id IN (SELECT id FROM public.payments WHERE public.jo_is_company_member(company_id))'),
    ('journal_entries',            'bookkeeping_entry_id IN (SELECT id FROM public.bookkeeping_entries WHERE public.jo_is_company_member(company_id))'),
    ('dividend_allocations',       'dividend_id IN (SELECT id FROM public.dividends WHERE public.jo_is_company_member(company_id))'),
    ('dividend_payments',          'dividend_id IN (SELECT id FROM public.dividends WHERE public.jo_is_company_member(company_id))'),
    ('fund_assets',                'fund_id IN (SELECT id FROM public.workspace_funds WHERE public.jo_is_company_member(company_id))'),
    ('fund_asset_entries',         'asset_id IN (SELECT fa.id FROM public.fund_assets fa JOIN public.workspace_funds wf ON wf.id = fa.fund_id WHERE public.jo_is_company_member(wf.company_id))'),
    ('fund_liabilities',           'fund_id IN (SELECT id FROM public.workspace_funds WHERE public.jo_is_company_member(company_id))'),
    ('liability_repayments',       'liability_id IN (SELECT fl.id FROM public.fund_liabilities fl JOIN public.workspace_funds wf ON wf.id = fl.fund_id WHERE public.jo_is_company_member(wf.company_id))'),
    ('fund_transactions',          'fund_id IN (SELECT id FROM public.workspace_funds WHERE public.jo_is_company_member(company_id))'),
    ('fund_member_positions',      'fund_id IN (SELECT id FROM public.workspace_funds WHERE public.jo_is_company_member(company_id))'),
    ('fund_beneficiaries',         'member_position_id IN (SELECT mp.id FROM public.fund_member_positions mp JOIN public.workspace_funds wf ON wf.id = mp.fund_id WHERE public.jo_is_company_member(wf.company_id))'),
    ('fund_member_signals',        'member_position_id IN (SELECT mp.id FROM public.fund_member_positions mp JOIN public.workspace_funds wf ON wf.id = mp.fund_id WHERE public.jo_is_company_member(wf.company_id))'),
    ('fund_standing_orders',       'member_position_id IN (SELECT mp.id FROM public.fund_member_positions mp JOIN public.workspace_funds wf ON wf.id = mp.fund_id WHERE public.jo_is_company_member(wf.company_id))'),
    ('fund_daily_sales_allocations','fund_id IN (SELECT id FROM public.workspace_funds WHERE public.jo_is_company_member(company_id))'),
    ('fund_revenue_share_rules',   'fund_id IN (SELECT id FROM public.workspace_funds WHERE public.jo_is_company_member(company_id))'),
    ('nav_snapshots',              'fund_id IN (SELECT id FROM public.workspace_funds WHERE public.jo_is_company_member(company_id))'),
    ('investment_clubs',           'fund_id IN (SELECT id FROM public.workspace_funds WHERE public.jo_is_company_member(company_id))'),
    ('investment_club_members',    'club_id IN (SELECT ic.id FROM public.investment_clubs ic JOIN public.workspace_funds wf ON wf.id = ic.fund_id WHERE public.jo_is_company_member(wf.company_id))')
  ) AS t(tbl, pred)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', m.tbl||'_scope_select', m.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', m.tbl||'_scope_select', m.tbl, m.pred);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', m.tbl||'_scope_insert', m.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', m.tbl||'_scope_insert', m.tbl, m.pred);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', m.tbl||'_scope_update', m.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', m.tbl||'_scope_update', m.tbl, m.pred, m.pred);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', m.tbl||'_scope_delete', m.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', m.tbl||'_scope_delete', m.tbl, m.pred);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Global reference / configuration tables: readable by signed-in users,
--    writable only through service-role API routes.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'subscription_tiers', 'platform_features', 'tier_tools', 'role_tool_mappings',
    'system_tools', 'paye_tax_bands', 'coupons', 'company_role_features',
    'company_subscriptions'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_ref_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t||'_ref_select', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Platform-internal tables: no client access at all.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'super_admins', 'processed_webhooks', 'sync_outbox', 'signup_intents',
    'jackisa_revenue_daily'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_deny', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)', t||'_deny', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Generic tenant scoping: any remaining table with a company_id.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=r.tablename) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=r.tablename AND column_name='company_id') THEN
      CONTINUE;
    END IF;

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.jo_is_company_member(company_id))', r.tablename||'_tenant_select', r.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.jo_is_company_member(company_id))', r.tablename||'_tenant_insert', r.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.jo_is_company_member(company_id)) WITH CHECK (public.jo_is_company_member(company_id))', r.tablename||'_tenant_update', r.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.jo_is_company_admin(company_id))', r.tablename||'_tenant_delete', r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Generic owner scoping: any remaining table with a user_id.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=r.tablename) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=r.tablename AND column_name='user_id') THEN
      CONTINUE;
    END IF;

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid())', r.tablename||'_own_select', r.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())', r.tablename||'_own_insert', r.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', r.tablename||'_own_update', r.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (user_id = auth.uid())', r.tablename||'_own_delete', r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 10. Anything still without a policy is denied by default (RLS with no policy
--     = no access). Surface it so the operator can classify it deliberately.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
      AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname)
  LOOP
    RAISE NOTICE 'RLS default-deny (no policy) on public.% — classify it if the app needs client access', r.tablename;
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK: policies can be dropped per table and RLS disabled, e.g.
--   DROP POLICY IF EXISTS invoices_tenant_select ON public.invoices;
--   ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;
-- Do NOT re-run grant-public-schema-access.sql on production.
-- ============================================================================
