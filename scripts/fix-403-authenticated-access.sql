-- ============================================================================
-- Jackisa Office - Global 403 Fix for Supabase REST API
--
-- Purpose:
--   Resolve widespread `403 Forbidden` errors from `/rest/v1/*` endpoints when
--   authenticated users access app data.
--
-- What this script does:
--   1) Grants schema + table privileges to `authenticated`.
--   2) Ensures RLS is enabled on public tables.
--   3) Creates permissive authenticated policies for SELECT/INSERT/UPDATE/DELETE.
--
-- Notes:
--   - This is a broad "unblock the app" policy set.
--   - For production hardening, replace with least-privilege, company-scoped
--     policies per table.
-- ============================================================================

BEGIN;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Ensure future tables are also accessible to authenticated users.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

DO $$
DECLARE
  t RECORD;
  select_policy_name TEXT;
  insert_policy_name TEXT;
  update_policy_name TEXT;
  delete_policy_name TEXT;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename <> 'schema_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);

    select_policy_name := format('%s_authenticated_select', t.tablename);
    insert_policy_name := format('%s_authenticated_insert', t.tablename);
    update_policy_name := format('%s_authenticated_update', t.tablename);
    delete_policy_name := format('%s_authenticated_delete', t.tablename);

    -- SELECT
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t.tablename
        AND policyname = select_policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
        select_policy_name,
        t.tablename
      );
    END IF;

    -- INSERT
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t.tablename
        AND policyname = insert_policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
        insert_policy_name,
        t.tablename
      );
    END IF;

    -- UPDATE
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t.tablename
        AND policyname = update_policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
        update_policy_name,
        t.tablename
      );
    END IF;

    -- DELETE
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t.tablename
        AND policyname = delete_policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (true)',
        delete_policy_name,
        t.tablename
      );
    END IF;
  END LOOP;
END
$$;

COMMIT;
