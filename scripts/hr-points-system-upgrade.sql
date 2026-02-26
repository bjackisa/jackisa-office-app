-- HR Points system upgrade: rule-driven transactions, automatic balances, monetization, and termination workflow

ALTER TABLE point_balances
  ADD COLUMN IF NOT EXISTS redeemable_points DECIMAL(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS redeemable_amount_ugx DECIMAL(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_termination_flagged BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE point_transactions
  ADD COLUMN IF NOT EXISTS note TEXT;

ALTER TABLE company_employees
  ADD COLUMN IF NOT EXISTS immediate_termination_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS hr_termination_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES company_employees(id) ON DELETE CASCADE,
  point_balance_id UUID REFERENCES point_balances(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  letter_body TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_hr_termination_letters_employee ON hr_termination_letters(employee_id, generated_at DESC);

CREATE OR REPLACE FUNCTION calculate_point_redemption(points_value DECIMAL)
RETURNS DECIMAL
LANGUAGE plpgsql
AS $$
DECLARE
  redeemable DECIMAL := LEAST(GREATEST(points_value, 0), 100);
BEGIN
  IF redeemable <= 50 THEN
    RETURN redeemable * 3000;
  END IF;

  RETURN (50 * 3000) + ((redeemable - 50) * 10000);
END;
$$;

CREATE OR REPLACE FUNCTION build_termination_letter(
  p_company_name TEXT,
  p_employee_name TEXT,
  p_reason TEXT,
  p_termination_date DATE
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN format(
$letter$
OFFICIAL NOTICE OF IMMEDIATE TERMINATION

Date: %s
Company: %s
Employee: %s

Dear %s,

This letter serves as formal notice that your employment with %s is terminated with immediate effect as of %s.

Reason for Termination:
%s

This action is taken under the JOLIS Employee Performance Point System and company disciplinary policy after your point balance reached zero (0), indicating sustained non-compliance with required performance and conduct standards.

You are required to immediately return all company property, documentation, and access credentials in your possession. Any final salary processing will be handled in line with company policy and applicable labor laws.

By Order of Management,
Human Resources Department
%s
$letter$,
    to_char(p_termination_date, 'DD Mon YYYY'),
    p_company_name,
    p_employee_name,
    p_employee_name,
    p_company_name,
    to_char(p_termination_date, 'DD Mon YYYY'),
    p_reason,
    p_company_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION record_point_event(
  p_company_id UUID,
  p_employee_id UUID,
  p_rule_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_recorded_by UUID DEFAULT NULL,
  p_recorded_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  transaction_id UUID,
  balance_id UUID,
  closing_balance DECIMAL,
  redeemable_points DECIMAL,
  redeemable_amount_ugx DECIMAL,
  is_terminated BOOLEAN,
  termination_letter_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_rule RECORD;
  v_balance RECORD;
  v_points_gained DECIMAL := 0;
  v_points_lost DECIMAL := 0;
  v_company_name TEXT;
  v_employee_name TEXT;
  v_reason TEXT;
  v_is_terminated BOOLEAN := FALSE;
  v_termination_letter_id UUID;
  v_closing DECIMAL;
BEGIN
  SELECT * INTO v_rule
  FROM point_rules
  WHERE id = p_rule_id
    AND company_id = p_company_id
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Point rule not found or inactive';
  END IF;

  IF v_rule.action_type = 'gain' THEN
    v_points_gained := v_rule.point_value;
  ELSE
    v_points_lost := v_rule.point_value;
  END IF;

  INSERT INTO point_transactions (
    company_id,
    employee_id,
    rule_id,
    action_type,
    points,
    reason,
    recorded_by,
    recorded_date,
    note
  ) VALUES (
    p_company_id,
    p_employee_id,
    p_rule_id,
    v_rule.action_type,
    v_rule.point_value,
    p_reason,
    p_recorded_by,
    COALESCE(p_recorded_date, CURRENT_DATE),
    p_reason
  )
  RETURNING id INTO transaction_id;

  INSERT INTO point_balances (
    company_id,
    employee_id,
    period_month,
    period_year,
    opening_balance,
    points_gained,
    points_lost,
    closing_balance,
    redeemable_points,
    redeemable_amount_ugx,
    is_termination_flagged,
    updated_at
  ) VALUES (
    p_company_id,
    p_employee_id,
    EXTRACT(MONTH FROM COALESCE(p_recorded_date, CURRENT_DATE))::INTEGER,
    EXTRACT(YEAR FROM COALESCE(p_recorded_date, CURRENT_DATE))::INTEGER,
    30,
    v_points_gained,
    v_points_lost,
    LEAST(100, GREATEST(0, 30 + v_points_gained - v_points_lost)),
    LEAST(100, GREATEST(0, 30 + v_points_gained - v_points_lost)),
    calculate_point_redemption(LEAST(100, GREATEST(0, 30 + v_points_gained - v_points_lost))),
    FALSE,
    NOW()
  )
  ON CONFLICT (employee_id, period_month, period_year)
  DO UPDATE SET
    points_gained = point_balances.points_gained + EXCLUDED.points_gained,
    points_lost = point_balances.points_lost + EXCLUDED.points_lost,
    closing_balance = LEAST(100, GREATEST(0, point_balances.opening_balance + (point_balances.points_gained + EXCLUDED.points_gained) - (point_balances.points_lost + EXCLUDED.points_lost))),
    redeemable_points = LEAST(100, GREATEST(0, point_balances.opening_balance + (point_balances.points_gained + EXCLUDED.points_gained) - (point_balances.points_lost + EXCLUDED.points_lost))),
    redeemable_amount_ugx = calculate_point_redemption(LEAST(100, GREATEST(0, point_balances.opening_balance + (point_balances.points_gained + EXCLUDED.points_gained) - (point_balances.points_lost + EXCLUDED.points_lost)))),
    updated_at = NOW()
  RETURNING * INTO v_balance;

  balance_id := v_balance.id;
  v_closing := v_balance.closing_balance;
  closing_balance := v_closing;
  redeemable_points := v_balance.redeemable_points;
  redeemable_amount_ugx := v_balance.redeemable_amount_ugx;

  IF v_closing <= 0 THEN
    v_is_terminated := TRUE;
    v_reason := COALESCE(p_reason, format('Point balance reached zero under rule: %s', v_rule.indicator));

    UPDATE company_employees
    SET
      status = 'terminated',
      termination_date = CURRENT_DATE,
      immediate_termination_at = NOW(),
      termination_reason = v_reason,
      updated_at = NOW()
    WHERE id = p_employee_id
      AND company_id = p_company_id;

    SELECT c.name, u.full_name
      INTO v_company_name, v_employee_name
    FROM company_employees ce
    JOIN companies c ON c.id = ce.company_id
    JOIN users u ON u.id = ce.user_id
    WHERE ce.id = p_employee_id;

    INSERT INTO hr_termination_letters (
      company_id,
      employee_id,
      point_balance_id,
      reason,
      letter_body,
      generated_by
    ) VALUES (
      p_company_id,
      p_employee_id,
      v_balance.id,
      v_reason,
      build_termination_letter(v_company_name, v_employee_name, v_reason, CURRENT_DATE),
      p_recorded_by
    )
    RETURNING id INTO v_termination_letter_id;

    UPDATE point_balances
    SET is_termination_flagged = TRUE
    WHERE id = v_balance.id;
  END IF;

  is_terminated := v_is_terminated;
  termination_letter_id := v_termination_letter_id;

  RETURN NEXT;
END;
$$;

-- Seed/refresh default point rules based on company policy
DELETE FROM point_rules
WHERE category IN (
  'Attendance & Punctuality',
  'Task Responsibility & Professionalism',
  'Customer Care & Student Service',
  'Incompetence',
  'Negligence',
  'Misuse of Company Property',
  'Environmental & Facility Responsibility',
  'General Performance Rewards',
  'Help Desk / Ticket Resolution',
  'Knowledge Base Contributions',
  'Academic Performance Indicators',
  'Janitor Performance Indicators',
  'Security Performance Indicators',
  'Cook Performance Indicators'
);

INSERT INTO point_rules (company_id, category, indicator, description, point_value, action_type, sort_order)
SELECT c.id, r.category, r.indicator, r.description, r.point_value, r.action_type::point_action_type, r.sort_order
FROM companies c
CROSS JOIN (
  VALUES
  ('Attendance & Punctuality', 'Late reporting (after 8:30 AM)', 'Reported late after official reporting time.', 1.0, 'loss', 10),
  ('Attendance & Punctuality', 'Unnecessary absenteeism', 'Absent without approved reason.', 5.0, 'loss', 11),
  ('Attendance & Punctuality', 'Gate opening delay (Security)', 'Delayed gate opening beyond duty time.', 1.0, 'loss', 12),

  ('Task Responsibility & Professionalism', 'Failure to implement assigned task', 'Task assigned but not executed.', 1.0, 'loss', 20),
  ('Task Responsibility & Professionalism', 'Repeated reminder required', 'Employee requires repeated reminders for execution.', 1.0, 'loss', 21),
  ('Task Responsibility & Professionalism', 'Unnecessary excuses', 'Invalid or avoidable excuses affecting performance.', 0.5, 'loss', 22),
  ('Task Responsibility & Professionalism', 'Negative attitude', 'Documented negative attitude at work.', 1.0, 'loss', 23),
  ('Task Responsibility & Professionalism', 'Disrespect for duty', 'Disrespectful conduct toward assigned duty.', 2.0, 'loss', 24),

  ('Customer Care & Student Service', 'Customer complaint', 'Verified customer complaint due to service failure.', 2.0, 'loss', 30),
  ('Customer Care & Student Service', 'Late response to live chat', 'Delayed response on live chat channels.', 2.0, 'loss', 31),
  ('Customer Care & Student Service', 'Unprofessional communication', 'Use of unprofessional language or tone.', 2.0, 'loss', 32),
  ('Customer Care & Student Service', 'Delayed ticket response (>15 min)', 'Helpdesk response exceeded 15 minutes.', 1.0, 'loss', 33),
  ('Customer Care & Student Service', 'Delayed solution (>30 min)', 'Issue resolution exceeded 30 minutes.', 1.5, 'loss', 34),
  ('Customer Care & Student Service', 'Dropped calls', 'Call dropped during client/student handling.', 3.0, 'loss', 35),
  ('Customer Care & Student Service', 'Poor student handling', 'Inadequate support to students.', 2.0, 'loss', 36),
  ('Customer Care & Student Service', 'Failure to respond to student queries', 'Student queries left unattended.', 2.0, 'loss', 37),
  ('Customer Care & Student Service', 'Delayed grading without reason', 'Grading delayed without valid explanation.', 1.5, 'loss', 38),

  ('Incompetence', 'Failure to perform duties (verified case)', 'Failure due to lack of required skill or preparation.', 2.0, 'loss', 40),

  ('Negligence', 'Level 1 - Minor carelessness', 'Minor carelessness causing inconvenience.', 2.0, 'loss', 50),
  ('Negligence', 'Level 2 - Operational disruption', 'Negligence causing operational disruption.', 10.0, 'loss', 51),
  ('Negligence', 'Level 3 - Major financial/reputational loss', 'Negligence causing major financial or reputational loss.', 20.0, 'loss', 52),
  ('Negligence', 'Level 4 - Gross misconduct', 'Gross misconduct resulting in immediate termination.', 30.0, 'loss', 53),

  ('Misuse of Company Property', 'Misuse of company resources', 'Unauthorized or improper use of company assets.', 1.0, 'loss', 60),
  ('Misuse of Company Property', 'Loss, waste, or damage to company property', 'Damage/loss of company property; minimum deduction.', 2.0, 'loss', 61),

  ('Environmental & Facility Responsibility', 'Dirty office/toilet', 'Facility not maintained to cleanliness standards.', 1.0, 'loss', 70),
  ('Environmental & Facility Responsibility', 'Missing toilet paper', 'Essential sanitation materials not replenished.', 1.0, 'loss', 71),
  ('Environmental & Facility Responsibility', 'Compound negligence', 'Outdoor/compound cleaning negligence.', 1.0, 'loss', 72),

  ('General Performance Rewards', 'Highest customer rating', 'Top customer satisfaction performance.', 2.0, 'gain', 80),
  ('General Performance Rewards', 'Instant technical support', 'Immediate quality technical support delivered.', 1.0, 'gain', 81),
  ('General Performance Rewards', 'Creativity & innovation', 'Creativity or innovation contribution (base gain).', 10.0, 'gain', 82),
  ('General Performance Rewards', 'Supervised overtime', 'Approved and supervised overtime work.', 1.0, 'gain', 83),
  ('General Performance Rewards', 'Public holiday work', 'Worked on public holiday as assigned.', 2.0, 'gain', 84),
  ('General Performance Rewards', 'Remote work (per chat)', 'Productive remote support via official chat channels.', 1.0, 'gain', 85),
  ('General Performance Rewards', 'Remote ticket resolution', 'Resolved support ticket remotely.', 1.0, 'gain', 86),
  ('General Performance Rewards', 'Reporting constitutional violations', 'Reported policy/legal violations responsibly.', 1.0, 'gain', 87),

  ('Help Desk / Ticket Resolution', 'Level 1 resolution within 10 mins', 'Ticket resolved within 10 minutes.', 1.0, 'gain', 90),
  ('Help Desk / Ticket Resolution', 'Level 2 resolution within 20 mins', 'Ticket resolved within 20 minutes.', 2.0, 'gain', 91),
  ('Help Desk / Ticket Resolution', 'Level 3 resolution within 30 mins', 'Ticket resolved within 30 minutes.', 3.0, 'gain', 92),

  ('Knowledge Base Contributions', 'New Article (Approved)', 'Published approved new KB article.', 1.0, 'gain', 100),
  ('Knowledge Base Contributions', 'Updated Article', 'Approved update to existing KB article.', 0.5, 'gain', 101),

  ('Academic Performance Indicators', '100% syllabus coverage', 'Completed full syllabus within schedule.', 3.0, 'gain', 110),
  ('Academic Performance Indicators', 'Student performance improvement', 'Measured improvement in student outcomes.', 3.0, 'gain', 111),
  ('Academic Performance Indicators', 'Timely grading', 'Assessment grading completed on time.', 2.0, 'gain', 112),
  ('Academic Performance Indicators', 'Practical demonstrations', 'Delivered practical demonstrations effectively.', 2.0, 'gain', 113),
  ('Academic Performance Indicators', 'Industry exposure sessions', 'Facilitated industry exposure sessions.', 2.0, 'gain', 114),
  ('Academic Performance Indicators', 'Mentorship participation', 'Participated in student mentorship.', 1.0, 'gain', 115),
  ('Academic Performance Indicators', 'Student project supervision', 'Supervised student projects to completion.', 2.0, 'gain', 116),
  ('Academic Performance Indicators', 'Curriculum development', 'Contributed to curriculum design/development.', 3.0, 'gain', 117),

  ('Janitor Performance Indicators', 'Cleanliness consistency', 'Maintained consistent cleanliness standards.', 2.0, 'gain', 120),
  ('Janitor Performance Indicators', 'Early readiness of classrooms', 'Prepared classrooms before required time.', 1.0, 'gain', 121),
  ('Janitor Performance Indicators', 'Reporting maintenance issues', 'Timely reporting of maintenance faults.', 1.0, 'gain', 122),

  ('Security Performance Indicators', 'Zero security incidents', 'No incident reported during assigned period.', 2.0, 'gain', 130),
  ('Security Performance Indicators', 'Proper visitor management', 'Compliant and accurate visitor handling.', 1.0, 'gain', 131),
  ('Security Performance Indicators', 'Night vigilance compliance', 'Successful night vigilance checks.', 1.0, 'gain', 132),

  ('Cook Performance Indicators', 'Hygiene standards', 'Maintained kitchen and food hygiene standards.', 2.0, 'gain', 140),
  ('Cook Performance Indicators', 'Timely meal preparation', 'Meals prepared and served on schedule.', 1.0, 'gain', 141),
  ('Cook Performance Indicators', 'Inventory accountability', 'Proper accountability for kitchen inventory.', 1.0, 'gain', 142)
) AS r(category, indicator, description, point_value, action_type, sort_order);
