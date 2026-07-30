-- HR Interview module additions. Apply this file after the existing production schema.

CREATE TABLE IF NOT EXISTS hr_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  candidate_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_role_id UUID NOT NULL REFERENCES company_roles(id),
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  marks JSONB NOT NULL DEFAULT '{}'::jsonb,
  impression_rating NUMERIC(5, 2) NOT NULL DEFAULT 0,
  interviewer_notes TEXT,
  total_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
  grade VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'completed',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_interviews_company_id ON hr_interviews(company_id);
CREATE INDEX IF NOT EXISTS idx_hr_interviews_candidate_user_id ON hr_interviews(candidate_user_id);
CREATE INDEX IF NOT EXISTS idx_hr_interviews_company_role_id ON hr_interviews(company_role_id);

-- Allows the interview hiring action to safely upsert one employee record per user per company.
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_employees_company_user_unique
  ON company_employees(company_id, user_id);

ALTER TABLE hr_interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view interview results" ON hr_interviews
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_employees WHERE user_id = auth.uid() AND status IN ('active', 'pending_invitation')
    )
  );

CREATE POLICY "Company members can create interview results" ON hr_interviews
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_employees WHERE user_id = auth.uid() AND status IN ('active', 'pending_invitation')
    )
  );

CREATE POLICY "Company members can update interview results" ON hr_interviews
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_employees WHERE user_id = auth.uid() AND status IN ('active', 'pending_invitation')
    )
  );
