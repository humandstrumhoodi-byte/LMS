-- ================================================================
-- ACADEMY LMS — COMPLETE SUPABASE SCHEMA
-- Paste into Supabase Dashboard → SQL Editor → New Query → Run
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- TABLES
-- ================================================================

-- User profiles (mirrors auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  phone       TEXT,
  role        TEXT NOT NULL DEFAULT 'teacher'
                CHECK (role IN ('superadmin','center_manager','teacher')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Students
CREATE TABLE IF NOT EXISTS public.students (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name   TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  joined_date DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Subjects / courses
CREATE TABLE IF NOT EXISTS public.subjects (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  code        TEXT NOT NULL,
  level       TEXT,
  color       TEXT NOT NULL DEFAULT 'violet',
  teacher_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Student ↔ Subject enrolment
CREATE TABLE IF NOT EXISTS public.student_subjects (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, subject_id)
);

-- Class schedules
CREATE TABLE IF NOT EXISTS public.class_schedules (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id       UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  day_of_week      TEXT NOT NULL CHECK (day_of_week IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  start_time       TIME NOT NULL,
  duration_minutes INT  NOT NULL DEFAULT 60,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Students per class session
CREATE TABLE IF NOT EXISTS public.schedule_students (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES public.class_schedules(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES public.students(id)        ON DELETE CASCADE,
  UNIQUE(schedule_id, student_id)
);

-- Fee structure per subject
CREATE TABLE IF NOT EXISTS public.fee_structures (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id  UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  amount      INT  NOT NULL CHECK (amount > 0),
  frequency   TEXT NOT NULL DEFAULT 'Monthly',
  due_day     INT  NOT NULL DEFAULT 5 CHECK (due_day BETWEEN 1 AND 28),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(subject_id)
);

-- Payments
CREATE TABLE IF NOT EXISTS public.payments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  amount        INT  NOT NULL CHECK (amount > 0),
  payment_date  DATE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('paid','pending','overdue')),
  month_label   TEXT NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- HELPER — get calling user's role (used in RLS policies)
-- ================================================================
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_subjects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structures    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments          ENABLE ROW LEVEL SECURITY;

-- ── profiles ──────────────────────────────────────────────────
-- All authenticated users can read all profiles (needed for teacher dropdowns)
CREATE POLICY "profiles_read"   ON public.profiles FOR SELECT TO authenticated USING (true);
-- Only superadmin may update roles; service role handles inserts/deletes via API route
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (my_role() = 'superadmin');

-- ── students ──────────────────────────────────────────────────
CREATE POLICY "students_read"   ON public.students FOR SELECT TO authenticated USING (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "students_insert" ON public.students FOR INSERT TO authenticated WITH CHECK (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "students_update" ON public.students FOR UPDATE TO authenticated USING (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "students_delete" ON public.students FOR DELETE TO authenticated USING (my_role() IN ('superadmin','center_manager'));

-- ── subjects ──────────────────────────────────────────────────
-- All roles can read subjects (teacher needs to filter their own)
CREATE POLICY "subjects_read"   ON public.subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "subjects_insert" ON public.subjects FOR INSERT TO authenticated WITH CHECK (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "subjects_update" ON public.subjects FOR UPDATE TO authenticated USING (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "subjects_delete" ON public.subjects FOR DELETE TO authenticated USING (my_role() IN ('superadmin','center_manager'));

-- ── student_subjects ──────────────────────────────────────────
CREATE POLICY "ss_read"   ON public.student_subjects FOR SELECT TO authenticated USING (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "ss_insert" ON public.student_subjects FOR INSERT TO authenticated WITH CHECK (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "ss_delete" ON public.student_subjects FOR DELETE TO authenticated USING (my_role() IN ('superadmin','center_manager'));

-- ── class_schedules ───────────────────────────────────────────
-- All roles can read (teacher filters by their subject in app code)
CREATE POLICY "sched_read"   ON public.class_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "sched_insert" ON public.class_schedules FOR INSERT TO authenticated WITH CHECK (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "sched_update" ON public.class_schedules FOR UPDATE TO authenticated USING (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "sched_delete" ON public.class_schedules FOR DELETE TO authenticated USING (my_role() IN ('superadmin','center_manager'));

-- ── schedule_students ─────────────────────────────────────────
CREATE POLICY "ss2_read"   ON public.schedule_students FOR SELECT TO authenticated USING (true);
CREATE POLICY "ss2_insert" ON public.schedule_students FOR INSERT TO authenticated WITH CHECK (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "ss2_delete" ON public.schedule_students FOR DELETE TO authenticated USING (my_role() IN ('superadmin','center_manager'));

-- ── fee_structures ────────────────────────────────────────────
CREATE POLICY "fees_read"   ON public.fee_structures FOR SELECT TO authenticated USING (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "fees_insert" ON public.fee_structures FOR INSERT TO authenticated WITH CHECK (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "fees_update" ON public.fee_structures FOR UPDATE TO authenticated USING (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "fees_delete" ON public.fee_structures FOR DELETE TO authenticated USING (my_role() = 'superadmin');

-- ── payments ──────────────────────────────────────────────────
CREATE POLICY "pay_read"   ON public.payments FOR SELECT TO authenticated USING (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "pay_insert" ON public.payments FOR INSERT TO authenticated WITH CHECK (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "pay_update" ON public.payments FOR UPDATE TO authenticated USING (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "pay_delete" ON public.payments FOR DELETE TO authenticated USING (my_role() = 'superadmin');

-- ================================================================
-- TRIGGER — auto-create profile row when a user signs up
-- (the API route also inserts directly; this is a safety net)
-- ================================================================
CREATE OR REPLACE FUNCTION public.on_new_user()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'teacher')
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.on_new_user();

-- ================================================================
-- AFTER RUNNING THIS SCHEMA:
--
-- 1. Go to Authentication → Users → Add User
--    Enter your email + password → Create User
--
-- 2. Run this to promote yourself to superadmin:
--    UPDATE public.profiles
--    SET role = 'superadmin', full_name = 'Your Name'
--    WHERE email = 'your@email.com';
-- ================================================================

-- ================================================================
-- LEADS TABLE (add this if you already ran the original schema)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.leads (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name        TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  source           TEXT,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'New'
                     CHECK (status IN ('New','Contacted','Interested','Trial Scheduled','Converted','Lost')),
  interest_subject TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_read"   ON public.leads FOR SELECT TO authenticated USING (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "leads_insert" ON public.leads FOR INSERT TO authenticated WITH CHECK (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated USING (my_role() IN ('superadmin','center_manager'));
CREATE POLICY "leads_delete" ON public.leads FOR DELETE TO authenticated USING (my_role() IN ('superadmin','center_manager'));
