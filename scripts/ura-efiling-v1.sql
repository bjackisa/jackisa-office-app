-- ============================================================================
-- URA e-filing v1
--
-- Two tables back the tax e-filing feature:
--
--   tax_adjustments — the free-form rows a user adds to strengthen a return:
--     invoices, sales, assets, liabilities, credit notes, add-backs and
--     deductions. Nothing here is a document the user must keep elsewhere; it is
--     the extra detail that turns a rough total into a filable return.
--
--   ura_filings — the record of each return generated: period, computed totals,
--     the validation result and who it was delivered to. It gives the user a
--     filing history and lets a return be re-generated or re-sent.
--
-- Both are scoped to the company and gated by the same membership RLS used
-- across the office schema.
-- ============================================================================

-- URA needs a TIN on every return. The schema has `tax_id`; the tax screens
-- (and this feature) read `tin`, so add it and backfill from tax_id once.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS tin VARCHAR(30);
UPDATE public.companies SET tin = tax_id WHERE (tin IS NULL OR tin = '') AND tax_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tax_adjustments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  return_type   varchar(20) NOT NULL DEFAULT 'income_tax'
                CHECK (return_type IN ('income_tax','paye')),
  period_start  date,
  period_end    date,
  -- income | expense | asset | liability | addition | deduction
  kind          varchar(20) NOT NULL DEFAULT 'addition'
                CHECK (kind IN ('income','expense','asset','liability','addition','deduction')),
  label         varchar(200) NOT NULL,
  amount        numeric(18,2) NOT NULL DEFAULT 0,
  reference     varchar(100),
  notes         text,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_adjustments_company
  ON public.tax_adjustments (company_id, return_type, period_start DESC);

CREATE TABLE IF NOT EXISTS public.ura_filings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  return_type       varchar(20) NOT NULL DEFAULT 'income_tax'
                    CHECK (return_type IN ('income_tax','paye')),
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  status            varchar(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','validated','delivered','filed')),
  taxpayer_name     varchar(255),
  tin               varchar(30),
  gross_income      numeric(18,2) DEFAULT 0,
  allowable_expenses numeric(18,2) DEFAULT 0,
  chargeable_income numeric(18,2) DEFAULT 0,
  tax_payable       numeric(18,2) DEFAULT 0,
  gross_salary      numeric(18,2) DEFAULT 0,
  total_paye        numeric(18,2) DEFAULT 0,
  employee_count    integer DEFAULT 0,
  validation_ok     boolean DEFAULT false,
  validation        jsonb,
  summary           jsonb,
  deliver_to        jsonb DEFAULT '[]'::jsonb,
  created_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ura_filings_company
  ON public.ura_filings (company_id, period_start DESC);

-- Keep updated_at honest on the filing history.
CREATE OR REPLACE FUNCTION public.jo_touch_ura_filings()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ura_filings_touch ON public.ura_filings;
CREATE TRIGGER trg_ura_filings_touch
  BEFORE UPDATE ON public.ura_filings
  FOR EACH ROW EXECUTE FUNCTION public.jo_touch_ura_filings();

-- ---------------------------------------------------------------------------
-- Row level security: a company member may read and write their own rows.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tax_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ura_filings    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_adjustments_member_all ON public.tax_adjustments;
CREATE POLICY tax_adjustments_member_all ON public.tax_adjustments
  FOR ALL
  USING (public.jo_is_company_member(company_id))
  WITH CHECK (public.jo_is_company_member(company_id));

DROP POLICY IF EXISTS ura_filings_member_all ON public.ura_filings;
CREATE POLICY ura_filings_member_all ON public.ura_filings
  FOR ALL
  USING (public.jo_is_company_member(company_id))
  WITH CHECK (public.jo_is_company_member(company_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_adjustments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ura_filings    TO authenticated;

-- Register the feature at the basic tier so every plan can file.
INSERT INTO public.platform_features (slug, name, category, min_tier, sort_order)
VALUES ('ura_efiling', 'URA e-Filing', 'finance', 'basic', 35)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, category = EXCLUDED.category,
      min_tier = EXCLUDED.min_tier, sort_order = EXCLUDED.sort_order;
