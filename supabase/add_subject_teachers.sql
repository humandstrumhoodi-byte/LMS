-- ================================================================
-- Subject Teachers — many teachers per subject per grade level
-- ================================================================

-- New junction table: subject_id + teacher_id + grade_level
CREATE TABLE IF NOT EXISTS public.subject_teachers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id   UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  grade_level  TEXT NOT NULL DEFAULT 'All Levels',
  is_primary   BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(subject_id, teacher_id, grade_level)
);

ALTER TABLE public.subject_teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "st_read"   ON public.subject_teachers FOR SELECT TO authenticated USING (true);
CREATE POLICY "st_insert" ON public.subject_teachers FOR INSERT TO authenticated WITH CHECK (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "st_update" ON public.subject_teachers FOR UPDATE TO authenticated USING (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "st_delete" ON public.subject_teachers FOR DELETE TO authenticated USING (my_role() IN ('superadmin','center_manager'));

-- Migrate existing single teacher_id → subject_teachers
INSERT INTO public.subject_teachers (subject_id, teacher_id, grade_level, is_primary)
SELECT id, teacher_id, 'All Levels', TRUE
FROM public.subjects
WHERE teacher_id IS NOT NULL
ON CONFLICT DO NOTHING;
