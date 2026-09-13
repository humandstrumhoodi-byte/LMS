-- ================================================================
-- SLOT HOLD EXPIRY ALERTS
--
-- The 2-week (SLOT_HOLD_GRACE_DAYS) unpaid-slot hold already existed in
-- student_slot_holds (see add_slot_holds.sql), but nothing alerted anyone
-- as a hold approached expiry or notified when it actually released the
-- slot back to the free pool. This column lets the daily cron
-- (/api/cron-fines) track whether the "expiring soon" warning has already
-- gone out for a given hold, so it's sent once rather than every day.
-- ================================================================

ALTER TABLE public.student_slot_holds
  ADD COLUMN IF NOT EXISTS expiry_alert_sent_at TIMESTAMPTZ;
