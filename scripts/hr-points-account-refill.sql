-- HR Points Account Refill extension: dynamic refill points, optional monetary value, and negative balances

ALTER TABLE point_transactions
  ADD COLUMN IF NOT EXISTS monetary_adjustment_ugx DECIMAL(15,2) DEFAULT 0;

CREATE OR REPLACE FUNCTION calculate_account_refill_cost(points_value DECIMAL)
RETURNS DECIMAL
LANGUAGE plpgsql
AS $$
DECLARE
  refill_points DECIMAL := GREATEST(COALESCE(points_value, 0), 0);
  first_tier_points DECIMAL := LEAST(refill_points, 50);
  second_tier_points DECIMAL := GREATEST(refill_points - 50, 0);
BEGIN
  RETURN (first_tier_points * 1000) + (second_tier_points * 5000);
END;
$$;

CREATE OR REPLACE FUNCTION record_point_event(
  p_company_id UUID,
  p_employee_id UUID,
  p_rule_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_recorded_by UUID DEFAULT NULL,
  p_recorded_date DATE DEFAULT CURRENT_DATE,
  p_points_override DECIMAL DEFAULT NULL,
  p_consider_monetary_value BOOLEAN DEFAULT FALSE
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
  v_existing_balance RECORD;
  v_points_gained DECIMAL := 0;
  v_points_lost DECIMAL := 0;
  v_event_points DECIMAL := 0;
  v_old_closing DECIMAL := 30;
  v_new_closing DECIMAL := 30;
  v_monetary_adjustment DECIMAL := 0;
  v_company_name TEXT;
  v_employee_name TEXT;
  v_reason TEXT;
  v_is_terminated BOOLEAN := FALSE;
  v_termination_letter_id UUID;
  v_is_account_refill BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_rule
  FROM point_rules
  WHERE id = p_rule_id
    AND company_id = p_company_id
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Point rule not found or inactive';
  END IF;

  v_is_account_refill := v_rule.category = 'Account Refill' AND v_rule.indicator = 'Points Redemption';
  v_event_points := CASE WHEN v_is_account_refill THEN COALESCE(p_points_override, 0) ELSE v_rule.point_value END;

  IF v_event_points <= 0 THEN
    RAISE EXCEPTION 'Point value must be greater than zero';
  END IF;

  IF v_rule.action_type = 'gain' THEN
    v_points_gained := v_event_points;
  ELSE
    v_points_lost := v_event_points;
  END IF;

  SELECT * INTO v_existing_balance
  FROM point_balances
  WHERE company_id = p_company_id
    AND employee_id = p_employee_id
    AND period_month = EXTRACT(MONTH FROM COALESCE(p_recorded_date, CURRENT_DATE))::INTEGER
    AND period_year = EXTRACT(YEAR FROM COALESCE(p_recorded_date, CURRENT_DATE))::INTEGER;

  IF FOUND THEN
    v_old_closing := COALESCE(v_existing_balance.closing_balance, 30);
  END IF;

  v_new_closing := LEAST(100, v_old_closing + v_points_gained - v_points_lost);

  IF v_is_account_refill AND p_consider_monetary_value THEN
    v_monetary_adjustment := -calculate_account_refill_cost(v_event_points);
  ELSIF NOT v_is_account_refill THEN
    v_monetary_adjustment := calculate_point_redemption(v_new_closing) - calculate_point_redemption(v_old_closing);
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
    note,
    monetary_adjustment_ugx
  ) VALUES (
    p_company_id,
    p_employee_id,
    p_rule_id,
    v_rule.action_type,
    v_event_points,
    p_reason,
    p_recorded_by,
    COALESCE(p_recorded_date, CURRENT_DATE),
    p_reason,
    v_monetary_adjustment
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
    LEAST(100, 30 + v_points_gained - v_points_lost),
    GREATEST(LEAST(100, 30 + v_points_gained - v_points_lost) - 30, 0),
    v_monetary_adjustment,
    LEAST(100, 30 + v_points_gained - v_points_lost) <= 0,
    NOW()
  )
  ON CONFLICT (employee_id, period_month, period_year)
  DO UPDATE SET
    points_gained = point_balances.points_gained + EXCLUDED.points_gained,
    points_lost = point_balances.points_lost + EXCLUDED.points_lost,
    closing_balance = LEAST(100, point_balances.closing_balance + EXCLUDED.points_gained - EXCLUDED.points_lost),
    redeemable_points = GREATEST(LEAST(100, point_balances.closing_balance + EXCLUDED.points_gained - EXCLUDED.points_lost) - 30, 0),
    redeemable_amount_ugx = point_balances.redeemable_amount_ugx + v_monetary_adjustment,
    is_termination_flagged = LEAST(100, point_balances.closing_balance + EXCLUDED.points_gained - EXCLUDED.points_lost) <= 0,
    updated_at = NOW()
  RETURNING * INTO v_balance;

  balance_id := v_balance.id;
  closing_balance := v_balance.closing_balance;
  redeemable_points := v_balance.redeemable_points;
  redeemable_amount_ugx := v_balance.redeemable_amount_ugx;

  IF v_balance.closing_balance <= 0 THEN
    v_is_terminated := TRUE;
    v_reason := COALESCE(p_reason, format('Point balance reached zero or below under rule: %s', v_rule.indicator));

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
  END IF;

  is_terminated := v_is_terminated;
  termination_letter_id := v_termination_letter_id;

  RETURN NEXT;
END;
$$;

INSERT INTO point_rules (company_id, category, indicator, description, point_value, action_type, sort_order)
SELECT
  c.id,
  'Account Refill',
  'Points Redemption',
  'Manually refill an employee point account with a dynamic point value entered at recording time.',
  0.0,
  'gain'::point_action_type,
  900
FROM companies c
WHERE NOT EXISTS (
  SELECT 1
  FROM point_rules pr
  WHERE pr.company_id = c.id
    AND pr.category = 'Account Refill'
    AND pr.indicator = 'Points Redemption'
);
