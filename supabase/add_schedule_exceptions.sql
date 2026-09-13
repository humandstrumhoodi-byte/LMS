-- ================================================================
-- SINGLE-INSTANCE CLASS RESCHEDULING
--
-- Previously, approving a reschedule request updated class_schedules
-- (day_of_week/start_time) directly — which is the recurring weekly
-- template, so it permanently moved EVERY future occurrence, not just
-- the one class the student asked to move. This table lets one specific
-- occurrence be moved/cancelled without touching the recurring template.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.class_schedule_exceptions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id    UUID NOT NULL REFERENCES public.class_schedules(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,  -- the specific calendar date of the occurrence being overridden
  new_date       DATE,           -- where that one occurrence moves to; NULL = that occurrence is just cancelled
  new_time       TIME,           -- new start time on new_date (defaults to the schedule's own start_time if null)
  reason         TEXT,
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (schedule_id, exception_date)
);

ALTER TABLE public.class_schedule_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cse_read" ON public.class_schedule_exceptions;
CREATE POLICY "cse_read" ON public.class_schedule_exceptions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cse_write" ON public.class_schedule_exceptions;
CREATE POLICY "cse_write" ON public.class_schedule_exceptions FOR ALL TO authenticated
  USING (my_role() IN ('superadmin','center_manager'))
  WITH CHECK (my_role() IN ('superadmin','center_manager'));

-- The specific occurrence date being requested, so approval can create a
-- one-date exception instead of mutating the recurring schedule. Nullable
-- for any already-pending rows created before this migration ran.
ALTER TABLE public.reschedule_requests ADD COLUMN IF NOT EXISTS requested_date DATE;
