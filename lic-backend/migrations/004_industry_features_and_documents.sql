-- ============================================================================
-- 004_industry_features_and_documents.sql
-- ----------------------------------------------------------------------------
-- NEW migration for the licence hub. Additive and idempotent. Adds:
--   1. plans.description / plans.tagline — lively, feature-led plan copy the
--      office app and pricing page read instead of hard-coded strings.
--   2. documents — a registry of every PDF the hub generates (marks
--      notifications, transcripts, receipts, tax packs) with the public URL it
--      is served from on hpanel, so a document can be re-sent or re-downloaded.
-- ============================================================================

-- 1. Plan copy.
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS description VARCHAR(220) DEFAULT NULL AFTER name,
  ADD COLUMN IF NOT EXISTS tagline     VARCHAR(160) DEFAULT NULL AFTER description;

UPDATE plans SET
  description = CASE tier
    WHEN 'basic'    THEN 'Everything a small team needs to get organised: books, staff and invoicing.'
    WHEN 'pro'      THEN 'Run the whole business, not just the books — payroll, sales and school.'
    WHEN 'platinum' THEN 'For funds, groups and serious scale — unit trusts, tax and API access.'
    ELSE description END,
  tagline = CASE tier
    WHEN 'basic'    THEN 'Get organised and in control'
    WHEN 'pro'      THEN 'Run the whole business'
    WHEN 'platinum' THEN 'Built for scale and funds'
    ELSE tagline END
WHERE description IS NULL OR tagline IS NULL;

-- 2. Document registry. A row per generated file; storage_path is relative to
--    the hub's public documents root and url is what the app links to.
CREATE TABLE IF NOT EXISTS documents (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  tenant_id     CHAR(36)     DEFAULT NULL,
  subject_type  VARCHAR(20)  NOT NULL DEFAULT 'tenant',  -- tenant | user | student
  subject_id    CHAR(36)     DEFAULT NULL,
  kind          VARCHAR(40)  NOT NULL,                   -- marks_notification | transcript | receipt | tax_pack | report
  title         VARCHAR(200) DEFAULT NULL,
  storage_path  VARCHAR(500) DEFAULT NULL,
  url           VARCHAR(600) DEFAULT NULL,
  bytes         INT          DEFAULT NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'ready',    -- ready | failed
  meta          LONGTEXT     DEFAULT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX documents_tenant_idx (tenant_id, kind, created_at),
  INDEX documents_subject_idx (subject_type, subject_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Central student registry, so the hub can reach a guardian without calling
--    back into the office app. external_id is the office students.id.
CREATE TABLE IF NOT EXISTS students (
  id             CHAR(36)     NOT NULL PRIMARY KEY,
  tenant_id      CHAR(36)     DEFAULT NULL,
  external_id    CHAR(36)     DEFAULT NULL,
  name           VARCHAR(160) DEFAULT NULL,
  student_no     VARCHAR(60)  DEFAULT NULL,
  phone          VARCHAR(40)  DEFAULT NULL,
  email          VARCHAR(160) DEFAULT NULL,
  guardian_name  VARCHAR(160) DEFAULT NULL,
  guardian_phone VARCHAR(40)  DEFAULT NULL,
  guardian_email VARCHAR(160) DEFAULT NULL,
  meta           LONGTEXT     DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     DEFAULT NULL,
  UNIQUE KEY students_external (tenant_id, external_id),
  INDEX students_name_idx (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
