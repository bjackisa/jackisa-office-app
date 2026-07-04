-- HR Points monthly balance carry-forward
-- Apply after hr-points-system-upgrade.sql and hr-points-account-refill.sql.
-- This replaces only the point-event function so new monthly balances open with
-- the employee's latest prior closing balance instead of resetting to 30.

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
  v_opening_balance DECIMAL := 30;
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

  IF v_is_account_refill AND v_event_points > 100 THEN
    RAISE EXCEPTION 'Account Refill cannot exceed 100 points';
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
    v_opening_balance := COALESCE(v_existing_balance.opening_balance, 30);
    v_old_closing := COALESCE(v_existing_balance.closing_balance, v_opening_balance);
  ELSE
    SELECT COALESCE(pb.closing_balance, 30) INTO v_opening_balance
    FROM point_balances pb
    WHERE pb.company_id = p_company_id
      AND pb.employee_id = p_employee_id
      AND make_date(pb.period_year, pb.period_month, 1) < date_trunc('month', COALESCE(p_recorded_date, CURRENT_DATE))::date
    ORDER BY pb.period_year DESC, pb.period_month DESC
    LIMIT 1;

    v_opening_balance := COALESCE(v_opening_balance, 30);
    v_old_closing := v_opening_balance;
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
    v_opening_balance,
    v_points_gained,
    v_points_lost,
    v_new_closing,
    GREATEST(v_new_closing - 30, 0),
    v_monetary_adjustment,
    v_new_closing <= 0,
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
