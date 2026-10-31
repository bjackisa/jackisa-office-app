-- ============================================================================
-- 006 — Legacy backfill: adapt pre-existing hub data to the licensing model.
--
-- The hub was seeded and exercised before subscriptions were being written, so
-- tenants have licences but no billing relationship (subscriptions = 0), and
-- some tenants carry several licences that are still in a "live" state. This
-- migration makes the historical rows obey the current invariants. Idempotent:
-- safe to re-run. Run with:  php bin/migrate.php
--
-- What it does:
--   1. One subscription per tenant, derived from that tenant's newest licence,
--      so licence + billing agree (previously subscriptions was empty).
--   2. At most one "live" licence (trial/active/grace) per tenant — the newest
--      wins, the rest are expired, matching LicenseService::issue().
--   3. Trials past their end are marked expired; a tenant whose newest licence
--      is active/grace gets its lingering trials marked converted.
--   4. Every licence gets a grace_until if it is missing one.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------------
-- 1. Subscriptions from the newest licence per tenant.
--    (id is a generated UUID string; UUID() is fine for a one-off backfill.)
-- ---------------------------------------------------------------------------
INSERT INTO subscriptions
  (id, tenant_id, license_id, plan_code, tier, interval_months, status,
   amount, currency, current_period_start, current_period_end, trial_ends_at,
   auto_renew, cancelled_at)
SELECT
  UUID(),
  l.tenant_id,
  l.id,
  l.plan_code,
  l.tier,
  l.interval_months,
  CASE l.status
    WHEN 'trial'  THEN 'trialing'
    WHEN 'active' THEN 'active'
    WHEN 'grace'  THEN 'past_due'
    ELSE 'expired'
  END,
  COALESCE(p.price, 0),
  COALESCE(p.currency, 'UGX'),
  l.starts_at,
  l.expires_at,
  CASE WHEN l.status = 'trial' THEN l.expires_at ELSE NULL END,
  CASE WHEN l.status IN ('expired','revoked','suspended') THEN 0 ELSE 1 END,
  CASE WHEN l.status IN ('expired','revoked','suspended') THEN l.expires_at ELSE NULL END
FROM licenses l
LEFT JOIN plans p ON p.code = l.plan_code
WHERE l.created_at = (
        SELECT MAX(l2.created_at) FROM licenses l2 WHERE l2.tenant_id = l.tenant_id
      )
  AND NOT EXISTS (
        SELECT 1 FROM subscriptions s WHERE s.tenant_id = l.tenant_id
      );

-- ---------------------------------------------------------------------------
-- 2. Keep only the newest live licence per tenant.
-- ---------------------------------------------------------------------------
UPDATE licenses
   SET status = 'expired', updated_at = NOW()
 WHERE status IN ('trial','active','grace')
   AND id NOT IN (
     SELECT keep_id FROM (
       SELECT SUBSTRING_INDEX(
                GROUP_CONCAT(id ORDER BY created_at DESC, issued_at DESC), ',', 1
              ) AS keep_id
         FROM licenses
        WHERE status IN ('trial','active','grace')
        GROUP BY tenant_id
     ) AS newest
   );

-- ---------------------------------------------------------------------------
-- 3. Trials: expire the lapsed, convert those behind a live licence.
-- ---------------------------------------------------------------------------
UPDATE trials
   SET status = 'expired', updated_at = NOW()
 WHERE status IN ('active','reminded')
   AND ends_at < NOW();

UPDATE trials t
   SET t.status = 'converted', t.converted_at = COALESCE(t.converted_at, NOW()), t.updated_at = NOW()
 WHERE t.status IN ('active','reminded')
   AND EXISTS (
     SELECT 1 FROM licenses l
      WHERE l.tenant_id = t.tenant_id
        AND l.status IN ('active','grace')
        AND l.created_at > t.started_at
   );

-- ---------------------------------------------------------------------------
-- 4. Every licence carries a grace window.
-- ---------------------------------------------------------------------------
UPDATE licenses
   SET grace_until = DATE_ADD(expires_at, INTERVAL 14 DAY), updated_at = NOW()
 WHERE grace_until IS NULL;
