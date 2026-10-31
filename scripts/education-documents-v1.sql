-- ============================================================================
-- Jackisa Office — education documents & delivery tracking (additive)
-- Run in Supabase SQL editor. Safe to re-run: every statement is guarded.
-- Adds the contact column the guardian notifications need, and a log of every
-- document the licence hub generated and sent on the school's behalf.
-- ============================================================================

-- 1. Student phone, so marks/report cards can also reach the student directly.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS phone text;

-- 2. One row per document the hub rendered and delivered (marks notice, report
--    card, receipt). Powers the "what has been sent" history and re-send.
CREATE TABLE IF NOT EXISTS public.document_deliveries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  student_id    uuid REFERENCES public.students(id) ON DELETE SET NULL,
  kind          text NOT NULL,                       -- marks_notification | transcript | receipt | tax_pack
  channel       text NOT NULL DEFAULT 'email',        -- email | whatsapp | both
  recipient     text,                                 -- comma-separated addresses/numbers
  subject       text,
  document_ref  uuid,                                 -- lic documents.id
  storage_path  text,
  status        text NOT NULL DEFAULT 'sent',          -- sent | failed
  error         text,
  payload       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_deliveries_company_idx
  ON public.document_deliveries (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS document_deliveries_student_idx
  ON public.document_deliveries (student_id, created_at DESC);

-- 3. Row-level security: a company may only read its own delivery history.
--    Writes happen server-side with the service role, which bypasses RLS.
ALTER TABLE public.document_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_deliveries_company_read ON public.document_deliveries;
CREATE POLICY document_deliveries_company_read ON public.document_deliveries
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM public.company_employees WHERE user_id = auth.uid()
    )
  );
