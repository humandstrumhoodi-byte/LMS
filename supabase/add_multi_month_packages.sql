-- ================================================================
-- Add 3-month and 6-month packages for all subjects
-- 3 months = 10% discount, 6 months = 15% discount
-- ================================================================

DO $$
DECLARE
  sub RECORD;
  grade TEXT;
  grades TEXT[] := ARRAY['Beginner–Grade 2','Grade 3–5','Grade 6–8'];
  -- Base monthly prices [grade_index][classes_pm]: 4/mo and 8/mo
  base_prices INTEGER[][] := ARRAY[
    ARRAY[2200, 3700],   -- Beginner–Grade 2
    ARRAY[2600, 4500],   -- Grade 3–5
    ARRAY[3000, 5200]    -- Grade 6–8
  ];
  gi INTEGER;
  base4 INTEGER; base8 INTEGER;
  price3_4 INTEGER; price3_8 INTEGER;
  price6_4 INTEGER; price6_8 INTEGER;
BEGIN
  FOR sub IN SELECT id, name FROM public.subjects LOOP
    gi := 1;
    FOREACH grade IN ARRAY grades LOOP
      base4 := base_prices[gi][1];
      base8 := base_prices[gi][2];

      -- 3-month totals (10% off monthly × 3)
      price3_4 := ROUND(base4 * 3 * 0.90);
      price3_8 := ROUND(base8 * 3 * 0.90);

      -- 6-month totals (15% off monthly × 6)
      price6_4 := ROUND(base4 * 6 * 0.85);
      price6_8 := ROUND(base8 * 6 * 0.85);

      -- 3 months · 4 classes/mo
      INSERT INTO public.subject_packages
        (subject_id, name, classes_pm, grade_level, price, duration_min, description, months)
      VALUES (
        sub.id, '4 Classes / Month · 3 Months', 4, grade, price3_4, 45,
        sub.name || ' · ' || grade || ' · 1 class/week · 3 months (10% off)',
        3
      ) ON CONFLICT DO NOTHING;

      -- 3 months · 8 classes/mo
      INSERT INTO public.subject_packages
        (subject_id, name, classes_pm, grade_level, price, duration_min, description, months)
      VALUES (
        sub.id, '8 Classes / Month · 3 Months', 8, grade, price3_8, 45,
        sub.name || ' · ' || grade || ' · 2 classes/week · 3 months (10% off)',
        3
      ) ON CONFLICT DO NOTHING;

      -- 6 months · 4 classes/mo
      INSERT INTO public.subject_packages
        (subject_id, name, classes_pm, grade_level, price, duration_min, description, months)
      VALUES (
        sub.id, '4 Classes / Month · 6 Months', 4, grade, price6_4, 45,
        sub.name || ' · ' || grade || ' · 1 class/week · 6 months (15% off)',
        6
      ) ON CONFLICT DO NOTHING;

      -- 6 months · 8 classes/mo
      INSERT INTO public.subject_packages
        (subject_id, name, classes_pm, grade_level, price, duration_min, description, months)
      VALUES (
        sub.id, '8 Classes / Month · 6 Months', 8, grade, price6_8, 45,
        sub.name || ' · ' || grade || ' · 2 classes/week · 6 months (15% off)',
        6
      ) ON CONFLICT DO NOTHING;

      gi := gi + 1;
    END LOOP;
  END LOOP;
END $$;

-- Add months column if it doesn't exist yet
ALTER TABLE public.subject_packages
  ADD COLUMN IF NOT EXISTS months INTEGER DEFAULT 1;

-- Update existing 1-month packages to have months=1
UPDATE public.subject_packages SET months = 1 WHERE months IS NULL;

-- Verify — show all packages grouped by subject + grade + months
SELECT
  s.name as subject,
  p.grade_level,
  p.months,
  p.classes_pm,
  p.name as package_name,
  p.price,
  ROUND(p.price::numeric / p.months, 0) as per_month,
  ROUND((1 - (p.price::numeric / p.months) / CASE p.grade_level
    WHEN 'Beginner–Grade 2' THEN CASE p.classes_pm WHEN 4 THEN 2200 ELSE 3700 END
    WHEN 'Grade 3–5'        THEN CASE p.classes_pm WHEN 4 THEN 2600 ELSE 4500 END
    WHEN 'Grade 6–8'        THEN CASE p.classes_pm WHEN 4 THEN 3000 ELSE 5200 END
  END) * 100, 1) as discount_pct
FROM public.subject_packages p
JOIN public.subjects s ON s.id = p.subject_id
WHERE s.name = 'Guitar'  -- preview one subject
ORDER BY p.grade_level, p.months, p.classes_pm;
