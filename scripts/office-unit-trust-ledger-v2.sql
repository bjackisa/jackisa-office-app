-- ============================================================================
-- Jackisa Office — unit-trust <-> ledger wiring (v2)
--
-- Additive file. Run AFTER:
--   full-schema.sql, investment-module-and-ecosystem.sql,
--   payroll-ledger-and-trust-v1.sql, office-ledger-trust-hardening-v1.sql.
--
-- Problem this fixes:
--   The unit-trust engine moved workspace_funds.cash_pool and wrote
--   fund_transactions rows, but never posted to the double-entry ledger. So the
--   ledger (the declared single source of truth for money) was blind to every
--   contribution, redemption and revenue allocation — the "half-implemented
--   ledger" limitation.
--
-- This version wraps the existing logic and adds the balanced journal for each
-- movement.
--
-- Accounts used (auto-created by jo_ledger_account):
--   1000 Cash & Bank               (asset, debit)
--   2000 Accounts Payable          (liability, credit)  -- exit fee owed
--   2100 VAT Payable               (liability, credit)  -- WHT withheld
--   2600 Fund Units Redeemable     (liability, credit)  -- members' capital
--   4900 Other Income              (income, credit)     -- revenue allocation
--   6500 Fund Operating Expense    (expense, debit)     -- platform fees
-- ============================================================================

-- jo_ledger_account is defined in office-ledger-trust-hardening-v1.sql; this
-- guard lets v2 run even if only this file is applied.
CREATE OR REPLACE FUNCTION public.jo_ledger_account(
  p_company_id uuid, p_code varchar, p_name varchar, p_type varchar, p_normal_side varchar
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM ledger_accounts WHERE company_id = p_company_id AND code = p_code;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO ledger_accounts (company_id, code, name, type, normal_side, is_system)
  VALUES (p_company_id, p_code, p_name, p_type, p_normal_side, true)
  ON CONFLICT (company_id, code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Contribution: member money in, units issued. Platform fees are withheld
-- before the cash reaches the pool (cash_pool += net), so the fund's own
-- journal is simply cash in / units owed. The fee is platform revenue and is
-- recorded in jackisa_platform_revenue, not on the fund's ledger.
--   Dr 1000 Cash                     net
--   Cr 2600 Fund Units Redeemable    net
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_contribution(
  p_fund_id UUID,
  p_member_position_id UUID,
  p_gross_amount DECIMAL,
  p_recorded_by UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fund workspace_funds%ROWTYPE;
  v_jfee DECIMAL; v_mfee DECIMAL; v_net DECIMAL;
  v_nav DECIMAL; v_units DECIMAL; v_tx_id UUID;
  v_cash_id uuid; v_units_id uuid;
BEGIN
  SELECT * INTO v_fund FROM workspace_funds WHERE id = p_fund_id;
  SELECT * INTO v_jfee, v_mfee, v_net FROM calculate_fee_waterfall(
    p_gross_amount, v_fund.jackisa_contribution_fee_rate, v_fund.mgmt_contribution_fee_rate);

  v_nav := v_fund.nav_per_unit;
  IF v_nav <= 0 THEN v_nav := 1.000000; END IF;
  v_units := ROUND(v_net / v_nav, 6);

  INSERT INTO fund_transactions (fund_id, member_position_id, tx_type, gross_amount,
    jackisa_fee, mgmt_fee, net_amount, units_transacted, nav_at_transaction, recorded_by)
  VALUES (p_fund_id, p_member_position_id, 'contribution', p_gross_amount,
    v_jfee, v_mfee, v_net, v_units, v_nav, p_recorded_by)
  RETURNING id INTO v_tx_id;

  UPDATE fund_member_positions SET
    total_units = total_units + v_units,
    total_invested = total_invested + v_net,
    avg_cost_basis = CASE WHEN (total_units + v_units) > 0
      THEN ROUND((total_invested + v_net) / (total_units + v_units), 6) ELSE v_nav END,
    total_fees_paid = total_fees_paid + v_jfee + v_mfee,
    updated_at = NOW()
  WHERE id = p_member_position_id;

  UPDATE workspace_funds SET
    total_units_outstanding = total_units_outstanding + v_units,
    cash_pool = cash_pool + v_net,
    updated_at = NOW()
  WHERE id = p_fund_id;

  INSERT INTO jackisa_platform_revenue (fund_id, company_id, fee_type, gross_transaction_amount, fee_amount, reference_tx_id)
  VALUES (p_fund_id, v_fund.company_id, 'contribution_fee', p_gross_amount, v_jfee, v_tx_id);

  -- Double-entry. Fees are withheld before the cash reaches the pool, so the
  -- fund's ledger records cash in / units owed; the fee lives in
  -- jackisa_platform_revenue (platform revenue).
  v_cash_id  := jo_ledger_account(v_fund.company_id, '1000', 'Cash & Bank', 'asset', 'debit');
  v_units_id := jo_ledger_account(v_fund.company_id, '2600', 'Fund Units Redeemable', 'liability', 'credit');
  PERFORM jo_post_ledger_entry(
    v_fund.company_id, CURRENT_DATE, 'Unit contribution', v_tx_id::text,
    'fund_contribution', v_tx_id,
    jsonb_build_array(
      jsonb_build_object('account_id', v_cash_id,  'debit',  v_net, 'memo', 'Cash received (net of fees)'),
      jsonb_build_object('account_id', v_units_id, 'credit', v_net, 'memo', 'Units issued')
    ), p_recorded_by);

  PERFORM calculate_fund_nav(p_fund_id);
  RETURN v_tx_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Redemption: member cashes out units. Cash leaves the pool at net; the exit
-- fee is owed to the platform and the WHT is owed to URA, so both are
-- liabilities on the company's books (no invented fund income).
--   Dr 2600 Fund Units Redeemable    gross (member's capital released)
--   Cr 1000 Cash                     net (cash paid to member)
--   Cr 2000 Accounts Payable         exit fee owed to the platform
--   Cr 2100 VAT Payable              WHT withheld on the capital gain
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_redemption(
  p_fund_id UUID,
  p_member_position_id UUID,
  p_units_to_sell DECIMAL,
  p_recorded_by UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fund workspace_funds%ROWTYPE;
  v_pos fund_member_positions%ROWTYPE;
  v_nav DECIMAL; v_gross DECIMAL; v_jfee DECIMAL; v_after_fee DECIMAL;
  v_cost_basis_for_units DECIMAL; v_capital_gain DECIMAL; v_wht DECIMAL; v_net DECIMAL;
  v_tx_id UUID; v_units_id uuid; v_cash_id uuid; v_ap_id uuid; v_tax_id uuid;
BEGIN
  SELECT * INTO v_fund FROM workspace_funds WHERE id = p_fund_id;
  SELECT * INTO v_pos FROM fund_member_positions WHERE id = p_member_position_id;
  IF v_pos.total_units < p_units_to_sell THEN
    RAISE EXCEPTION 'Insufficient units. Available: %, Requested: %', v_pos.total_units, p_units_to_sell;
  END IF;

  v_nav := v_fund.nav_per_unit;
  v_gross := ROUND(p_units_to_sell * v_nav, 2);
  v_jfee := ROUND(v_gross * v_fund.jackisa_exit_fee_rate, 2);
  v_after_fee := v_gross - v_jfee;
  v_cost_basis_for_units := ROUND(v_pos.avg_cost_basis * p_units_to_sell, 2);
  v_capital_gain := GREATEST(0, v_after_fee - v_cost_basis_for_units);
  v_wht := ROUND(v_capital_gain * 0.15, 2);
  v_net := v_after_fee - v_wht;

  INSERT INTO fund_transactions (fund_id, member_position_id, tx_type, gross_amount,
    jackisa_fee, withholding_tax, net_amount, units_transacted, nav_at_transaction, capital_gain, recorded_by)
  VALUES (p_fund_id, p_member_position_id, 'redemption', v_gross,
    v_jfee, v_wht, v_net, p_units_to_sell, v_nav, v_capital_gain, p_recorded_by)
  RETURNING id INTO v_tx_id;

  UPDATE fund_member_positions SET
    total_units = total_units - p_units_to_sell,
    total_tax_withheld = total_tax_withheld + v_wht,
    total_fees_paid = total_fees_paid + v_jfee,
    updated_at = NOW()
  WHERE id = p_member_position_id;

  UPDATE workspace_funds SET
    total_units_outstanding = total_units_outstanding - p_units_to_sell,
    cash_pool = cash_pool - v_net,
    updated_at = NOW()
  WHERE id = p_fund_id;

  INSERT INTO jackisa_platform_revenue (fund_id, company_id, fee_type, gross_transaction_amount, fee_amount, reference_tx_id)
  VALUES (p_fund_id, v_fund.company_id, 'exit_fee', v_gross, v_jfee, v_tx_id);

  v_units_id := jo_ledger_account(v_fund.company_id, '2600', 'Fund Units Redeemable', 'liability', 'credit');
  v_cash_id  := jo_ledger_account(v_fund.company_id, '1000', 'Cash & Bank', 'asset', 'debit');
  v_ap_id    := jo_ledger_account(v_fund.company_id, '2000', 'Accounts Payable', 'liability', 'credit');
  v_tax_id   := jo_ledger_account(v_fund.company_id, '2100', 'VAT Payable', 'liability', 'credit');
  PERFORM jo_post_ledger_entry(
    v_fund.company_id, CURRENT_DATE, 'Unit redemption', v_tx_id::text,
    'fund_redemption', v_tx_id,
    jsonb_strip_nulls(jsonb_build_array(
      jsonb_build_object('account_id', v_units_id, 'debit',  v_gross, 'memo', 'Units redeemed'),
      jsonb_build_object('account_id', v_cash_id,  'credit', v_net,   'memo', 'Cash paid out'),
      jsonb_build_object('account_id', v_ap_id,    'credit', v_jfee,  'memo', 'Exit fee owed'),
      jsonb_build_object('account_id', v_tax_id,   'credit', v_wht,   'memo', 'WHT on capital gain')
    )), p_recorded_by);

  PERFORM calculate_fund_nav(p_fund_id);
  RETURN v_tx_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Revenue allocation from a confirmed sale.
--   Dr 1000 Cash                    net
--   Dr 6500 Fund Operating Expense  fees
--   Cr 4900 Other Income            gross (the sale's contribution to the fund)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_sale_to_fund_allocation(
  p_company_id UUID, p_sale_id UUID, p_sale_total DECIMAL, p_sale_profit DECIMAL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fund workspace_funds%ROWTYPE;
  v_gross_alloc DECIMAL; v_jfee DECIMAL; v_mfee DECIMAL; v_net DECIMAL; v_tx_id UUID;
  v_cash_id uuid; v_fee_id uuid; v_inc_id uuid;
BEGIN
  SELECT * INTO v_fund FROM workspace_funds WHERE company_id = p_company_id AND is_active = TRUE;
  IF v_fund.id IS NULL THEN RETURN NULL; END IF;
  IF p_sale_profit <= 0 THEN RETURN NULL; END IF;
  IF p_sale_total < v_fund.min_daily_sales_threshold THEN RETURN NULL; END IF;

  v_gross_alloc := ROUND(p_sale_profit * v_fund.sales_profit_alloc_pct, 2);
  SELECT * INTO v_jfee, v_mfee, v_net FROM calculate_fee_waterfall(
    v_gross_alloc, v_fund.jackisa_revenue_alloc_fee_rate, v_fund.mgmt_annual_fee_rate);

  INSERT INTO fund_transactions (fund_id, tx_type, gross_amount, jackisa_fee, mgmt_fee,
    net_amount, nav_at_transaction, units_transacted, reference_type, reference_id, description)
  VALUES (v_fund.id, 'revenue_alloc', v_gross_alloc, v_jfee, v_mfee, v_net, v_fund.nav_per_unit, 0,
    'sales_order', p_sale_id, 'Auto-allocation from confirmed sale')
  RETURNING id INTO v_tx_id;

  UPDATE workspace_funds SET cash_pool = cash_pool + v_net, updated_at = NOW() WHERE id = v_fund.id;

  INSERT INTO jackisa_platform_revenue (fund_id, company_id, fee_type, gross_transaction_amount, fee_amount, reference_tx_id)
  VALUES (v_fund.id, p_company_id, 'revenue_alloc_fee', v_gross_alloc, v_jfee, v_tx_id);

  INSERT INTO ecosystem_events (company_id, event_type, source_module, source_table, source_record_id,
    target_module, target_table, target_record_id, payload, processed, processed_at)
  VALUES (p_company_id, 'sale_confirmed', 'sales', 'sales_orders', p_sale_id,
    'investment', 'fund_transactions', v_tx_id,
    jsonb_build_object('sale_total', p_sale_total, 'profit', p_sale_profit, 'alloc', v_net), TRUE, NOW());

  v_cash_id := jo_ledger_account(p_company_id, '1000', 'Cash & Bank', 'asset', 'debit');
  v_fee_id  := jo_ledger_account(p_company_id, '6500', 'Fund Operating Expense', 'expense', 'debit');
  v_inc_id  := jo_ledger_account(p_company_id, '4900', 'Other Income', 'income', 'credit');
  PERFORM jo_post_ledger_entry(
    p_company_id, CURRENT_DATE, 'Sale revenue allocation to fund', v_tx_id::text,
    'fund_revenue_alloc', v_tx_id,
    jsonb_strip_nulls(jsonb_build_array(
      jsonb_build_object('account_id', v_cash_id, 'debit',  v_net,          'memo', 'Cash into fund'),
      jsonb_build_object('account_id', v_fee_id,  'debit',  v_jfee + v_mfee,'memo', 'Platform fees'),
      jsonb_build_object('account_id', v_inc_id,  'credit', v_gross_alloc,  'memo', 'Fund income')
    )), NULL);

  PERFORM calculate_fund_nav(v_fund.id);
  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_contribution(uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_redemption(uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_sale_to_fund_allocation(uuid, uuid, numeric, numeric) TO authenticated;
