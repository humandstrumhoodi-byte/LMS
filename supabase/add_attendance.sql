-- ================================================================
-- ATTENDANCE SYSTEM
-- ================================================================

CREATE TABLE IF NOT EXISTS public.attendance (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id   UUID REFERENCES public.class_schedules(id) ON DELETE SET NULL,
  student_id    UUID REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  class_date    DATE NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('student','teacher')),
  status        TEXT NOT NULL CHECK (status IN ('present','absent','absent_billable','late')),
  -- absent = informed in advance (not billable)
  -- absent_billable = no notice given (billable)
  informed_at   TIMESTAMPTZ,   -- when student informed (if absent)
  notes         TEXT,
  marked_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(schedule_id, student_id, class_date),
  UNIQUE(schedule_id, teacher_id, class_date)
);

-- Remove unique constraints that are too strict (one per type)
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_schedule_id_student_id_class_date_key;
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_schedule_id_teacher_id_class_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_student_unique
  ON public.attendance(schedule_id, student_id, class_date)
  WHERE type = 'student' AND student_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_teacher_unique
  ON public.attendance(schedule_id, teacher_id, class_date)
  WHERE type = 'teacher' AND teacher_id IS NOT NULL;

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "att_read"   ON public.attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "att_insert" ON public.attendance FOR INSERT TO authenticated WITH CHECK (my_role() IN ('superadmin','center_manager','teacher'));
CREATE POLICY "att_update" ON public.attendance FOR UPDATE TO authenticated USING (my_role() IN ('superadmin','center_manager','teacher'));
CREATE POLICY "att_delete" ON public.attendance FOR DELETE TO authenticated USING (my_role() IN ('superadmin','center_manager'));
