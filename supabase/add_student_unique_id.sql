-- ================================================================
-- STUDENT UNIQUE ID — generate a durable code per student from
-- name + phone, so invoicing/import matching never has to guess.
-- Safe to run multiple times (only fills in students that don't
-- already have a student_id_ext).
-- ================================================================

-- 1. Generate codes for any student missing one, e.g. "ANAN-3210"
--    (first 4 letters of first name + last 4 digits of phone).
--    Collisions (rare, e.g. true twins on the same number) get a
--    numeric suffix so every code stays unique.
WITH base_codes AS (
  SELECT
    id,
    UPPER(LEFT(REGEXP_REPLACE(SPLIT_PART(full_name, ' ', 1), '[^A-Za-z]', '', 'g'), 4)) || '-' ||
    RIGHT(REGEXP_REPLACE(COALESCE(phone, guardian_phone, '0000'), '\D', '', 'g'), 4) AS code
  FROM public.students
  WHERE student_id_ext IS NULL OR TRIM(student_id_ext) = ''
),
numbered AS (
  SELECT id, code,
         ROW_NUMBER() OVER (PARTITION BY code ORDER BY id) AS rn
  FROM base_codes
)
UPDATE public.students s
SET student_id_ext = CASE WHEN n.rn = 1 THEN n.code ELSE n.code || '-' || n.rn END
FROM numbered n
WHERE s.id = n.id;

-- 2. Enforce uniqueness going forward.
CREATE UNIQUE INDEX IF NOT EXISTS students_id_ext_unique
  ON public.students (student_id_ext)
  WHERE student_id_ext IS NOT NULL;

-- 3. Verify — should return 0 rows (no student left without a code).
SELECT id, full_name, phone FROM public.students
WHERE student_id_ext IS NULL OR TRIM(student_id_ext) = '';


-- ================================================================
-- FIX THE OLD DEDUP INDEX — it only compared the FIRST WORD of the
-- name + phone, which is too weak (e.g. two records both starting
-- "Sharma ..." on the same guardian phone would collide). Replace
-- with the FULL normalized name + phone instead.
-- ================================================================
DROP INDEX IF EXISTS public.students_firstname_phone_unique;

CREATE UNIQUE INDEX IF NOT EXISTS students_fullname_phone_unique
  ON public.students (
    LOWER(TRIM(REGEXP_REPLACE(full_name, '\s+', ' ', 'g'))),
    REGEXP_REPLACE(COALESCE(phone, 'NO_PHONE'), '\s', '', 'g')
  );

-- Verify — should return 0 rows.
SELECT LOWER(TRIM(REGEXP_REPLACE(full_name, '\s+', ' ', 'g'))) AS name_norm,
       REGEXP_REPLACE(COALESCE(phone, ''), '\s', '', 'g') AS phone_norm,
       COUNT(*) AS count
FROM public.students
GROUP BY 1, 2
HAVING COUNT(*) > 1;
