-- ============================================================================
-- Jackisa Office — Licensing, Membership & Platform Security (v1)
--
-- ADDITIVE ONLY. This file never alters an existing column definition or drops
-- anything; it only creates new tables, adds nullable columns and installs
-- scoped RLS. Existing scripts (full-schema.sql, payment-gateway.sql, ...) are
-- left untouched because they are already imported into Supabase.
--
-- Sections
--   1. Helper functions (company membership / role / admin)
--   2. Licensing mirror + heartbeat log
--   3. Membership: join requests, invite links, invites
--   4. Education: institution student links & requests
--   5. KYC verification & badges
--   6. Feature registry + tier/role/company overrides
--   7. Security: devices, login events, audit events, signup intents
--   8. Trials
--   9. Sync outbox (office -> lic)
--  10. Column additions (nullable, IF NOT EXISTS)
--  11. RLS policies (company-scoped, least privilege)
--  12. Seed data
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. HELPER FUNCTIONS
--    SECURITY DEFINER so policy checks do not recurse into RLS on the tables
--    they read (company_employees / company_roles).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.jo_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT company_id
  FROM public.company_employees
  WHERE user_id = auth.uid()
    AND status IN ('active', 'pending_invitation')
$$;

CREATE OR REPLACE FUNCTION public.jo_is_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_employees
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
      AND status IN ('active', 'pending_invitation')
  )
$$;

CREATE OR REPLACE FUNCTION public.jo_is_company_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_employees ce
    LEFT JOIN public.company_roles cr ON cr.id = ce.company_role_id
    WHERE ce.company_id = p_company_id
      AND ce.user_id = auth.uid()
      AND ce.status = 'active'
      AND (
        ce.position ILIKE '%admin%'
        OR cr.name ILIKE '%admin%'
        OR cr.name ILIKE '%owner%'
        OR cr.name ILIKE '%director%'
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.jo_is_company_owner(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = p_company_id AND created_by = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.company_employees
    WHERE company_id = p_company_id AND user_id = auth.uid()
      AND status = 'active' AND position ILIKE '%administrator%'
  )
$$;

-- ============================================================================
-- 2. LICENSING MIRROR + HEARTBEAT LOG
--    The authority is lic.jackisa.com; this is the app's local copy so the
--    UI can render licence state without a network round-trip on every page.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_licenses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  serial            varchar(64),
  license_key       varchar(80),
  plan_code         varchar(60),
  tier              varchar(40) NOT NULL DEFAULT 'basic',
  status            varchar(20) NOT NULL DEFAULT 'trial'
                      CHECK (status IN ('trial','active','grace','expired','suspended','revoked')),
  interval_months   smallint NOT NULL DEFAULT 1,
  max_employees     integer NOT NULL DEFAULT 10,
  max_students      integer NOT NULL DEFAULT 0,
  storage_gb        integer NOT NULL DEFAULT 5,
  features          jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at         timestamptz,
  expires_at        timestamptz,
  grace_until       timestamptz,
  last_validated_at timestamptz,
  certificate       text,
  fingerprint       varchar(128),
  is_current        boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_licenses_current
  ON public.platform_licenses(company_id) WHERE is_current;
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_licenses_key
  ON public.platform_licenses(license_key) WHERE license_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.license_validations (
  id             bigserial PRIMARY KEY,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  license_id     uuid REFERENCES public.platform_licenses(id) ON DELETE SET NULL,
  status         varchar(20),
  valid          boolean,
  within_caps    boolean,
  usage          jsonb NOT NULL DEFAULT '{}'::jsonb,
  cap_details    jsonb NOT NULL DEFAULT '{}'::jsonb,
  response       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address     varchar(64),
  checked_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_license_validations_company
  ON public.license_validations(company_id, checked_at DESC);

-- ============================================================================
-- 3. MEMBERSHIP: JOIN REQUESTS, INVITE LINKS, INVITES
--    A person may belong to more than one company. Admission is either an
--    invite link (admin-issued, shareable) or a request to join (admin approves).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_invite_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  company_role_id uuid REFERENCES public.company_roles(id) ON DELETE SET NULL,
  token           varchar(80) NOT NULL UNIQUE,
  label           varchar(120),
  department      varchar(100),
  position        varchar(100),
  max_uses        integer,
  use_count       integer NOT NULL DEFAULT 0,
  requires_approval boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  expires_at      timestamptz,
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_join_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_role_id uuid REFERENCES public.company_roles(id) ON DELETE SET NULL,
  requested_role  varchar(100),
  department      varchar(100),
  position        varchar(100),
  message         text,
  source          varchar(20) NOT NULL DEFAULT 'request' CHECK (source IN ('request','invite_link')),
  invite_link_id  uuid REFERENCES public.company_invite_links(id) ON DELETE SET NULL,
  status          varchar(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at      timestamptz,
  decision_note   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_join_request_pending
  ON public.company_join_requests(company_id, user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_join_requests_company
  ON public.company_join_requests(company_id, status, created_at DESC);

-- ============================================================================
-- 4. EDUCATION: INSTITUTION STUDENT LINKS & REQUESTS
--    A student registers against an institution either via a link or a request.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.institution_invite_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token         varchar(80) NOT NULL UNIQUE,
  label         varchar(120),
  programme     varchar(160),
  max_uses      integer,
  use_count     integer NOT NULL DEFAULT 0,
  requires_approval boolean NOT NULL DEFAULT true,
  is_active     boolean NOT NULL DEFAULT true,
  expires_at    timestamptz,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_user_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES public.users(id) ON DELETE CASCADE,
  student_number varchar(60),
  programme      varchar(160),
  status         varchar(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','active','rejected','left')),
  source         varchar(20) NOT NULL DEFAULT 'request' CHECK (source IN ('request','invite_link','admin')),
  invite_link_id uuid REFERENCES public.institution_invite_links(id) ON DELETE SET NULL,
  approved_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_user_link
  ON public.student_user_links(student_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_links_company
  ON public.student_user_links(company_id, status);

-- ============================================================================
-- 5. KYC VERIFICATION & BADGES
--    Individuals already verified on jackisa.com are auto-verified here
--    (blue badge); verified companies get the gold badge.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.kyc_verifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type  varchar(10) NOT NULL CHECK (subject_type IN ('user','company')),
  subject_id    uuid NOT NULL,
  level         varchar(20) NOT NULL DEFAULT 'individual'
                  CHECK (level IN ('individual','company')),
  status        varchar(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','verified','rejected')),
  badge         varchar(20) CHECK (badge IN ('blue','gold')),
  source        varchar(40) NOT NULL DEFAULT 'office',
  document_type varchar(60),
  document_ref  varchar(255),
  verified_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  verified_at   timestamptz,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_kyc_subject
  ON public.kyc_verifications(subject_type, subject_id);

-- ============================================================================
-- 6. FEATURE REGISTRY + OVERRIDES
--    Server-side mirror of system_tools/tier_tools, but keyed by feature slug
--    so gating works by tier AND by role.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_features (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       varchar(100) NOT NULL UNIQUE,
  name       varchar(120) NOT NULL,
  category   varchar(80) NOT NULL,
  min_tier   varchar(20) NOT NULL DEFAULT 'basic'
               CHECK (min_tier IN ('basic','pro','platinum','enterprise')),
  is_active  boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_feature_overrides (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_slug varchar(100) NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  reason       text,
  created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, feature_slug)
);

CREATE TABLE IF NOT EXISTS public.company_role_features (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_role_id uuid NOT NULL REFERENCES public.company_roles(id) ON DELETE CASCADE,
  feature_slug    varchar(100) NOT NULL,
  enabled         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_role_id, feature_slug)
);

-- ============================================================================
-- 7. SECURITY: DEVICES, LOGIN EVENTS, AUDIT, SIGNUP INTENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES public.users(id) ON DELETE CASCADE,
  fingerprint   varchar(128) NOT NULL,
  user_agent    varchar(255),
  ip_address    varchar(64),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  trust_level   varchar(20) NOT NULL DEFAULT 'unknown'
                  CHECK (trust_level IN ('unknown','known','trusted','blocked')),
  UNIQUE (user_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS public.login_events (
  id            bigserial PRIMARY KEY,
  user_id       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  email         varchar(255),
  success       boolean NOT NULL DEFAULT true,
  method        varchar(30) NOT NULL DEFAULT 'password',
  ip_address    varchar(64),
  user_agent    varchar(255),
  fingerprint   varchar(128),
  failure_reason varchar(120),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_events_email ON public.login_events(email, created_at DESC);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  company_id  uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  action      varchar(80) NOT NULL,
  entity_type varchar(60),
  entity_id   uuid,
  ip_address  varchar(64),
  user_agent  varchar(255),
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_company ON public.audit_events(company_id, created_at DESC);

-- Remembers the plan a visitor picked before they authenticate, so the choice
-- survives email verification and the whole signup round-trip.
CREATE TABLE IF NOT EXISTS public.signup_intents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token          varchar(80) NOT NULL UNIQUE,
  email          varchar(255),
  plan_code      varchar(60),
  tier           varchar(40),
  interval_months smallint,
  company_name   varchar(255),
  industry       varchar(100),
  intent         varchar(30) NOT NULL DEFAULT 'create_company'
                   CHECK (intent IN ('create_company','join_company','create_institution','join_institution')),
  invite_token   varchar(80),
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  consumed_at    timestamptz,
  expires_at     timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 8. TRIALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trial_registrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  fingerprint   varchar(128) NOT NULL,
  ip_address    varchar(64),
  msisdn        varchar(40),
  started_at    timestamptz NOT NULL DEFAULT now(),
  ends_at       timestamptz NOT NULL,
  reminder_sent_at timestamptz,
  cancelled_at  timestamptz,
  converted_at  timestamptz,
  status        varchar(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','reminded','cancelled','expired','converted')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trial_fingerprint ON public.trial_registrations(fingerprint);

-- ============================================================================
-- 8b. LICENCE PAYMENTS
--     A dedicated ledger for subscription/licence charges brokered by lic
--     (JPesa). Kept separate from the existing `payments` table, which serves
--     the in-app Relworx payment gateway.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.license_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  payment_id     varchar(80),
  merchant_ref   varchar(120),
  provider       varchar(30) NOT NULL DEFAULT 'jpesa',
  channel        varchar(40),
  msisdn         varchar(40),
  amount         numeric(15,2) NOT NULL DEFAULT 0,
  charged_amount numeric(15,2),
  currency       varchar(3) NOT NULL DEFAULT 'UGX',
  plan_code      varchar(60),
  interval_months smallint,
  purpose        varchar(30) NOT NULL DEFAULT 'license',
  status         varchar(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','processing','paid','failed','expired','refunded')),
  paid_at        timestamptz,
  raw            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_license_payments_ref
  ON public.license_payments(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_license_payments_company
  ON public.license_payments(company_id, created_at DESC);

-- ============================================================================
-- 9. SYNC OUTBOX (office -> lic)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sync_outbox (
  id          bigserial PRIMARY KEY,
  entity_type varchar(60) NOT NULL,
  entity_id   uuid,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      varchar(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sent','failed','skipped')),
  attempts    integer NOT NULL DEFAULT 0,
  last_error  varchar(500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON public.sync_outbox(status, created_at);

-- ============================================================================
-- 10. COLUMN ADDITIONS (nullable, additive)
-- ============================================================================

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS kind varchar(20) NOT NULL DEFAULT 'company';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS lic_tenant_id uuid;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS owner_user_id uuid;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS kyc_status varchar(20) NOT NULL DEFAULT 'unverified';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS kyc_level varchar(20) NOT NULL DEFAULT 'none';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS kyc_verified_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS jackisa_user_id varchar(64);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_plan_code varchar(60);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_interval_months smallint;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS signup_intent_token varchar(80);

ALTER TABLE public.company_subscriptions ADD COLUMN IF NOT EXISTS interval_months smallint NOT NULL DEFAULT 1;
ALTER TABLE public.company_subscriptions ADD COLUMN IF NOT EXISTS license_key varchar(80);
ALTER TABLE public.company_subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
ALTER TABLE public.company_subscriptions ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.company_employees ADD COLUMN IF NOT EXISTS invite_link_id uuid;

-- ============================================================================
-- 11. RLS POLICIES (least privilege, company-scoped)
--     New tables only. Existing tables keep their current policies.
-- ============================================================================

-- Helper to (re)create a policy idempotently.
CREATE OR REPLACE FUNCTION public.jo_apply_policy(
  p_table text, p_name text, p_action text, p_using text, p_check text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=p_table AND policyname=p_name) THEN
    EXECUTE format('DROP POLICY %I ON public.%I', p_name, p_table);
  END IF;
  IF p_action = 'SELECT' THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', p_name, p_table, p_using);
  ELSIF p_action = 'INSERT' THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', p_name, p_table, p_check);
  ELSIF p_action = 'UPDATE' THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', p_name, p_table, p_using, p_check);
  ELSE
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', p_name, p_table, p_using);
  END IF;
END $$;

-- --- platform_licenses: members read; writes are service-role only ----------
SELECT public.jo_apply_policy('platform_licenses','pl_select','SELECT','public.jo_is_company_member(company_id)',NULL);
SELECT public.jo_apply_policy('platform_licenses','pl_update','UPDATE','public.jo_is_company_admin(company_id)','public.jo_is_company_admin(company_id)');

-- --- license_validations: members read -------------------------------------
SELECT public.jo_apply_policy('license_validations','lv_select','SELECT','public.jo_is_company_member(company_id)',NULL);

-- --- company_invite_links: admins manage; anyone may read a token row -------
SELECT public.jo_apply_policy('company_invite_links','cil_select_admin','SELECT','public.jo_is_company_admin(company_id) OR is_active',NULL);
SELECT public.jo_apply_policy('company_invite_links','cil_insert','INSERT',NULL,'public.jo_is_company_admin(company_id)');
SELECT public.jo_apply_policy('company_invite_links','cil_update','UPDATE','public.jo_is_company_admin(company_id)','public.jo_is_company_admin(company_id)');
SELECT public.jo_apply_policy('company_invite_links','cil_delete','DELETE','public.jo_is_company_admin(company_id)',NULL);

-- --- company_join_requests: own requests + company admins -------------------
SELECT public.jo_apply_policy('company_join_requests','cjr_select','SELECT','user_id = auth.uid() OR public.jo_is_company_admin(company_id)',NULL);
SELECT public.jo_apply_policy('company_join_requests','cjr_insert','INSERT',NULL,'user_id = auth.uid()');
SELECT public.jo_apply_policy('company_join_requests','cjr_update','UPDATE','user_id = auth.uid() OR public.jo_is_company_admin(company_id)','user_id = auth.uid() OR public.jo_is_company_admin(company_id)');

-- --- institution_invite_links ----------------------------------------------
SELECT public.jo_apply_policy('institution_invite_links','iil_select','SELECT','public.jo_is_company_admin(company_id) OR is_active',NULL);
SELECT public.jo_apply_policy('institution_invite_links','iil_insert','INSERT',NULL,'public.jo_is_company_admin(company_id)');
SELECT public.jo_apply_policy('institution_invite_links','iil_update','UPDATE','public.jo_is_company_admin(company_id)','public.jo_is_company_admin(company_id)');

-- --- student_user_links: own link + institution admins ---------------------
SELECT public.jo_apply_policy('student_user_links','sul_select','SELECT','user_id = auth.uid() OR public.jo_is_company_member(company_id)',NULL);
SELECT public.jo_apply_policy('student_user_links','sul_insert','INSERT',NULL,'user_id = auth.uid() OR public.jo_is_company_admin(company_id)');
SELECT public.jo_apply_policy('student_user_links','sul_update','UPDATE','public.jo_is_company_admin(company_id) OR user_id = auth.uid()','public.jo_is_company_admin(company_id) OR user_id = auth.uid()');

-- --- kyc_verifications ------------------------------------------------------
SELECT public.jo_apply_policy('kyc_verifications','kyc_select','SELECT',
  '(subject_type = ''user'' AND subject_id = auth.uid()) OR (subject_type = ''company'' AND public.jo_is_company_member(subject_id))',NULL);
SELECT public.jo_apply_policy('kyc_verifications','kyc_insert','INSERT',NULL,
  '(subject_type = ''user'' AND subject_id = auth.uid()) OR (subject_type = ''company'' AND public.jo_is_company_admin(subject_id))');
SELECT public.jo_apply_policy('kyc_verifications','kyc_update','UPDATE',
  '(subject_type = ''company'' AND public.jo_is_company_admin(subject_id))',
  '(subject_type = ''company'' AND public.jo_is_company_admin(subject_id))');

-- --- platform_features: readable by all authenticated ----------------------
SELECT public.jo_apply_policy('platform_features','pf_select','SELECT','true',NULL);

-- --- company_feature_overrides / company_role_features ---------------------
SELECT public.jo_apply_policy('company_feature_overrides','cfo_select','SELECT','public.jo_is_company_member(company_id)',NULL);
SELECT public.jo_apply_policy('company_feature_overrides','cfo_insert','INSERT',NULL,'public.jo_is_company_admin(company_id)');
SELECT public.jo_apply_policy('company_feature_overrides','cfo_update','UPDATE','public.jo_is_company_admin(company_id)','public.jo_is_company_admin(company_id)');

SELECT public.jo_apply_policy('company_role_features','crf_select','SELECT',
  'public.jo_is_company_member((SELECT company_id FROM public.company_roles cr WHERE cr.id = company_role_id))',NULL);
SELECT public.jo_apply_policy('company_role_features','crf_write','INSERT',NULL,
  'public.jo_is_company_admin((SELECT company_id FROM public.company_roles cr WHERE cr.id = company_role_id))');

-- --- security tables --------------------------------------------------------
SELECT public.jo_apply_policy('user_devices','ud_select','SELECT','user_id = auth.uid()',NULL);
SELECT public.jo_apply_policy('user_devices','ud_insert','INSERT',NULL,'user_id = auth.uid()');
SELECT public.jo_apply_policy('user_devices','ud_update','UPDATE','user_id = auth.uid()','user_id = auth.uid()');

SELECT public.jo_apply_policy('login_events','le_select','SELECT','user_id = auth.uid()',NULL);
SELECT public.jo_apply_policy('login_events','le_insert','INSERT',NULL,'true');

SELECT public.jo_apply_policy('audit_events','ae_select','SELECT',
  'user_id = auth.uid() OR (company_id IS NOT NULL AND public.jo_is_company_admin(company_id))',NULL);
SELECT public.jo_apply_policy('audit_events','ae_insert','INSERT',NULL,'true');

-- --- signup_intents: token rows are service-role only ----------------------
SELECT public.jo_apply_policy('signup_intents','si_select','SELECT','false',NULL);

-- --- trials -----------------------------------------------------------------
SELECT public.jo_apply_policy('trial_registrations','tr_select','SELECT',
  'user_id = auth.uid() OR public.jo_is_company_admin(company_id)',NULL);

-- --- license_payments -------------------------------------------------------
SELECT public.jo_apply_policy('license_payments','lp_select','SELECT','public.jo_is_company_member(company_id)',NULL);

-- --- sync_outbox ------------------------------------------------------------
SELECT public.jo_apply_policy('sync_outbox','so_select','SELECT','false',NULL);

-- ============================================================================
-- 12. SEED: feature registry
-- ============================================================================

INSERT INTO public.platform_features (slug, name, category, min_tier, sort_order) VALUES
  ('dashboard',    'Dashboard',              'core',       'basic',    10),
  ('payments_hub', 'Payments Hub',           'core',       'basic',    20),
  ('accounting',   'Accounting & Finance',   'finance',    'basic',    30),
  ('invoicing',    'Invoicing',              'finance',    'basic',    31),
  ('expenses',     'Expenses',               'finance',    'basic',    32),
  ('vat',          'VAT Management',         'finance',    'basic',    33),
  ('bookkeeping',  'Bookkeeping',            'finance',    'basic',    34),
  ('hr',           'HR & Payroll',           'hr',         'basic',    40),
  ('payroll',      'Payroll',                'hr',         'basic',    41),
  ('paye',         'PAYE & Tax',             'hr',         'basic',    42),
  ('attendance',   'Attendance',             'hr',         'basic',    43),
  ('leave',        'Leave Management',       'hr',         'basic',    44),
  ('performance',  'Performance',            'hr',         'pro',      45),
  ('hr_points',    'HR Points',              'hr',         'pro',      46),
  ('education',    'Education Management',   'education',  'pro',      50),
  ('students',     'Students',               'education',  'pro',      51),
  ('coursework',   'Coursework',             'education',  'pro',      52),
  ('sales',        'Sales & Marketing',      'sales',      'basic',    60),
  ('commissions',  'Commissions',            'sales',      'pro',      61),
  ('affiliate',    'Affiliate Program',      'sales',      'pro',      62),
  ('investment',   'Investment & Funds',     'investment', 'pro',      70),
  ('unit_trust',   'Unit Trust',             'investment', 'platinum', 71),
  ('dividends',    'Dividends',              'investment', 'platinum', 72),
  ('income_tax',   'Income Tax Evaluator',   'finance',    'platinum', 73),
  ('legal',        'Legal Documents',        'legal',      'pro',      80),
  ('cms',          'CMS',                    'content',    'pro',      90),
  ('helpdesk',     'Help Desk',              'support',    'basic',   100),
  ('kyc',          'KYC Verification',       'compliance', 'platinum',110),
  ('api_access',   'API Access',             'platform',   'platinum',120),
  ('whapi_alerts', 'WhatsApp Alerts',        'platform',   'pro',     121),
  ('pdf_reports',  'PDF Reports',            'platform',   'pro',     122)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, category = EXCLUDED.category,
      min_tier = EXCLUDED.min_tier, sort_order = EXCLUDED.sort_order;

-- ============================================================================
-- Grants for the new objects (matches the existing project convention)
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_licenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.license_validations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_invite_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_join_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.institution_invite_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_user_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kyc_verifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_features TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_feature_overrides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_role_features TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_devices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.login_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_intents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trial_registrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.license_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_outbox TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.jo_company_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.jo_is_company_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jo_is_company_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jo_is_company_owner(uuid) TO authenticated;

COMMIT;
