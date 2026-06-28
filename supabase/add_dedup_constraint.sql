-- ================================================================
-- Unique constraint: phone + first word of name (dedup key)
-- Run in Supabase SQL Editor
-- ================================================================

-- First clean up any existing duplicates (keep oldest)
DELETE FROM public.students
WHERE id NOT IN (
  SELECT DISTINCT ON (
    LOWER(TRIM(SPLIT_PART(full_name, ' ', 1))),
    REGEXP_REPLACE(COALESCE(phone, ''), '\s', '', 'g')
  ) id
  FROM public.students
  ORDER BY
    LOWER(TRIM(SPLIT_PART(full_name, ' ', 1))),
    REGEXP_REPLACE(COALESCE(phone, ''), '\s', '', 'g'),
    created_at ASC
);

-- Add unique index on (first_name_lower, phone_normalized)
CREATE UNIQUE INDEX IF NOT EXISTS students_firstname_phone_unique
  ON public.students (
    LOWER(TRIM(SPLIT_PART(full_name, ' ', 1))),
    REGEXP_REPLACE(COALESCE(phone, 'NO_PHONE'), '\s', '', 'g')
  );

-- Verify
SELECT 
  LOWER(TRIM(SPLIT_PART(full_name, ' ', 1))) as first_name,
  REGEXP_REPLACE(COALESCE(phone, ''), '\s', '', 'g') as phone_clean,
  COUNT(*) as count
FROM public.students
GROUP BY first_name, phone_clean
HAVING COUNT(*) > 1;
-- Should return 0 rows if dedup worked
