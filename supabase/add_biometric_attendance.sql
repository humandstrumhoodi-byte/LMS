-- ================================================================
-- STAFF BIOMETRIC ATTENDANCE (ZKTeco K40 Pro / ADMS push protocol)
-- Paste into Supabase Dashboard → SQL Editor → New Query → Run
-- Depends on: schema.sql (profiles, my_role())
-- ================================================================

-- Map a staff member (profiles row) to the enrollment ID/PIN set on the
-- biometric device(s). ZKTeco PINs are numeric-ish strings, unique per
-- device but we treat them as globally unique here since this school runs
-- a single device — revisit if a second device with overlapping PINs is
-- ever added.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS biometric_id TEXT UNIQUE;

-- One row per physical device. SN is what the device sends on every
-- request (?SN=...) — used to gate which devices we accept punches from,
-- since the ADMS protocol itself has no authentication.
CREATE TABLE IF NOT EXISTS public.biometric_devices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  serial_number   TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  location        TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_seen_at    TIMESTAMPTZ,
  last_ip         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Raw punches exactly as received from the device. Never mutated after
-- insert — the daily rollup below is derived from this table, so if the
-- rollup logic changes we can always recompute from source.
CREATE TABLE IF NOT EXISTS public.attendance_punches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_serial   TEXT NOT NULL,
  biometric_id    TEXT NOT NULL,          -- raw PIN from device (may not match any profile yet)
  profile_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  punch_time      TIMESTAMPTZ NOT NULL,
  device_status   TEXT,                    -- raw "Status" field from device (0/1/2/3/4/5) — unreliable, we compute in/out ourselves
  verify_mode     TEXT,                    -- raw "VerifyMode" field (1=fingerprint, 15=face, 4=card, ...)
  raw_line        TEXT NOT NULL,            -- original tab-separated line, for debugging/replay
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(device_serial, biometric_id, punch_time)
);
CREATE INDEX IF NOT EXISTS idx_punches_profile_date
  ON public.attendance_punches (profile_id, punch_time);
CREATE INDEX IF NOT EXISTS idx_punches_unmatched
  ON public.attendance_punches (biometric_id) WHERE profile_id IS NULL;

-- One row per staff member per calendar day — the derived, payroll-facing
-- attendance record. Built nightly by /api/attendance/rollup from the raw
-- punches above; can be manually overridden by an admin.
CREATE TABLE IF NOT EXISTS public.staff_attendance_daily (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  work_date         DATE NOT NULL,
  first_punch       TIMESTAMPTZ,
  last_punch        TIMESTAMPTZ,
  punch_count       INT NOT NULL DEFAULT 0,
  total_minutes     INT NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'absent'
                      CHECK (status IN ('present','half_day','absent','on_leave','holiday','week_off')),
  is_late           BOOLEAN NOT NULL DEFAULT false,
  needs_review      BOOLEAN NOT NULL DEFAULT false,
  review_reason     TEXT,                  -- e.g. 'single_punch', 'no_punch', 'short_duration'
  is_manual_override BOOLEAN NOT NULL DEFAULT false,
  override_reason   TEXT,
  overridden_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_review ON public.staff_attendance_daily (needs_review) WHERE needs_review = true;

-- Shift expectations used by the rollup to decide late / half-day / present.
-- A NULL profile_id row is the default rule applied to everyone without a
-- more specific one.
CREATE TABLE IF NOT EXISTS public.attendance_shift_rules (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id            UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  expected_in           TIME NOT NULL DEFAULT '09:30',
  grace_minutes         INT  NOT NULL DEFAULT 15,
  half_day_minutes      INT  NOT NULL DEFAULT 240,   -- >= this many minutes present counts as half day
  full_day_minutes      INT  NOT NULL DEFAULT 420,   -- >= this many minutes present counts as full day
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id)
);
INSERT INTO public.attendance_shift_rules (profile_id, expected_in, grace_minutes, half_day_minutes, full_day_minutes)
  VALUES (NULL, '09:30', 15, 240, 420)
  ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.staff_holidays (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  holiday_date  DATE NOT NULL UNIQUE,
  name          TEXT NOT NULL
);

-- ================================================================
-- ROW LEVEL SECURITY
-- Webhook/rollup/import routes all use the service-role client
-- (serviceSB()), which bypasses RLS — these policies only govern access
-- from logged-in browser sessions (the admin UI).
-- ================================================================
ALTER TABLE public.biometric_devices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_punches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_shift_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_holidays         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "devices_rw" ON public.biometric_devices FOR ALL TO authenticated
  USING (my_role() IN ('superadmin','center_manager'))
  WITH CHECK (my_role() IN ('superadmin','center_manager'));

CREATE POLICY "punches_read" ON public.attendance_punches FOR SELECT TO authenticated
  USING (my_role() IN ('superadmin','center_manager') OR profile_id = auth.uid());

CREATE POLICY "daily_read" ON public.staff_attendance_daily FOR SELECT TO authenticated
  USING (my_role() IN ('superadmin','center_manager') OR profile_id = auth.uid());
CREATE POLICY "daily_write" ON public.staff_attendance_daily FOR UPDATE TO authenticated
  USING (my_role() IN ('superadmin','center_manager'))
  WITH CHECK (my_role() IN ('superadmin','center_manager'));

CREATE POLICY "shift_rules_rw" ON public.attendance_shift_rules FOR ALL TO authenticated
  USING (my_role() IN ('superadmin','center_manager'))
  WITH CHECK (my_role() IN ('superadmin','center_manager'));

CREATE POLICY "holidays_read" ON public.staff_holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "holidays_write" ON public.staff_holidays FOR ALL TO authenticated
  USING (my_role() IN ('superadmin','center_manager'))
  WITH CHECK (my_role() IN ('superadmin','center_manager'));
