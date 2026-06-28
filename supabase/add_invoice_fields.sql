-- ================================================================
-- Add invoice-specific fields to payments table
-- Run in Supabase SQL Editor
-- ================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS discount        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validity_date   TEXT,
  ADD COLUMN IF NOT EXISTS quantity        INTEGER,
  ADD COLUMN IF NOT EXISTS classes_pm      INTEGER,
  ADD COLUMN IF NOT EXISTS months          INTEGER DEFAULT 1;

-- Verify subjects exist that match what's in the CSV
-- If any are missing, add them:
INSERT INTO public.subjects (name, code, color) VALUES
  ('Bharatnatyam', 'BHN', 'rose')
ON CONFLICT DO NOTHING;

-- Check which subjects you have:
SELECT name, code FROM public.subjects ORDER BY name;
