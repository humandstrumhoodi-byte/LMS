ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS medical_conditions     TEXT,
  ADD COLUMN IF NOT EXISTS allergies              TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS enrollment_date        DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS notes                  TEXT;
