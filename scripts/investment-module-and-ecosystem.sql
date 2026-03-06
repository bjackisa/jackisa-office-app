-- ============================================================================
-- Jackisa Office — Investment & Unit Trust Module + Cross-Module Ecosystem
-- Created: 2026-03-06
-- Run AFTER full-schema.sql. Safe to re-run (idempotent).
-- ============================================================================

SET search_path TO public;

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE fund_tx_type AS ENUM ('contribution','redemption','revenue_alloc','expense_alloc','revaluation','interest_accrual','fee_deduction','distribution','transfer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE signal_category AS ENUM ('strong_buy','consider_buy','hold','consider_sell','strong_sell');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE asset_type AS ENUM ('business','land','equipment','external_investment','cash','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE liability_status AS ENUM ('active','repaid','defaulted','restructured');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE club_role AS ENUM ('chair','treasurer','secretary','member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE standing_order_freq AS ENUM ('weekly','biweekly','monthly','quarterly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ecosystem_event_type AS ENUM (
    'student_enrolled','invoice_paid','sale_confirmed','payroll_processed',
    'attendance_recorded','leave_approved','performance_reviewed',
    'expense_approved','commission_paid','point_awarded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 1. WORKSPACE FUND — one fund per company
-- ============================================================================

CREATE TABLE IF NOT EXISTS workspace_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  fund_name VARCHAR(255) NOT NULL,
  currency VARCHAR(3) DEFAULT 'UGX',
  inception_date DATE NOT NULL DEFAULT CURRENT_DATE,
  nav_per_unit DECIMAL(20, 6) DEFAULT 1.000000,
  total_units_outstanding DECIMAL(20, 6) DEFAULT 0,
  total_assets DECIMAL(20, 2) DEFAULT 0,
  total_liabilities DECIMAL(20, 2) DEFAULT 0,
  cash_pool DECIMAL(20, 2) DEFAULT 0,
  trailing_annual_return DECIMAL(8, 6) DEFAULT 0.08,
  -- Fee configuration (Jackisa platform fees)
  jackisa_contribution_fee_rate DECIMAL(6, 4) DEFAULT 0.0150,   -- 1.5%
  jackisa_exit_fee_rate DECIMAL(6, 4) DEFAULT 0.0075,           -- 0.75%
  jackisa_revenue_alloc_fee_rate DECIMAL(6, 4) DEFAULT 0.0100,  -- 1%
  jackisa_daily_return_fee_rate DECIMAL(6, 4) DEFAULT 0.0025,   -- 0.25%
  -- Workspace management fees
  mgmt_contribution_fee_rate DECIMAL(6, 4) DEFAULT 0.0200,      -- 2%
  mgmt_exit_fee_rate DECIMAL(6, 4) DEFAULT 0.0100,              -- 1%
  mgmt_annual_fee_rate DECIMAL(6, 4) DEFAULT 0.0150,            -- 1.5%
  -- Revenue share from sales
  sales_profit_alloc_pct DECIMAL(5, 4) DEFAULT 0.1000,          -- 10%
  min_daily_sales_threshold DECIMAL(15, 2) DEFAULT 0,
  -- Alerts
  leverage_warning_threshold DECIMAL(5, 4) DEFAULT 0.6000,      -- 60%
  nav_movement_alert_pct DECIMAL(5, 4) DEFAULT 0.0300,          -- 3%
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. NAV HISTORY — daily snapshots + intraday
-- ============================================================================

CREATE TABLE IF NOT EXISTS nav_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES workspace_funds(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  opening_nav DECIMAL(20, 6) NOT NULL,
  closing_nav DECIMAL(20, 6) NOT NULL,
  high_nav DECIMAL(20, 6),
  low_nav DECIMAL(20, 6),
  total_assets DECIMAL(20, 2) NOT NULL,
  total_liabilities DECIMAL(20, 2) NOT NULL,
  total_units DECIMAL(20, 6) NOT NULL,
  cash_pool DECIMAL(20, 2) NOT NULL,
  daily_return_pct DECIMAL(10, 6),
  total_revenue_today DECIMAL(15, 2) DEFAULT 0,
  total_expenses_today DECIMAL(15, 2) DEFAULT 0,
  total_contributions_today DECIMAL(15, 2) DEFAULT 0,
  total_redemptions_today DECIMAL(15, 2) DEFAULT 0,
  jackisa_fees_today DECIMAL(15, 2) DEFAULT 0,
  mgmt_fees_today DECIMAL(15, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fund_id, snapshot_date)
);

-- ============================================================================
-- 3. FUND ASSETS — what the fund owns
-- ============================================================================

CREATE TABLE IF NOT EXISTS fund_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES workspace_funds(id) ON DELETE CASCADE,
  asset_name VARCHAR(255) NOT NULL,
  asset_type asset_type NOT NULL,
  description TEXT,
  acquisition_date DATE NOT NULL DEFAULT CURRENT_DATE,
  acquisition_cost DECIMAL(20, 2) NOT NULL,
  current_value DECIMAL(20, 2) NOT NULL,
  total_revenue DECIMAL(20, 2) DEFAULT 0,
  total_expenses DECIMAL(20, 2) DEFAULT 0,
  last_revaluation_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fund_asset_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES fund_assets(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('revenue','expense','revaluation')),
  amount DECIMAL(20, 2) NOT NULL,
  description TEXT,
  reference_id UUID,
  reference_type VARCHAR(50),
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. FUND LIABILITIES — loans with daily interest accrual
-- ============================================================================

CREATE TABLE IF NOT EXISTS fund_liabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES workspace_funds(id) ON DELETE CASCADE,
  liability_name VARCHAR(255) NOT NULL,
  lender VARCHAR(255),
  principal DECIMAL(20, 2) NOT NULL,
  outstanding_balance DECIMAL(20, 2) NOT NULL,
  annual_interest_rate DECIMAL(8, 6) NOT NULL,
  daily_rate DECIMAL(12, 10),
  accrued_interest DECIMAL(20, 2) DEFAULT 0,
  start_date DATE NOT NULL,
  maturity_date DATE,
  status liability_status DEFAULT 'active',
  last_accrual_date DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS liability_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liability_id UUID NOT NULL REFERENCES fund_liabilities(id) ON DELETE CASCADE,
  repayment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount DECIMAL(20, 2) NOT NULL,
  interest_portion DECIMAL(20, 2) NOT NULL,
  principal_portion DECIMAL(20, 2) NOT NULL,
  balance_after DECIMAL(20, 2) NOT NULL,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 5. MEMBER POSITIONS — each employee's investment
-- ============================================================================

CREATE TABLE IF NOT EXISTS fund_member_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES workspace_funds(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES company_employees(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  total_units DECIMAL(20, 6) DEFAULT 0,
  total_invested DECIMAL(20, 2) DEFAULT 0,
  avg_cost_basis DECIMAL(20, 6) DEFAULT 0,
  total_fees_paid DECIMAL(15, 2) DEFAULT 0,
  total_tax_withheld DECIMAL(15, 2) DEFAULT 0,
  return_target_pct DECIMAL(5, 4) DEFAULT 0.2000,
  is_active BOOLEAN DEFAULT TRUE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fund_id, employee_id)
);

-- ============================================================================
-- 6. FUND TRANSACTIONS — every money movement
-- ============================================================================

CREATE TABLE IF NOT EXISTS fund_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES workspace_funds(id) ON DELETE CASCADE,
  member_position_id UUID REFERENCES fund_member_positions(id),
  tx_type fund_tx_type NOT NULL,
  gross_amount DECIMAL(20, 2) NOT NULL,
  jackisa_fee DECIMAL(15, 2) DEFAULT 0,
  mgmt_fee DECIMAL(15, 2) DEFAULT 0,
  withholding_tax DECIMAL(15, 2) DEFAULT 0,
  net_amount DECIMAL(20, 2) NOT NULL,
  units_transacted DECIMAL(20, 6) DEFAULT 0,
  nav_at_transaction DECIMAL(20, 6) NOT NULL,
  nav_after_transaction DECIMAL(20, 6),
  capital_gain DECIMAL(20, 2) DEFAULT 0,
  description TEXT,
  reference_type VARCHAR(50),
  reference_id UUID,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 7. STANDING ORDERS — recurring auto-contributions
-- ============================================================================

CREATE TABLE IF NOT EXISTS fund_standing_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_position_id UUID NOT NULL REFERENCES fund_member_positions(id) ON DELETE CASCADE,
  amount DECIMAL(15, 2) NOT NULL,
  frequency standing_order_freq DEFAULT 'monthly',
  day_of_month INTEGER DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
  next_execution_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  total_executed INTEGER DEFAULT 0,
  last_executed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 8. BENEFICIARIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS fund_beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_position_id UUID NOT NULL REFERENCES fund_member_positions(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  relationship VARCHAR(100) NOT NULL,
  national_id VARCHAR(50),
  phone VARCHAR(30),
  email VARCHAR(255),
  share_pct DECIMAL(5, 2) NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  is_minor BOOLEAN DEFAULT FALSE,
  guardian_name VARCHAR(255),
  guardian_national_id VARCHAR(50),
  guardian_phone VARCHAR(30),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 9. DAILY SIGNALS — personalized buy/sell recommendation
-- ============================================================================

CREATE TABLE IF NOT EXISTS fund_member_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_position_id UUID NOT NULL REFERENCES fund_member_positions(id) ON DELETE CASCADE,
  signal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  composite_score DECIMAL(6, 2) NOT NULL,
  signal signal_category NOT NULL,
  factor_target_return DECIMAL(6, 2) DEFAULT 0,
  factor_7d_momentum DECIMAL(6, 2) DEFAULT 0,
  factor_30d_momentum DECIMAL(6, 2) DEFAULT 0,
  factor_52w_high_proximity DECIMAL(6, 2) DEFAULT 0,
  factor_52w_low_proximity DECIMAL(6, 2) DEFAULT 0,
  hypothetical_sell_gross DECIMAL(20, 2),
  hypothetical_sell_fee DECIMAL(15, 2),
  hypothetical_sell_tax DECIMAL(15, 2),
  hypothetical_sell_net DECIMAL(20, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(member_position_id, signal_date)
);

-- ============================================================================
-- 10. INVESTMENT CLUBS — sub-funds within workspace
-- ============================================================================

CREATE TABLE IF NOT EXISTS investment_clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES workspace_funds(id) ON DELETE CASCADE,
  club_name VARCHAR(255) NOT NULL,
  description TEXT,
  club_nav DECIMAL(20, 6) DEFAULT 1.000000,
  total_units DECIMAL(20, 6) DEFAULT 0,
  total_value DECIMAL(20, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS investment_club_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES investment_clubs(id) ON DELETE CASCADE,
  member_position_id UUID NOT NULL REFERENCES fund_member_positions(id) ON DELETE CASCADE,
  club_units DECIMAL(20, 6) DEFAULT 0,
  total_contributed DECIMAL(20, 2) DEFAULT 0,
  role club_role DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(club_id, member_position_id)
);

-- ============================================================================
-- 11. JACKISA PLATFORM REVENUE — fees collected across all workspaces
-- ============================================================================

CREATE TABLE IF NOT EXISTS jackisa_platform_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES workspace_funds(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  revenue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  fee_type VARCHAR(50) NOT NULL,
  gross_transaction_amount DECIMAL(20, 2) NOT NULL,
  fee_amount DECIMAL(15, 2) NOT NULL,
  reference_tx_id UUID REFERENCES fund_transactions(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jackisa_revenue_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_date DATE NOT NULL UNIQUE,
  total_contribution_fees DECIMAL(15, 2) DEFAULT 0,
  total_exit_fees DECIMAL(15, 2) DEFAULT 0,
  total_revenue_alloc_fees DECIMAL(15, 2) DEFAULT 0,
  total_return_fees DECIMAL(15, 2) DEFAULT 0,
  total_fees DECIMAL(15, 2) DEFAULT 0,
  total_aum DECIMAL(20, 2) DEFAULT 0,
  workspace_count INTEGER DEFAULT 0,
  member_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 12. REVENUE SHARE CONFIG — sales-to-fund bridge per category
-- ============================================================================

CREATE TABLE IF NOT EXISTS fund_revenue_share_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES workspace_funds(id) ON DELETE CASCADE,
  sales_category VARCHAR(100),
  alloc_pct DECIMAL(5, 4) NOT NULL DEFAULT 0.1000,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fund_daily_sales_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES workspace_funds(id) ON DELETE CASCADE,
  alloc_date DATE NOT NULL,
  total_sales DECIMAL(20, 2) NOT NULL,
  total_profit DECIMAL(20, 2) NOT NULL,
  alloc_pct DECIMAL(5, 4) NOT NULL,
  gross_allocation DECIMAL(20, 2) NOT NULL,
  jackisa_fee DECIMAL(15, 2) DEFAULT 0,
  mgmt_fee DECIMAL(15, 2) DEFAULT 0,
  net_to_fund DECIMAL(20, 2) NOT NULL,
  nav_impact DECIMAL(10, 6),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fund_id, alloc_date)
);

-- ============================================================================
-- 13. CROSS-MODULE ECOSYSTEM EVENT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS ecosystem_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type ecosystem_event_type NOT NULL,
  source_module VARCHAR(50) NOT NULL,
  source_table VARCHAR(100) NOT NULL,
  source_record_id UUID NOT NULL,
  target_module VARCHAR(50),
  target_table VARCHAR(100),
  target_record_id UUID,
  payload JSONB DEFAULT '{}',
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 14. AUTO-GENERATED SALES FROM EDUCATION ENROLLMENTS
-- ============================================================================

ALTER TABLE students ADD COLUMN IF NOT EXISTS tuition_amount DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid';
ALTER TABLE education_modules ADD COLUMN IF NOT EXISTS tuition_fee DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE education_modules ADD COLUMN IF NOT EXISTS instructor_id UUID REFERENCES company_employees(id);
ALTER TABLE education_modules ADD COLUMN IF NOT EXISTS max_students INTEGER DEFAULT 50;

-- ============================================================================
-- 15. PAYROLL INTEGRATION — auto fund contributions from salary
-- ============================================================================

ALTER TABLE fund_member_positions ADD COLUMN IF NOT EXISTS auto_contribute_pct DECIMAL(5, 4) DEFAULT 0;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS fund_contribution DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS fund_contribution_employee_id UUID REFERENCES fund_member_positions(id);

-- ============================================================================
-- 16. PERFORMANCE → POINTS → SIGNAL CHAIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES company_employees(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id),
  review_period_start DATE NOT NULL,
  review_period_end DATE NOT NULL,
  overall_score DECIMAL(4, 2),
  categories JSONB DEFAULT '{}',
  notes TEXT,
  auto_points_awarded DECIMAL(8, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_nav_snapshots_fund_date ON nav_snapshots(fund_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_fund_transactions_fund ON fund_transactions(fund_id);
CREATE INDEX IF NOT EXISTS idx_fund_transactions_member ON fund_transactions(member_position_id);
CREATE INDEX IF NOT EXISTS idx_fund_transactions_type ON fund_transactions(tx_type);
CREATE INDEX IF NOT EXISTS idx_fund_member_positions_fund ON fund_member_positions(fund_id);
CREATE INDEX IF NOT EXISTS idx_fund_member_positions_employee ON fund_member_positions(employee_id);
CREATE INDEX IF NOT EXISTS idx_fund_member_signals_date ON fund_member_signals(member_position_id, signal_date);
CREATE INDEX IF NOT EXISTS idx_fund_assets_fund ON fund_assets(fund_id);
CREATE INDEX IF NOT EXISTS idx_fund_asset_entries_asset ON fund_asset_entries(asset_id);
CREATE INDEX IF NOT EXISTS idx_fund_liabilities_fund ON fund_liabilities(fund_id);
CREATE INDEX IF NOT EXISTS idx_jackisa_revenue_date ON jackisa_platform_revenue(revenue_date);
CREATE INDEX IF NOT EXISTS idx_jackisa_revenue_fund ON jackisa_platform_revenue(fund_id);
CREATE INDEX IF NOT EXISTS idx_ecosystem_events_company ON ecosystem_events(company_id);
CREATE INDEX IF NOT EXISTS idx_ecosystem_events_type ON ecosystem_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ecosystem_events_unprocessed ON ecosystem_events(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_investment_clubs_fund ON investment_clubs(fund_id);
CREATE INDEX IF NOT EXISTS idx_club_members_club ON investment_club_members(club_id);
CREATE INDEX IF NOT EXISTS idx_fund_standing_orders_next ON fund_standing_orders(next_execution_date) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_fund_beneficiaries_position ON fund_beneficiaries(member_position_id);
CREATE INDEX IF NOT EXISTS idx_fund_daily_sales_alloc ON fund_daily_sales_allocations(fund_id, alloc_date);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_employee ON performance_reviews(employee_id);

-- ============================================================================
-- FUNCTIONS: Three-Tier Fee Waterfall
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_fee_waterfall(
  p_gross_amount DECIMAL,
  p_jackisa_rate DECIMAL,
  p_mgmt_rate DECIMAL
) RETURNS TABLE(jackisa_fee DECIMAL, mgmt_fee DECIMAL, net_amount DECIMAL) AS $$
BEGIN
  jackisa_fee := ROUND(p_gross_amount * p_jackisa_rate, 2);
  mgmt_fee := ROUND((p_gross_amount - jackisa_fee) * p_mgmt_rate, 2);
  net_amount := p_gross_amount - jackisa_fee - mgmt_fee;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- FUNCTION: Calculate NAV
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_fund_nav(p_fund_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_total_assets DECIMAL;
  v_total_liabilities DECIMAL;
  v_total_units DECIMAL;
  v_nav DECIMAL;
BEGIN
  SELECT COALESCE(SUM(current_value), 0)
    INTO v_total_assets
    FROM fund_assets WHERE fund_id = p_fund_id AND is_active = TRUE;

  SELECT cash_pool INTO v_total_assets
    FROM workspace_funds WHERE id = p_fund_id;

  v_total_assets := v_total_assets + COALESCE(
    (SELECT SUM(current_value) FROM fund_assets WHERE fund_id = p_fund_id AND is_active = TRUE), 0
  );

  SELECT COALESCE(SUM(outstanding_balance + accrued_interest), 0)
    INTO v_total_liabilities
    FROM fund_liabilities WHERE fund_id = p_fund_id AND status = 'active';

  SELECT total_units_outstanding INTO v_total_units
    FROM workspace_funds WHERE id = p_fund_id;

  IF v_total_units <= 0 THEN
    RETURN 1.000000;
  END IF;

  v_nav := ROUND((v_total_assets - v_total_liabilities) / v_total_units, 6);

  UPDATE workspace_funds SET
    nav_per_unit = v_nav,
    total_assets = v_total_assets,
    total_liabilities = v_total_liabilities,
    updated_at = NOW()
  WHERE id = p_fund_id;

  RETURN v_nav;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Process member contribution (buy units)
-- ============================================================================

CREATE OR REPLACE FUNCTION process_contribution(
  p_fund_id UUID,
  p_member_position_id UUID,
  p_gross_amount DECIMAL,
  p_recorded_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_fund workspace_funds%ROWTYPE;
  v_jfee DECIMAL;
  v_mfee DECIMAL;
  v_net DECIMAL;
  v_nav DECIMAL;
  v_units DECIMAL;
  v_tx_id UUID;
  v_pos fund_member_positions%ROWTYPE;
BEGIN
  SELECT * INTO v_fund FROM workspace_funds WHERE id = p_fund_id;

  SELECT * INTO v_jfee, v_mfee, v_net FROM calculate_fee_waterfall(
    p_gross_amount, v_fund.jackisa_contribution_fee_rate, v_fund.mgmt_contribution_fee_rate
  );

  v_nav := v_fund.nav_per_unit;
  IF v_nav <= 0 THEN v_nav := 1.000000; END IF;
  v_units := ROUND(v_net / v_nav, 6);

  INSERT INTO fund_transactions (
    fund_id, member_position_id, tx_type, gross_amount,
    jackisa_fee, mgmt_fee, net_amount, units_transacted,
    nav_at_transaction, recorded_by
  ) VALUES (
    p_fund_id, p_member_position_id, 'contribution', p_gross_amount,
    v_jfee, v_mfee, v_net, v_units, v_nav, p_recorded_by
  ) RETURNING id INTO v_tx_id;

  SELECT * INTO v_pos FROM fund_member_positions WHERE id = p_member_position_id;

  UPDATE fund_member_positions SET
    total_units = total_units + v_units,
    total_invested = total_invested + v_net,
    avg_cost_basis = CASE
      WHEN (total_units + v_units) > 0
      THEN ROUND((total_invested + v_net) / (total_units + v_units), 6)
      ELSE v_nav
    END,
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

  PERFORM calculate_fund_nav(p_fund_id);

  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Process redemption (sell units)
-- ============================================================================

CREATE OR REPLACE FUNCTION process_redemption(
  p_fund_id UUID,
  p_member_position_id UUID,
  p_units_to_sell DECIMAL,
  p_recorded_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_fund workspace_funds%ROWTYPE;
  v_pos fund_member_positions%ROWTYPE;
  v_nav DECIMAL;
  v_gross DECIMAL;
  v_jfee DECIMAL;
  v_after_fee DECIMAL;
  v_cost_basis_for_units DECIMAL;
  v_capital_gain DECIMAL;
  v_wht DECIMAL;
  v_net DECIMAL;
  v_tx_id UUID;
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

  -- FIFO cost basis: average cost * units sold
  v_cost_basis_for_units := ROUND(v_pos.avg_cost_basis * p_units_to_sell, 2);
  v_capital_gain := GREATEST(0, v_after_fee - v_cost_basis_for_units);

  -- Uganda WHT on capital gains: 15%
  v_wht := ROUND(v_capital_gain * 0.15, 2);
  v_net := v_after_fee - v_wht;

  INSERT INTO fund_transactions (
    fund_id, member_position_id, tx_type, gross_amount,
    jackisa_fee, withholding_tax, net_amount, units_transacted,
    nav_at_transaction, capital_gain, recorded_by
  ) VALUES (
    p_fund_id, p_member_position_id, 'redemption', v_gross,
    v_jfee, v_wht, v_net, p_units_to_sell, v_nav, v_capital_gain, p_recorded_by
  ) RETURNING id INTO v_tx_id;

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

  PERFORM calculate_fund_nav(p_fund_id);

  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Daily interest accrual on all active liabilities
-- ============================================================================

CREATE OR REPLACE FUNCTION accrue_daily_interest(p_fund_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_liability RECORD;
  v_daily_rate DECIMAL;
  v_interest DECIMAL;
BEGIN
  FOR v_liability IN
    SELECT * FROM fund_liabilities
    WHERE fund_id = p_fund_id AND status = 'active'
      AND (last_accrual_date IS NULL OR last_accrual_date < CURRENT_DATE)
  LOOP
    v_daily_rate := POWER(1 + v_liability.annual_interest_rate, 1.0/365.0) - 1;
    v_interest := ROUND((v_liability.outstanding_balance + v_liability.accrued_interest) * v_daily_rate, 2);

    UPDATE fund_liabilities SET
      accrued_interest = accrued_interest + v_interest,
      daily_rate = v_daily_rate,
      last_accrual_date = CURRENT_DATE,
      updated_at = NOW()
    WHERE id = v_liability.id;

    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    PERFORM calculate_fund_nav(p_fund_id);
  END IF;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Daily compounding — apply baseline growth
-- ============================================================================

CREATE OR REPLACE FUNCTION apply_daily_compounding(p_fund_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_fund workspace_funds%ROWTYPE;
  v_daily_rate DECIMAL;
  v_growth DECIMAL;
  v_jfee DECIMAL;
  v_net_growth DECIMAL;
BEGIN
  SELECT * INTO v_fund FROM workspace_funds WHERE id = p_fund_id;

  IF v_fund.total_units_outstanding <= 0 OR v_fund.cash_pool <= 0 THEN
    RETURN 0;
  END IF;

  v_daily_rate := POWER(1 + v_fund.trailing_annual_return, 1.0/365.0) - 1;
  v_growth := ROUND(v_fund.cash_pool * v_daily_rate, 2);

  v_jfee := ROUND(v_growth * v_fund.jackisa_daily_return_fee_rate, 2);
  v_net_growth := v_growth - v_jfee;

  UPDATE workspace_funds SET
    cash_pool = cash_pool + v_net_growth,
    updated_at = NOW()
  WHERE id = p_fund_id;

  IF v_jfee > 0 THEN
    INSERT INTO jackisa_platform_revenue (fund_id, company_id, fee_type, gross_transaction_amount, fee_amount)
    VALUES (p_fund_id, v_fund.company_id, 'daily_return_fee', v_growth, v_jfee);
  END IF;

  PERFORM calculate_fund_nav(p_fund_id);

  RETURN v_net_growth;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Generate daily signal for a member
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_member_signal(p_member_position_id UUID)
RETURNS signal_category AS $$
DECLARE
  v_pos fund_member_positions%ROWTYPE;
  v_fund workspace_funds%ROWTYPE;
  v_current_nav DECIMAL;
  v_current_value DECIMAL;
  v_personal_return DECIMAL;
  v_score DECIMAL := 0;
  v_f1 DECIMAL; v_f2 DECIMAL; v_f3 DECIMAL; v_f4 DECIMAL; v_f5 DECIMAL;
  v_nav_7d DECIMAL; v_nav_30d DECIMAL; v_nav_52w_high DECIMAL; v_nav_52w_low DECIMAL;
  v_signal signal_category;
  v_hyp_gross DECIMAL; v_hyp_fee DECIMAL; v_hyp_tax DECIMAL; v_hyp_net DECIMAL;
  v_cap_gain DECIMAL;
BEGIN
  SELECT * INTO v_pos FROM fund_member_positions WHERE id = p_member_position_id;
  SELECT * INTO v_fund FROM workspace_funds WHERE id = v_pos.fund_id;
  v_current_nav := v_fund.nav_per_unit;

  IF v_pos.total_units <= 0 OR v_pos.avg_cost_basis <= 0 THEN
    INSERT INTO fund_member_signals (member_position_id, signal_date, composite_score, signal)
    VALUES (p_member_position_id, CURRENT_DATE, 0, 'hold')
    ON CONFLICT (member_position_id, signal_date) DO UPDATE SET composite_score = 0, signal = 'hold';
    RETURN 'hold';
  END IF;

  v_current_value := v_pos.total_units * v_current_nav;
  v_personal_return := (v_current_nav - v_pos.avg_cost_basis) / v_pos.avg_cost_basis;

  -- Factor 1: Target return achieved (weight 30)
  v_f1 := CASE
    WHEN v_personal_return >= v_pos.return_target_pct * 1.5 THEN -30
    WHEN v_personal_return >= v_pos.return_target_pct THEN -15
    WHEN v_personal_return >= v_pos.return_target_pct * 0.5 THEN 0
    WHEN v_personal_return >= 0 THEN 10
    ELSE 20
  END;

  -- Factor 2: 7-day momentum (weight 20)
  SELECT closing_nav INTO v_nav_7d FROM nav_snapshots
    WHERE fund_id = v_pos.fund_id AND snapshot_date = CURRENT_DATE - 7;
  v_f2 := CASE
    WHEN v_nav_7d IS NULL THEN 0
    WHEN v_current_nav > v_nav_7d * 1.02 THEN 15
    WHEN v_current_nav > v_nav_7d THEN 5
    WHEN v_current_nav < v_nav_7d * 0.98 THEN -15
    ELSE -5
  END;

  -- Factor 3: 30-day momentum (weight 20)
  SELECT closing_nav INTO v_nav_30d FROM nav_snapshots
    WHERE fund_id = v_pos.fund_id AND snapshot_date = CURRENT_DATE - 30;
  v_f3 := CASE
    WHEN v_nav_30d IS NULL THEN 0
    WHEN v_current_nav > v_nav_30d * 1.05 THEN 15
    WHEN v_current_nav > v_nav_30d THEN 5
    WHEN v_current_nav < v_nav_30d * 0.95 THEN -15
    ELSE -5
  END;

  -- Factor 4: 52-week high proximity (weight 15)
  SELECT MAX(closing_nav) INTO v_nav_52w_high FROM nav_snapshots
    WHERE fund_id = v_pos.fund_id AND snapshot_date >= CURRENT_DATE - 365;
  v_f4 := CASE
    WHEN v_nav_52w_high IS NULL OR v_nav_52w_high = 0 THEN 0
    WHEN v_current_nav >= v_nav_52w_high * 0.95 THEN -15
    WHEN v_current_nav >= v_nav_52w_high * 0.85 THEN -5
    ELSE 5
  END;

  -- Factor 5: 52-week low proximity (weight 15)
  SELECT MIN(closing_nav) INTO v_nav_52w_low FROM nav_snapshots
    WHERE fund_id = v_pos.fund_id AND snapshot_date >= CURRENT_DATE - 365;
  v_f5 := CASE
    WHEN v_nav_52w_low IS NULL OR v_nav_52w_low = 0 THEN 0
    WHEN v_current_nav <= v_nav_52w_low * 1.05 THEN 15
    WHEN v_current_nav <= v_nav_52w_low * 1.15 THEN 5
    ELSE -5
  END;

  v_score := v_f1 + v_f2 + v_f3 + v_f4 + v_f5;

  v_signal := CASE
    WHEN v_score >= 40 THEN 'strong_buy'
    WHEN v_score >= 15 THEN 'consider_buy'
    WHEN v_score > -15 THEN 'hold'
    WHEN v_score > -40 THEN 'consider_sell'
    ELSE 'strong_sell'
  END;

  -- Hypothetical sell calculation
  v_hyp_gross := ROUND(v_pos.total_units * v_current_nav, 2);
  v_hyp_fee := ROUND(v_hyp_gross * v_fund.jackisa_exit_fee_rate, 2);
  v_cap_gain := GREATEST(0, (v_hyp_gross - v_hyp_fee) - v_pos.total_invested);
  v_hyp_tax := ROUND(v_cap_gain * 0.15, 2);
  v_hyp_net := v_hyp_gross - v_hyp_fee - v_hyp_tax;

  INSERT INTO fund_member_signals (
    member_position_id, signal_date, composite_score, signal,
    factor_target_return, factor_7d_momentum, factor_30d_momentum,
    factor_52w_high_proximity, factor_52w_low_proximity,
    hypothetical_sell_gross, hypothetical_sell_fee,
    hypothetical_sell_tax, hypothetical_sell_net
  ) VALUES (
    p_member_position_id, CURRENT_DATE, v_score, v_signal,
    v_f1, v_f2, v_f3, v_f4, v_f5,
    v_hyp_gross, v_hyp_fee, v_hyp_tax, v_hyp_net
  ) ON CONFLICT (member_position_id, signal_date) DO UPDATE SET
    composite_score = v_score, signal = v_signal,
    factor_target_return = v_f1, factor_7d_momentum = v_f2,
    factor_30d_momentum = v_f3, factor_52w_high_proximity = v_f4,
    factor_52w_low_proximity = v_f5,
    hypothetical_sell_gross = v_hyp_gross, hypothetical_sell_fee = v_hyp_fee,
    hypothetical_sell_tax = v_hyp_tax, hypothetical_sell_net = v_hyp_net;

  RETURN v_signal;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Daily end-of-day automation sequence
-- Run this via pg_cron or Supabase Edge Function at midnight
-- ============================================================================

CREATE OR REPLACE FUNCTION run_daily_fund_automation()
RETURNS TABLE(fund_id UUID, company_name VARCHAR, nav_before DECIMAL, nav_after DECIMAL, members_signalled INTEGER) AS $$
DECLARE
  v_fund RECORD;
  v_nav_before DECIMAL;
  v_nav_after DECIMAL;
  v_member RECORD;
  v_member_count INTEGER;
BEGIN
  FOR v_fund IN
    SELECT wf.*, c.name as co_name
    FROM workspace_funds wf
    JOIN companies c ON c.id = wf.company_id
    WHERE wf.is_active = TRUE
  LOOP
    v_nav_before := v_fund.nav_per_unit;

    -- Step 1: Accrue interest on liabilities
    PERFORM accrue_daily_interest(v_fund.id);

    -- Step 2: Apply daily compounding
    PERFORM apply_daily_compounding(v_fund.id);

    -- Step 3: Recalculate NAV
    v_nav_after := calculate_fund_nav(v_fund.id);

    -- Step 4: Generate signals for all members
    v_member_count := 0;
    FOR v_member IN
      SELECT id FROM fund_member_positions
      WHERE fund_id = v_fund.id AND is_active = TRUE AND total_units > 0
    LOOP
      PERFORM generate_member_signal(v_member.id);
      v_member_count := v_member_count + 1;
    END LOOP;

    -- Step 5: Store daily snapshot
    INSERT INTO nav_snapshots (
      fund_id, snapshot_date, opening_nav, closing_nav,
      total_assets, total_liabilities, total_units, cash_pool
    ) VALUES (
      v_fund.id, CURRENT_DATE, v_nav_before, v_nav_after,
      v_fund.total_assets, v_fund.total_liabilities,
      v_fund.total_units_outstanding, v_fund.cash_pool
    ) ON CONFLICT (fund_id, snapshot_date) DO UPDATE SET
      closing_nav = v_nav_after;

    -- Step 6: Process standing orders due today
    PERFORM process_standing_orders(v_fund.id);

    fund_id := v_fund.id;
    company_name := v_fund.co_name;
    nav_before := v_nav_before;
    nav_after := v_nav_after;
    members_signalled := v_member_count;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Process standing orders for a fund
-- ============================================================================

CREATE OR REPLACE FUNCTION process_standing_orders(p_fund_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_order RECORD;
  v_count INTEGER := 0;
  v_next DATE;
BEGIN
  FOR v_order IN
    SELECT so.*, mp.id as mp_id
    FROM fund_standing_orders so
    JOIN fund_member_positions mp ON mp.id = so.member_position_id
    WHERE mp.fund_id = p_fund_id
      AND so.is_active = TRUE
      AND so.next_execution_date <= CURRENT_DATE
  LOOP
    PERFORM process_contribution(p_fund_id, v_order.member_position_id, v_order.amount, NULL);

    v_next := CASE v_order.frequency
      WHEN 'weekly' THEN v_order.next_execution_date + INTERVAL '7 days'
      WHEN 'biweekly' THEN v_order.next_execution_date + INTERVAL '14 days'
      WHEN 'monthly' THEN v_order.next_execution_date + INTERVAL '1 month'
      WHEN 'quarterly' THEN v_order.next_execution_date + INTERVAL '3 months'
    END;

    UPDATE fund_standing_orders SET
      next_execution_date = v_next,
      total_executed = total_executed + 1,
      last_executed_at = NOW()
    WHERE id = v_order.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Process confirmed sale → fund revenue allocation
-- Called when a sales_order status changes to 'confirmed'
-- ============================================================================

CREATE OR REPLACE FUNCTION process_sale_to_fund_allocation(
  p_company_id UUID,
  p_sale_id UUID,
  p_sale_total DECIMAL,
  p_sale_profit DECIMAL
) RETURNS UUID AS $$
DECLARE
  v_fund workspace_funds%ROWTYPE;
  v_alloc_pct DECIMAL;
  v_gross_alloc DECIMAL;
  v_jfee DECIMAL;
  v_mfee DECIMAL;
  v_net DECIMAL;
  v_tx_id UUID;
BEGIN
  SELECT * INTO v_fund FROM workspace_funds WHERE company_id = p_company_id AND is_active = TRUE;
  IF v_fund.id IS NULL THEN RETURN NULL; END IF;

  IF p_sale_profit <= 0 THEN RETURN NULL; END IF;
  IF p_sale_total < v_fund.min_daily_sales_threshold THEN RETURN NULL; END IF;

  v_alloc_pct := v_fund.sales_profit_alloc_pct;
  v_gross_alloc := ROUND(p_sale_profit * v_alloc_pct, 2);

  SELECT * INTO v_jfee, v_mfee, v_net FROM calculate_fee_waterfall(
    v_gross_alloc, v_fund.jackisa_revenue_alloc_fee_rate, v_fund.mgmt_annual_fee_rate
  );

  INSERT INTO fund_transactions (
    fund_id, tx_type, gross_amount, jackisa_fee, mgmt_fee,
    net_amount, nav_at_transaction, units_transacted,
    reference_type, reference_id, description
  ) VALUES (
    v_fund.id, 'revenue_alloc', v_gross_alloc, v_jfee, v_mfee,
    v_net, v_fund.nav_per_unit, 0,
    'sales_order', p_sale_id, 'Auto-allocation from confirmed sale'
  ) RETURNING id INTO v_tx_id;

  UPDATE workspace_funds SET
    cash_pool = cash_pool + v_net,
    updated_at = NOW()
  WHERE id = v_fund.id;

  INSERT INTO jackisa_platform_revenue (fund_id, company_id, fee_type, gross_transaction_amount, fee_amount, reference_tx_id)
  VALUES (v_fund.id, p_company_id, 'revenue_alloc_fee', v_gross_alloc, v_jfee, v_tx_id);

  INSERT INTO ecosystem_events (
    company_id, event_type, source_module, source_table, source_record_id,
    target_module, target_table, target_record_id, payload, processed, processed_at
  ) VALUES (
    p_company_id, 'sale_confirmed', 'sales', 'sales_orders', p_sale_id,
    'investment', 'fund_transactions', v_tx_id,
    jsonb_build_object('sale_total', p_sale_total, 'profit', p_sale_profit, 'alloc', v_net),
    TRUE, NOW()
  );

  PERFORM calculate_fund_nav(v_fund.id);

  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Auto-create fund when company is created
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_workspace_fund()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workspace_funds (company_id, fund_name, currency, inception_date)
  VALUES (NEW.id, NEW.name || ' Investment Fund', COALESCE(NEW.currency, 'UGX'), CURRENT_DATE)
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_create_fund ON companies;
CREATE TRIGGER trg_auto_create_fund
  AFTER INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION auto_create_workspace_fund();

-- ============================================================================
-- FUNCTION: Student enrollment → auto invoice + ecosystem event
-- ============================================================================

CREATE OR REPLACE FUNCTION on_student_enrollment()
RETURNS TRIGGER AS $$
DECLARE
  v_student students%ROWTYPE;
  v_module education_modules%ROWTYPE;
  v_company_id UUID;
  v_admin_id UUID;
  v_invoice_id UUID;
  v_inv_number VARCHAR;
BEGIN
  SELECT * INTO v_student FROM students WHERE id = NEW.student_id;
  SELECT * INTO v_module FROM education_modules WHERE id = NEW.module_id;
  v_company_id := v_student.company_id;

  IF v_module.tuition_fee IS NOT NULL AND v_module.tuition_fee > 0 THEN
    SELECT user_id INTO v_admin_id FROM company_employees
      WHERE company_id = v_company_id AND status = 'active'
      ORDER BY created_at LIMIT 1;

    IF v_admin_id IS NULL THEN
      SELECT created_by INTO v_admin_id FROM companies WHERE id = v_company_id;
    END IF;

    v_inv_number := 'EDU-' || LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0');

    INSERT INTO invoices (
      company_id, invoice_number, invoice_date, due_date,
      customer_name, customer_email, subtotal, tax_amount,
      total_amount, status, notes, created_by
    ) VALUES (
      v_company_id, v_inv_number, CURRENT_DATE, CURRENT_DATE + 30,
      v_student.full_name, v_student.email,
      v_module.tuition_fee, 0, v_module.tuition_fee,
      'sent', 'Auto-generated: Enrollment in ' || v_module.module_name,
      v_admin_id
    ) RETURNING id INTO v_invoice_id;

    INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
    VALUES (v_invoice_id, 'Tuition: ' || v_module.module_name, 1, v_module.tuition_fee, v_module.tuition_fee);

    UPDATE students SET tuition_amount = v_module.tuition_fee, payment_status = 'invoiced'
    WHERE id = NEW.student_id;

    INSERT INTO ecosystem_events (
      company_id, event_type, source_module, source_table, source_record_id,
      target_module, target_table, target_record_id,
      payload, processed, processed_at
    ) VALUES (
      v_company_id, 'student_enrolled', 'education', 'student_enrollments', NEW.id,
      'accounting', 'invoices', v_invoice_id,
      jsonb_build_object('student', v_student.full_name, 'module', v_module.module_name, 'amount', v_module.tuition_fee),
      TRUE, NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_student_enrollment ON student_enrollments;
CREATE TRIGGER trg_student_enrollment
  AFTER INSERT ON student_enrollments
  FOR EACH ROW EXECUTE FUNCTION on_student_enrollment();

-- ============================================================================
-- FUNCTION: Invoice paid → auto fund allocation + ecosystem event
-- ============================================================================

CREATE OR REPLACE FUNCTION on_invoice_paid()
RETURNS TRIGGER AS $$
DECLARE
  v_profit DECIMAL;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    v_profit := ROUND(NEW.total_amount * 0.3, 2);

    PERFORM process_sale_to_fund_allocation(NEW.company_id, NEW.id, NEW.total_amount, v_profit);

    INSERT INTO ecosystem_events (
      company_id, event_type, source_module, source_table, source_record_id,
      target_module, payload, processed, processed_at
    ) VALUES (
      NEW.company_id, 'invoice_paid', 'accounting', 'invoices', NEW.id,
      'investment',
      jsonb_build_object('invoice', NEW.invoice_number, 'amount', NEW.total_amount, 'profit_est', v_profit),
      TRUE, NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_paid ON invoices;
CREATE TRIGGER trg_invoice_paid
  AFTER UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION on_invoice_paid();

-- ============================================================================
-- FUNCTION: Sales order confirmed → auto fund allocation
-- ============================================================================

CREATE OR REPLACE FUNCTION on_sale_confirmed()
RETURNS TRIGGER AS $$
DECLARE
  v_profit DECIMAL;
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    v_profit := ROUND(NEW.total_amount * 0.25, 2);

    PERFORM process_sale_to_fund_allocation(NEW.company_id, NEW.id, NEW.total_amount, v_profit);

    INSERT INTO ecosystem_events (
      company_id, event_type, source_module, source_table, source_record_id,
      target_module, payload, processed, processed_at
    ) VALUES (
      NEW.company_id, 'sale_confirmed', 'sales', 'sales_orders', NEW.id,
      'investment',
      jsonb_build_object('order', NEW.order_number, 'total', NEW.total_amount, 'profit_est', v_profit),
      TRUE, NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sale_confirmed ON sales_orders;
CREATE TRIGGER trg_sale_confirmed
  AFTER UPDATE ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION on_sale_confirmed();

-- ============================================================================
-- FUNCTION: Attendance → auto HR points
-- ============================================================================

CREATE OR REPLACE FUNCTION on_attendance_recorded()
RETURNS TRIGGER AS $$
DECLARE
  v_employee company_employees%ROWTYPE;
  v_rule_id UUID;
  v_points DECIMAL;
BEGIN
  SELECT * INTO v_employee FROM company_employees WHERE id = NEW.employee_id;

  IF NEW.status = 'present' AND NEW.late_minutes = 0 THEN
    SELECT id, point_value INTO v_rule_id, v_points FROM point_rules
      WHERE company_id = v_employee.company_id AND category = 'attendance' AND action_type = 'gain' AND is_active = TRUE
      ORDER BY sort_order LIMIT 1;

    IF v_rule_id IS NOT NULL THEN
      INSERT INTO point_transactions (company_id, employee_id, rule_id, action_type, points, reason, recorded_by, recorded_date)
      VALUES (v_employee.company_id, NEW.employee_id, v_rule_id, 'gain', v_points, 'Auto: Perfect attendance', v_employee.user_id, NEW.attendance_date);

      INSERT INTO ecosystem_events (
        company_id, event_type, source_module, source_table, source_record_id,
        target_module, payload, processed, processed_at
      ) VALUES (
        v_employee.company_id, 'attendance_recorded', 'hr', 'attendance_records', NEW.id,
        'hr_points', jsonb_build_object('points', v_points, 'type', 'gain'), TRUE, NOW()
      );
    END IF;
  ELSIF NEW.late_minutes > 15 THEN
    SELECT id, point_value INTO v_rule_id, v_points FROM point_rules
      WHERE company_id = v_employee.company_id AND category = 'attendance' AND action_type = 'loss' AND is_active = TRUE
      ORDER BY sort_order LIMIT 1;

    IF v_rule_id IS NOT NULL THEN
      INSERT INTO point_transactions (company_id, employee_id, rule_id, action_type, points, reason, recorded_by, recorded_date)
      VALUES (v_employee.company_id, NEW.employee_id, v_rule_id, 'loss', v_points, 'Auto: Late >' || NEW.late_minutes || 'min', v_employee.user_id, NEW.attendance_date);

      INSERT INTO ecosystem_events (
        company_id, event_type, source_module, source_table, source_record_id,
        target_module, payload, processed, processed_at
      ) VALUES (
        v_employee.company_id, 'attendance_recorded', 'hr', 'attendance_records', NEW.id,
        'hr_points', jsonb_build_object('points', v_points, 'type', 'loss', 'late_min', NEW.late_minutes), TRUE, NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attendance_recorded ON attendance_records;
CREATE TRIGGER trg_attendance_recorded
  AFTER INSERT ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION on_attendance_recorded();

-- ============================================================================
-- FUNCTION: Payroll processed → auto fund contribution
-- ============================================================================

CREATE OR REPLACE FUNCTION on_payroll_processed()
RETURNS TRIGGER AS $$
DECLARE
  v_pos fund_member_positions%ROWTYPE;
  v_fund workspace_funds%ROWTYPE;
  v_contribution DECIMAL;
BEGIN
  IF NEW.status = 'approved' OR NEW.status = 'paid' THEN
    SELECT mp.* INTO v_pos FROM fund_member_positions mp
      WHERE mp.employee_id = NEW.employee_id AND mp.is_active = TRUE
      LIMIT 1;

    IF v_pos.id IS NOT NULL AND v_pos.auto_contribute_pct > 0 THEN
      v_contribution := ROUND(NEW.net_salary * v_pos.auto_contribute_pct, 2);

      IF v_contribution > 0 THEN
        SELECT * INTO v_fund FROM workspace_funds WHERE id = v_pos.fund_id;

        PERFORM process_contribution(v_fund.id, v_pos.id, v_contribution, NULL);

        UPDATE payroll_records SET
          fund_contribution = v_contribution,
          fund_contribution_employee_id = v_pos.id
        WHERE id = NEW.id;

        INSERT INTO ecosystem_events (
          company_id, event_type, source_module, source_table, source_record_id,
          target_module, payload, processed, processed_at
        ) VALUES (
          NEW.company_id, 'payroll_processed', 'hr', 'payroll_records', NEW.id,
          'investment', jsonb_build_object('contribution', v_contribution, 'pct', v_pos.auto_contribute_pct), TRUE, NOW()
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payroll_processed ON payroll_records;
CREATE TRIGGER trg_payroll_processed
  AFTER INSERT OR UPDATE ON payroll_records
  FOR EACH ROW EXECUTE FUNCTION on_payroll_processed();

-- ============================================================================
-- SEED: System tools for the Investment module
-- ============================================================================

INSERT INTO system_tools (name, slug, description, category, icon, route, sort_order) VALUES
  ('Investment Dashboard', 'investment-dashboard', 'Fund NAV overview and live feed', 'Investment & Wealth', 'TrendingUp', '/app/investment', 70),
  ('My Investment', 'my-investment', 'Personal portfolio and signals', 'Investment & Wealth', 'Wallet', '/app/investment/my-portfolio', 71),
  ('Buy Units', 'buy-units', 'Purchase fund units', 'Investment & Wealth', 'ArrowUpCircle', '/app/investment/buy', 72),
  ('Sell Units', 'sell-units', 'Redeem fund units', 'Investment & Wealth', 'ArrowDownCircle', '/app/investment/sell', 73),
  ('Portfolio Manager', 'portfolio-manager', 'Manage fund assets', 'Investment & Wealth', 'PieChart', '/app/investment/assets', 74),
  ('Liabilities', 'fund-liabilities', 'Fund loans and interest', 'Investment & Wealth', 'AlertTriangle', '/app/investment/liabilities', 75),
  ('Revenue Share', 'revenue-share', 'Sales-to-fund bridge config', 'Investment & Wealth', 'GitBranch', '/app/investment/revenue-share', 76),
  ('Beneficiaries', 'beneficiaries', 'Inheritance designations', 'Investment & Wealth', 'Heart', '/app/investment/beneficiaries', 77),
  ('Investment Clubs', 'investment-clubs', 'Sub-fund group investing', 'Investment & Wealth', 'Users', '/app/investment/clubs', 78),
  ('Projections', 'projections', 'Future value calculator', 'Investment & Wealth', 'Compass', '/app/investment/projections', 79),
  ('Reports', 'investment-reports', 'Statements and tax docs', 'Investment & Wealth', 'FileText', '/app/investment/reports', 80)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- RLS POLICIES (basic company-scoped access)
-- ============================================================================

ALTER TABLE workspace_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE nav_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_asset_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_liabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE liability_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_member_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_standing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_member_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_club_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE jackisa_platform_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_revenue_share_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_daily_sales_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecosystem_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read/write their company's data
DO $$ BEGIN
  CREATE POLICY workspace_funds_policy ON workspace_funds FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY nav_snapshots_policy ON nav_snapshots FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY fund_assets_policy ON fund_assets FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY fund_asset_entries_policy ON fund_asset_entries FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY fund_liabilities_policy ON fund_liabilities FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY liability_repayments_policy ON liability_repayments FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY fund_member_positions_policy ON fund_member_positions FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY fund_transactions_policy ON fund_transactions FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY fund_standing_orders_policy ON fund_standing_orders FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY fund_beneficiaries_policy ON fund_beneficiaries FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY fund_member_signals_policy ON fund_member_signals FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY investment_clubs_policy ON investment_clubs FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY investment_club_members_policy ON investment_club_members FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY jackisa_platform_revenue_policy ON jackisa_platform_revenue FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY fund_revenue_share_rules_policy ON fund_revenue_share_rules FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY fund_daily_sales_allocations_policy ON fund_daily_sales_allocations FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY ecosystem_events_policy ON ecosystem_events FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY performance_reviews_policy ON performance_reviews FOR ALL USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
