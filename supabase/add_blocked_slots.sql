-- Blocked slots table — admin can block specific time slots
CREATE TABLE IF NOT EXISTS public.blocked_slots (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_of_week TEXT NOT NULL,
  start_time  TIME NOT NULL,
  reason      TEXT,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(day_of_week, start_time)
);
ALTER TABLE public.blocked_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bs_read"   ON public.blocked_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "bs_insert" ON public.blocked_slots FOR INSERT TO authenticated WITH CHECK (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "bs_delete" ON public.blocked_slots FOR DELETE TO authenticated USING (my_role() IN ('superadmin','center_manager'));
