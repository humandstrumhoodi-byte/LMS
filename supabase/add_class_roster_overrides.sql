-- ================================================================
-- PER-OCCURRENCE CLASS ROSTER OVERRIDES
--
-- schedule_students is the RECURRING roster for a weekly class slot — every
-- row there applies to every future occurrence. There was no way to add or
-- remove a student for just one specific date (a trial sit-in, a one-off
-- makeup class, a single date a regular can't attend) without touching the
-- recurring roster for every week after it too.
--
-- This table layers per-date overrides on top of the recurring roster,
-- following the same one-occurrence-only pattern as
-- add_schedule_exceptions.sql. For a given (schedule_id, occurrence_date):
--   effective roster = (recurring roster − 'removed' overrides) ∪ 'added' overrides
-- ================================================================

CREATE TABLE IF NOT EXISTS public.class_roster_overrides (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id     UUID NOT NULL REFERENCES public.class_schedules(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('added','removed')),
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (schedule_id, student_id, occurrence_date)
);

CREATE INDEX IF NOT EXISTS idx_roster_overrides_lookup
  ON public.class_roster_overrides(schedule_id, occurrence_date);

ALTER TABLE public.class_roster_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cro_read" ON public.class_roster_overrides;
CREATE POLICY "cro_read" ON public.class_roster_overrides FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cro_write" ON public.class_roster_overrides;
CREATE POLICY "cro_write" ON public.class_roster_overrides FOR ALL TO authenticated
  USING (my_role() IN ('superadmin','center_manager'))
  WITH CHECK (my_role() IN ('superadmin','center_manager'));
