-- ============================================================================
-- 007_notifications.sql
-- ----------------------------------------------------------------------------
-- Idempotent notification ledger. Every lifecycle event (trial started,
-- cancelled, plan changed, payment received, reminders) is claimed once per
-- (dedupe_key, channel) so a retried request — or a cron that runs twice — can
-- never double-send an email or a WhatsApp message. Additive and idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id          CHAR(36)     NOT NULL,
  tenant_id   CHAR(36)     DEFAULT NULL,
  event       VARCHAR(60)  NOT NULL,
  dedupe_key  VARCHAR(190) NOT NULL,
  channel     ENUM('email','whatsapp') NOT NULL,
  to_address  VARCHAR(190) DEFAULT NULL,
  subject     VARCHAR(255) DEFAULT NULL,
  status      ENUM('sent','failed','skipped') NOT NULL DEFAULT 'sent',
  error       VARCHAR(500) DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notifications_dedupe (dedupe_key, channel),
  KEY idx_notifications_tenant (tenant_id),
  KEY idx_notifications_event (event),
  CONSTRAINT fk_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
