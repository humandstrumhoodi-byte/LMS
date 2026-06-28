-- ================================================================
-- STUDENT PORTAL — OTP-based auth using student email
-- Students don't have Supabase auth accounts — we use a simple
-- token system: request OTP → verify → issue a signed session
-- stored in localStorage
-- ================================================================

-- Table to store one-time login tokens for students
CREATE TABLE IF NOT EXISTS public.student_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OTP tokens (6-digit, short-lived)
CREATE TABLE IF NOT EXISTS public.student_otps (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT NOT NULL,
  otp         TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  used        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS — these tables are only accessible via service role (API routes)
ALTER TABLE public.student_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_otps ENABLE ROW LEVEL SECURITY;

-- No public access — all via service role in API routes
-- (no policies needed — service role bypasses RLS)

-- Verify tables created
SELECT 'student_sessions' as table_name, COUNT(*) FROM public.student_sessions
UNION ALL
SELECT 'student_otps', COUNT(*) FROM public.student_otps;
