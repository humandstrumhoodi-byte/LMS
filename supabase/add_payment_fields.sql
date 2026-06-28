-- ================================================================
-- Run in Supabase SQL Editor to support the Hum & Strum payment
-- and staff import formats
-- ================================================================

-- Extended payments table columns
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS receipt_number   TEXT,
  ADD COLUMN IF NOT EXISTS invoice_number   TEXT,
  ADD COLUMN IF NOT EXISTS mode_of_payment  TEXT DEFAULT 'UPI',
  ADD COLUMN IF NOT EXISTS transaction_id   TEXT,
  ADD COLUMN IF NOT EXISTS recorded_by      TEXT,
  ADD COLUMN IF NOT EXISTS student_name     TEXT,
  ADD COLUMN IF NOT EXISTS student_email    TEXT,
  ADD COLUMN IF NOT EXISTS student_phone    TEXT,
  ADD COLUMN IF NOT EXISTS student_id_ext   TEXT,
  ADD COLUMN IF NOT EXISTS description      TEXT;

-- Staff / profiles extra fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS calendar_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS staff_role       TEXT;

-- Leads table (if not already created)
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leads' AND policyname='leads_read') THEN
    CREATE POLICY "leads_read"   ON public.leads FOR SELECT TO authenticated USING (my_role() IN ('superadmin','center_manager'));
    CREATE POLICY "leads_insert" ON public.leads FOR INSERT TO authenticated WITH CHECK (my_role() IN ('superadmin','center_manager'));
    CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated USING (my_role() IN ('superadmin','center_manager'));
    CREATE POLICY "leads_delete" ON public.leads FOR DELETE TO authenticated USING (my_role() IN ('superadmin','center_manager'));
  END IF;
END $$;
