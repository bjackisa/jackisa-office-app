BEGIN;

CREATE OR REPLACE FUNCTION sync_fund_members_for_fund(p_fund_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_company_id UUID;
  v_count INTEGER := 0;
BEGIN
  SELECT company_id INTO v_company_id
  FROM workspace_funds
  WHERE id = p_fund_id;

  IF v_company_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO fund_member_positions (
    fund_id,
    employee_id,
    user_id,
    is_active,
    joined_at,
    created_at,
    updated_at
  )
  SELECT
    p_fund_id,
    ce.id,
    ce.user_id,
    TRUE,
    NOW(),
    NOW(),
    NOW()
  FROM company_employees ce
  WHERE ce.company_id = v_company_id
    AND ce.status = 'active'
    AND ce.user_id IS NOT NULL
  ON CONFLICT (fund_id, employee_id)
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    is_active = TRUE,
    updated_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_fund_members_for_company(p_company_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_fund_id UUID;
BEGIN
  SELECT id INTO v_fund_id
  FROM workspace_funds
  WHERE company_id = p_company_id;

  IF v_fund_id IS NULL THEN
    RETURN 0;
  END IF;

  RETURN sync_fund_members_for_fund(v_fund_id);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_sync_members_after_fund_create()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM sync_fund_members_for_fund(NEW.id);
  PERFORM calculate_fund_nav(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_members_after_fund_create ON workspace_funds;
CREATE TRIGGER trg_sync_members_after_fund_create
  AFTER INSERT ON workspace_funds
  FOR EACH ROW EXECUTE FUNCTION trg_sync_members_after_fund_create();

CREATE OR REPLACE FUNCTION trg_sync_members_after_employee_change()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
BEGIN
  v_company_id := COALESCE(NEW.company_id, OLD.company_id);
  PERFORM sync_fund_members_for_company(v_company_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_members_after_employee_change ON company_employees;
CREATE TRIGGER trg_sync_members_after_employee_change
  AFTER INSERT OR UPDATE ON company_employees
  FOR EACH ROW EXECUTE FUNCTION trg_sync_members_after_employee_change();

CREATE OR REPLACE FUNCTION trg_recalculate_nav_from_assets()
RETURNS TRIGGER AS $$
DECLARE
  v_fund_id UUID;
BEGIN
  v_fund_id := COALESCE(NEW.fund_id, OLD.fund_id);
  IF v_fund_id IS NOT NULL THEN
    PERFORM calculate_fund_nav(v_fund_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalculate_nav_from_assets ON fund_assets;
CREATE TRIGGER trg_recalculate_nav_from_assets
  AFTER INSERT OR UPDATE OR DELETE ON fund_assets
  FOR EACH ROW EXECUTE FUNCTION trg_recalculate_nav_from_assets();

CREATE OR REPLACE FUNCTION trg_recalculate_nav_from_asset_entries()
RETURNS TRIGGER AS $$
DECLARE
  v_fund_id UUID;
BEGIN
  SELECT fa.fund_id INTO v_fund_id
  FROM fund_assets fa
  WHERE fa.id = COALESCE(NEW.asset_id, OLD.asset_id);

  IF v_fund_id IS NOT NULL THEN
    PERFORM calculate_fund_nav(v_fund_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalculate_nav_from_asset_entries ON fund_asset_entries;
CREATE TRIGGER trg_recalculate_nav_from_asset_entries
  AFTER INSERT OR UPDATE OR DELETE ON fund_asset_entries
  FOR EACH ROW EXECUTE FUNCTION trg_recalculate_nav_from_asset_entries();

CREATE OR REPLACE FUNCTION trg_recalculate_nav_from_liabilities()
RETURNS TRIGGER AS $$
DECLARE
  v_fund_id UUID;
BEGIN
  v_fund_id := COALESCE(NEW.fund_id, OLD.fund_id);
  IF v_fund_id IS NOT NULL THEN
    PERFORM calculate_fund_nav(v_fund_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalculate_nav_from_liabilities ON fund_liabilities;
CREATE TRIGGER trg_recalculate_nav_from_liabilities
  AFTER INSERT OR UPDATE OR DELETE ON fund_liabilities
  FOR EACH ROW EXECUTE FUNCTION trg_recalculate_nav_from_liabilities();

CREATE OR REPLACE FUNCTION trg_recalculate_nav_from_repayments()
RETURNS TRIGGER AS $$
DECLARE
  v_fund_id UUID;
BEGIN
  SELECT fl.fund_id INTO v_fund_id
  FROM fund_liabilities fl
  WHERE fl.id = COALESCE(NEW.liability_id, OLD.liability_id);

  IF v_fund_id IS NOT NULL THEN
    PERFORM calculate_fund_nav(v_fund_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalculate_nav_from_repayments ON liability_repayments;
CREATE TRIGGER trg_recalculate_nav_from_repayments
  AFTER INSERT OR UPDATE OR DELETE ON liability_repayments
  FOR EACH ROW EXECUTE FUNCTION trg_recalculate_nav_from_repayments();

SELECT sync_fund_members_for_company(company_id)
FROM workspace_funds;

COMMIT;
