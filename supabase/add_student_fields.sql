-- ================================================================
-- Run this in Supabase SQL Editor BEFORE importing students
-- Adds extra columns to handle the Hum & Strum export format
-- ================================================================
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS student_id_ext  TEXT,
  ADD COLUMN IF NOT EXISTS guardian_name   TEXT,
  ADD COLUMN IF NOT EXISTS guardian_phone  TEXT,
  ADD COLUMN IF NOT EXISTS guardian_email  TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth   DATE,
  ADD COLUMN IF NOT EXISTS age             INTEGER,
  ADD COLUMN IF NOT EXISTS gender          TEXT,
  ADD COLUMN IF NOT EXISTS nationality     TEXT,
  ADD COLUMN IF NOT EXISTS city            TEXT,
  ADD COLUMN IF NOT EXISTS area            TEXT,
  ADD COLUMN IF NOT EXISTS referral_source TEXT,
  ADD COLUMN IF NOT EXISTS discipline      TEXT,
  ADD COLUMN IF NOT EXISTS signup_source   TEXT,
  ADD COLUMN IF NOT EXISTS batch           TEXT;
