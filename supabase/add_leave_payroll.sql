-- ================================================================
-- LEAVE TRACKING + GROSS PAYROLL (Phase 2 of the attendance/payroll plan)
-- Paste into Supabase Dashboard → SQL Editor → New Query → Run
-- Depends on: schema.sql (profiles, my_role()), add_biometric_attendance.sql
-- (staff_attendance_daily, staff_holidays)
--
-- Scope: leave types/requests/balances, per-staff salary structure (fixed
-- monthly OR per-class rate), and a gross-pay run + payslip. No PF/ESI/PT/
-- TDS in this phase — see staff-attendance-payroll-plan.md for that scope.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.leave_types (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  code              TEXT NOT NULL UNIQUE,   -- e.g. 'CL','SL','EL','LOP'
  is_paid           BOOLEAN NOT NULL DEFAULT true,  -- false = counts as Loss of Pay when approved
  annual_days       NUMERIC NOT NULL DEFAULT 0,     -- default yearly allotment; 0 for LOP-type
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.leave_types (name, code, is_paid, annual_days) VALUES
  ('Casual Leave', 'CL', true, 12),
  ('Sick Leave', 'SL', true, 6),
  ('Earned Leave', 'EL', true, 12),
  ('Loss of Pay', 'LOP', false, 0)
  ON CONFLICT (code) DO NOTHING;

-- One row per staff per leave type per leave-year (1 Apr–31 Mar, matching
-- the school's financial year used elsewhere in the app). `used_days`
-- accumulates as requests are approved; `balance` is opening+accrued-used,
-- kept as a stored value rather than computed on the fly so a leave-year
-- rollover / manual adjustment can be made explicitly.
CREATE TABLE IF NOT EXISTS public.staff_leave_balances (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type_id     UUID NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  leave_year_start  DATE NOT NULL,          -- e.g. 2026-04-01
  opening_balance   NUMERIC NOT NULL DEFAULT 0,
  used_days         NUMERIC NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, leave_type_id, leave_year_start)
);

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type_id     UUID NOT NULL REFERENCES public.leave_types(id),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  is_half_day       BOOLEAN NOT NULL DEFAULT false,  -- only meaningful when start_date = end_date
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  review_note       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_profile ON public.leave_requests (profile_id, status);

-- Salary structure: fixed monthly, per-class, or both at once (e.g. a base
-- retainer plus a per-class top-up) — pay_run generation reads whichever
-- fields are non-null. One active row per staff at a time.
CREATE TABLE IF NOT EXISTS public.staff_salary_structures (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pay_type          TEXT NOT NULL CHECK (pay_type IN ('monthly','per_class','both')),
  monthly_salary    NUMERIC,               -- gross monthly, pro-rated by payable days
  per_class_rate    NUMERIC,               -- paid per class conducted that pay period
  effective_from    DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_salary_active ON public.staff_salary_structures (profile_id) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.pay_runs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  month_label       TEXT NOT NULL,          -- e.g. "September 2026"
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  generated_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(period_start, period_end)
);

CREATE TABLE IF NOT EXISTS public.payslips (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pay_run_id        UUID NOT NULL REFERENCES public.pay_runs(id) ON DELETE CASCADE,
  profile_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pay_type          TEXT NOT NULL,
  working_days      NUMERIC NOT NULL DEFAULT 0,   -- days the center was open in the period
  present_days      NUMERIC NOT NULL DEFAULT 0,   -- present + half_day(0.5) + paid leave + holiday
  paid_leave_days   NUMERIC NOT NULL DEFAULT 0,
  lop_days          NUMERIC NOT NULL DEFAULT 0,
  classes_taught    NUMERIC NOT NULL DEFAULT 0,   -- per_class staff only
  monthly_component NUMERIC NOT NULL DEFAULT 0,   -- pro-rated monthly salary portion
  per_class_component NUMERIC NOT NULL DEFAULT 0, -- per-class portion
  gross_amount      NUMERIC NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pay_run_id, profile_id)
);

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================
ALTER TABLE public.leave_types             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_leave_balances    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_runs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips                ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_types_read" ON public.leave_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "leave_types_write" ON public.leave_types FOR ALL TO authenticated
  USING (my_role() IN ('superadmin','center_manager'))
  WITH CHECK (my_role() IN ('superadmin','center_manager'));

CREATE POLICY "leave_balances_read" ON public.staff_leave_balances FOR SELECT TO authenticated
  USING (my_role() IN ('superadmin','center_manager') OR profile_id = auth.uid());
CREATE POLICY "leave_balances_write" ON public.staff_leave_balances FOR ALL TO authenticated
  USING (my_role() IN ('superadmin','center_manager'))
  WITH CHECK (my_role() IN ('superadmin','center_manager'));

CREATE POLICY "leave_requests_read" ON public.leave_requests FOR SELECT TO authenticated
  USING (my_role() IN ('superadmin','center_manager') OR profile_id = auth.uid());
CREATE POLICY "leave_requests_insert" ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (my_role() IN ('superadmin','center_manager') OR profile_id = auth.uid());
CREATE POLICY "leave_requests_update" ON public.leave_requests FOR UPDATE TO authenticated
  USING (my_role() IN ('superadmin','center_manager') OR (profile_id = auth.uid() AND status = 'pending'))
  WITH CHECK (my_role() IN ('superadmin','center_manager') OR (profile_id = auth.uid() AND status IN ('pending','cancelled')));

CREATE POLICY "salary_structures_read" ON public.staff_salary_structures FOR SELECT TO authenticated
  USING (my_role() IN ('superadmin','center_manager') OR profile_id = auth.uid());
CREATE POLICY "salary_structures_write" ON public.staff_salary_structures FOR ALL TO authenticated
  USING (my_role() IN ('superadmin','center_manager'))
  WITH CHECK (my_role() IN ('superadmin','center_manager'));

CREATE POLICY "pay_runs_rw" ON public.pay_runs FOR ALL TO authenticated
  USING (my_role() IN ('superadmin','center_manager'))
  WITH CHECK (my_role() IN ('superadmin','center_manager'));

CREATE POLICY "payslips_read" ON public.payslips FOR SELECT TO authenticated
  USING (my_role() IN ('superadmin','center_manager') OR profile_id = auth.uid());
CREATE POLICY "payslips_write" ON public.payslips FOR ALL TO authenticated
  USING (my_role() IN ('superadmin','center_manager'))
  WITH CHECK (my_role() IN ('superadmin','center_manager'));
