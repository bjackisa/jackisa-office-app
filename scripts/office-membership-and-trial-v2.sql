-- ============================================================================
-- Jackisa Office — membership admission fixes (v2)
--
-- Additive file. Run AFTER full-schema.sql and licensing-and-platform-v1.sql.
--
-- Problem this fixes:
--   company_employees.company_role_id is NOT NULL, but the join-request and
--   invite-link admission paths insert a member with no role (the invite may
--   not carry one). Every "request to join" then failed at insert time with a
--   null-value-in-column error — the join flow was broken end to end.
--
-- Fixes:
--   1. company_role_id becomes nullable on company_employees.
--   2. Every company gets a default "Member" role, auto-created on company
--      insert and back-filled for existing companies.
--   3. jo_default_company_role(company_id) returns that role id so the API can
--      assign it when an invite/request carries no explicit role.
-- ============================================================================

-- 1. Allow a member to exist before a role is assigned.
ALTER TABLE public.company_employees
  ALTER COLUMN company_role_id DROP NOT NULL;

-- 2. Default "Member" role per company.
CREATE OR REPLACE FUNCTION public.jo_default_company_role(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM company_roles
   WHERE company_id = p_company_id AND name = 'Member'
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO company_roles (company_id, name, description, is_default)
  VALUES (p_company_id, 'Member', 'Standard team member', true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Auto-create the default role for every new company.
CREATE OR REPLACE FUNCTION public.jo_company_default_role_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM jo_default_company_role(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_default_role ON public.companies;
CREATE TRIGGER trg_company_default_role
AFTER INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.jo_company_default_role_trigger();

-- Back-fill existing companies.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.companies LOOP
    PERFORM jo_default_company_role(r.id);
  END LOOP;
END $$;

-- Any member left without a role (a legacy join request that slipped through)
-- picks up the default for their company.
UPDATE public.company_employees ce
   SET company_role_id = public.jo_default_company_role(ce.company_id)
 WHERE ce.company_role_id IS NULL;

GRANT EXECUTE ON FUNCTION public.jo_default_company_role(uuid) TO authenticated;
