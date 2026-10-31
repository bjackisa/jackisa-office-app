-- ============================================================================
-- industry-education-and-documents-v1.sql
-- ----------------------------------------------------------------------------
-- NEW migration. Additive and idempotent. Adds:
--   1. companies.industry_slug — the chosen industry profile (drives the
--      tailored dashboard and module spotlight).
--   2. students guardian contact details — where marks and transcripts are sent.
--   3. document_deliveries — an audit trail of every document generated on the
--      hub (marks notifications, transcripts, receipts, reports) and how it was
--      delivered over WhatsApp / email.
--
-- The heavy work (PDF rendering, sending) happens on lic.jackisa.com; this
-- table only records the outcome so the office app can show a history and
-- re-send on demand.
-- ============================================================================

BEGIN;

-- 1. Industry profile on the company.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS industry_slug VARCHAR(60) DEFAULT NULL;

-- Backfill the slug from the legacy free-text industry where it maps cleanly.
UPDATE public.companies SET industry_slug = 'education'
  WHERE industry_slug IS NULL AND lower(industry) LIKE '%educat%';
UPDATE public.companies SET industry_slug = 'retail'
  WHERE industry_slug IS NULL AND (lower(industry) LIKE '%retail%' OR lower(industry) LIKE '%trade%');
UPDATE public.companies SET industry_slug = 'technology'
  WHERE industry_slug IS NULL AND (lower(industry) LIKE '%tech%' OR lower(industry) LIKE '%software%' OR lower(industry) LIKE '%it %');
UPDATE public.companies SET industry_slug = 'finance'
  WHERE industry_slug IS NULL AND (lower(industry) LIKE '%financ%' OR lower(industry) LIKE '%sacco%' OR lower(industry) LIKE '%invest%' OR lower(industry) LIKE '%bank%');
UPDATE public.companies SET industry_slug = 'healthcare'
  WHERE industry_slug IS NULL AND (lower(industry) LIKE '%health%' OR lower(industry) LIKE '%clinic%' OR lower(industry) LIKE '%hospital%' OR lower(industry) LIKE '%medical%');
UPDATE public.companies SET industry_slug = 'ngo'
  WHERE industry_slug IS NULL AND (lower(industry) LIKE '%ngo%' OR lower(industry) LIKE '%non-profit%' OR lower(industry) LIKE '%nonprofit%');
UPDATE public.companies SET industry_slug = 'agriculture'
  WHERE industry_slug IS NULL AND (lower(industry) LIKE '%agric%' OR lower(industry) LIKE '%farm%');
UPDATE public.companies SET industry_slug = 'hospitality'
  WHERE industry_slug IS NULL AND (lower(industry) LIKE '%hospitality%' OR lower(industry) LIKE '%hotel%' OR lower(industry) LIKE '%restaurant%' OR lower(industry) LIKE '%food%');
UPDATE public.companies SET industry_slug = 'logistics'
  WHERE industry_slug IS NULL AND (lower(industry) LIKE '%logistic%' OR lower(industry) LIKE '%transport%' OR lower(industry) LIKE '%freight%');
UPDATE public.companies SET industry_slug = 'services'
  WHERE industry_slug IS NULL AND (lower(industry) LIKE '%service%' OR lower(industry) LIKE '%consult%' OR lower(industry) LIKE '%profession%');
UPDATE public.companies SET industry_slug = 'manufacturing'
  WHERE industry_slug IS NULL AND (lower(industry) LIKE '%manufact%' OR lower(industry) LIKE '%product%' OR lower(industry) LIKE '%factor%');
UPDATE public.companies SET industry_slug = 'other'
  WHERE industry_slug IS NULL;

-- 2. Guardian contact details, so results can reach a parent.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS guardian_name  VARCHAR(160) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(40)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS guardian_email VARCHAR(160) DEFAULT NULL;

-- 3. Document delivery audit trail.
CREATE TABLE IF NOT EXISTS public.document_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  student_id    UUID REFERENCES public.students(id) ON DELETE SET NULL,
  kind          VARCHAR(40)  NOT NULL,                 -- marks_notification | transcript | receipt | report
  channel       VARCHAR(20)  NOT NULL,                 -- whatsapp | email | both
  recipient     VARCHAR(200),
  subject       VARCHAR(200),
  document_ref  VARCHAR(120),
  storage_path  TEXT,
  status        VARCHAR(20)  NOT NULL DEFAULT 'queued',-- queued | sent | failed
  provider_ref  VARCHAR(120),
  error         TEXT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_deliveries_company_idx
  ON public.document_deliveries (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS document_deliveries_student_idx
  ON public.document_deliveries (student_id, kind, created_at DESC);

ALTER TABLE public.document_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_deliveries_tenant_select ON public.document_deliveries;
CREATE POLICY document_deliveries_tenant_select ON public.document_deliveries
  FOR SELECT TO authenticated USING (public.jo_is_company_member(company_id));

DROP POLICY IF EXISTS document_deliveries_tenant_insert ON public.document_deliveries;
CREATE POLICY document_deliveries_tenant_insert ON public.document_deliveries
  FOR INSERT TO authenticated WITH CHECK (public.jo_is_company_member(company_id));

DROP POLICY IF EXISTS document_deliveries_tenant_update ON public.document_deliveries;
CREATE POLICY document_deliveries_tenant_update ON public.document_deliveries
  FOR UPDATE TO authenticated USING (public.jo_is_company_member(company_id))
  WITH CHECK (public.jo_is_company_member(company_id));

DROP POLICY IF EXISTS document_deliveries_tenant_delete ON public.document_deliveries;
CREATE POLICY document_deliveries_tenant_delete ON public.document_deliveries
  FOR DELETE TO authenticated USING (public.jo_is_company_admin(company_id));

COMMIT;
