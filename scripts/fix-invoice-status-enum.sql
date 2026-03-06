-- Ensures invoice_status supports partial settlements used by invoice + credit note flows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'invoice_status'
      AND e.enumlabel = 'partially_paid'
  ) THEN
    ALTER TYPE invoice_status ADD VALUE 'partially_paid' AFTER 'sent';
  END IF;
END $$;
