-- ================================================================
-- CENTER OPERATING HOURS
-- ================================================================

CREATE TABLE IF NOT EXISTS public.center_hours (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_of_week TEXT NOT NULL UNIQUE, -- Sun, Tue, Wed, Thu, Fri, Sat (Mon excluded = holiday)
  open_time   TIME NOT NULL,
  close_time  TIME NOT NULL,
  is_closed   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.center_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ch_read"   ON public.center_hours FOR SELECT TO authenticated USING (true);
CREATE POLICY "ch_insert" ON public.center_hours FOR INSERT TO authenticated WITH CHECK (my_role() = 'superadmin');
CREATE POLICY "ch_update" ON public.center_hours FOR UPDATE TO authenticated USING (my_role() = 'superadmin');
CREATE POLICY "ch_delete" ON public.center_hours FOR DELETE TO authenticated USING (my_role() = 'superadmin');

-- Seed default hours
INSERT INTO public.center_hours (day_of_week, open_time, close_time, is_closed) VALUES
  ('Sun', '10:00', '20:00', FALSE),
  ('Tue', '15:00', '20:00', FALSE),
  ('Wed', '15:00', '20:00', FALSE),
  ('Thu', '15:00', '20:00', FALSE),
  ('Fri', '15:00', '20:00', FALSE),
  ('Sat', '10:00', '20:00', FALSE)
ON CONFLICT (day_of_week) DO NOTHING;
