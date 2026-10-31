-- =============================================================================
-- office-legacy-record-editing-v1.sql
--
-- Support editing of legacy student and employee records so a school can fill in
-- the contact details a transcript or report card needs.
--
-- Why this exists:
--   * `students` was created without a `status` column, but the students and
--     grades screens have always written one. Those updates failed silently, so
--     every student looked "Active" and the write was dropped.
--   * `students` has no `updated_at`, so there is no way to see when a record
--     was last corrected (and the licence sync relies on updated_at windows).
--
-- Idempotent: safe to re-run. Only ADDS a column / trigger; never drops data.
-- =============================================================================

-- 1. students.status ----------------------------------------------------------
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status text;

UPDATE public.students SET status = 'Active' WHERE status IS NULL;

ALTER TABLE public.students ALTER COLUMN status SET DEFAULT 'Active';

-- 2. students.updated_at ------------------------------------------------------
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.students SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL;

ALTER TABLE public.students ALTER COLUMN updated_at SET DEFAULT now();

-- 3. Keep updated_at honest on every edit ------------------------------------
CREATE OR REPLACE FUNCTION public.jo_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS students_touch_updated_at ON public.students;
CREATE TRIGGER students_touch_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.jo_touch_updated_at();

-- company_employees already carries updated_at; keep it honest too.
DROP TRIGGER IF EXISTS company_employees_touch_updated_at ON public.company_employees;
CREATE TRIGGER company_employees_touch_updated_at
  BEFORE UPDATE ON public.company_employees
  FOR EACH ROW
  EXECUTE FUNCTION public.jo_touch_updated_at();

-- 4. Scope students to the company ------------------------------------------
-- The original policy let any signed-in user read/write ANY company's students.
-- Replace it with membership-scoped policies, keeping a linked student able to
-- read their own record.
DROP POLICY IF EXISTS students_authenticated_select ON public.students;
DROP POLICY IF EXISTS students_authenticated_insert ON public.students;
DROP POLICY IF EXISTS students_authenticated_update ON public.students;
DROP POLICY IF EXISTS students_authenticated_delete ON public.students;

DROP POLICY IF EXISTS students_member_select ON public.students;
CREATE POLICY students_member_select ON public.students
  FOR SELECT TO authenticated
  USING (
    public.jo_is_company_member(company_id)
    OR id IN (SELECT student_id FROM public.student_user_links WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS students_member_insert ON public.students;
CREATE POLICY students_member_insert ON public.students
  FOR INSERT TO authenticated
  WITH CHECK (public.jo_is_company_member(company_id));

DROP POLICY IF EXISTS students_member_update ON public.students;
CREATE POLICY students_member_update ON public.students
  FOR UPDATE TO authenticated
  USING (public.jo_is_company_member(company_id))
  WITH CHECK (public.jo_is_company_member(company_id));

DROP POLICY IF EXISTS students_member_delete ON public.students;
CREATE POLICY students_member_delete ON public.students
  FOR DELETE TO authenticated
  USING (public.jo_is_company_member(company_id));
