-- ============================================================================
-- Jackisa One — cross-platform entitlements on jackisa.com (MySQL).
-- Run once against the jackisa.com database (u388105230_plusmaincp).
-- Safe to re-run.
--
-- A single row per jackisa.com user records what their Jackisa Office plan
-- unlocks on jackisa.com (channels, live minutes, store, badge, meeting seats).
-- It is written by the licence hub via office_bridge.php's sync_entitlements
-- action and read by office_entitlements.php for enforcement.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `office_entitlements` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) NOT NULL,
  `tier` VARCHAR(20) NOT NULL DEFAULT 'basic',
  `plan_code` VARCHAR(60) NULL,
  `lic_tenant_id` VARCHAR(64) NULL,
  `channels` INT(11) NOT NULL DEFAULT 0,
  `live_minutes` INT(11) NOT NULL DEFAULT 0,
  `store_enabled` TINYINT(4) NOT NULL DEFAULT 0,
  `store_publish_courses` TINYINT(4) NOT NULL DEFAULT 0,
  `verified_badge` TINYINT(4) NOT NULL DEFAULT 0,
  `meeting_seats` INT(11) NOT NULL DEFAULT 0,
  `member_seats` INT(11) NOT NULL DEFAULT 0,
  `features` TEXT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `synced_at` INT(11) NULL,
  `created_at` INT(11) NULL,
  `updated_at` INT(11) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user` (`user_id`),
  KEY `idx_tier` (`tier`),
  KEY `idx_tenant` (`lic_tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
