-- ================================================================
-- STUDENT RESCHEDULE REQUESTS
-- ================================================================

CREATE TABLE IF NOT EXISTS public.reschedule_requests (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id         UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  schedule_id        UUID REFERENCES public.class_schedules(id) ON DELETE SET NULL,
  subject_id         UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  current_day        TEXT,
  current_slot_time  TIME,
  requested_day      TEXT NOT NULL,
  requested_time     TIME NOT NULL,
  reason             TEXT,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at        TIMESTAMPTZ,
  review_note        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.reschedule_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rr_read"   ON public.reschedule_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "rr_insert" ON public.reschedule_requests FOR INSERT TO authenticated WITH CHECK (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "rr_update" ON public.reschedule_requests FOR UPDATE TO authenticated USING (my_role() IN ('superadmin','center_manager'));

-- Note: Student portal uses service role via API, so no student-facing RLS policy needed
