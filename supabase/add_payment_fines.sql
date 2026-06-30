-- ================================================================
-- LATE PAYMENT FINES: due_date tracking + 5% per 15 days overdue
-- ================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS due_date              DATE,
  ADD COLUMN IF NOT EXISTS fine_amount           INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fine_enabled          BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_fine_reminder_at TIMESTAMPTZ;

-- Index to speed up the overdue-scan cron job
CREATE INDEX IF NOT EXISTS idx_payments_pending_due
  ON public.payments (status, due_date)
  WHERE status IN ('pending', 'overdue');
