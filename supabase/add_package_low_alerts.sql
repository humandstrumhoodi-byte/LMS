-- ================================================================
-- PACKAGE-RUNNING-LOW EMAIL ALERTS
--
-- "Auto alerts should be raised 2 classes prior to the registered email
-- ids" — a student/parent should be warned before a package runs out, not
-- just when the renewal is already overdue. The daily cron (/api/cron)
-- checks every active student+subject's current PAID package and, the
-- moment classes-remaining hits exactly 2, emails the registered address
-- (guardian_email if set, else the student's own email).
--
-- This table exists purely to dedupe: without it, the cron would re-send
-- the same "2 classes left" email every day until the student renews,
-- since "remaining == 2" can stay true for more than one day if no class
-- happens in between. One row per (student, subject, cycle) — cycle is
-- identified by the invoice's anchor date, same as collapseInvoices()
-- uses everywhere else in the app.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.package_low_alerts (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id             UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id             UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  cycle_anchor           DATE NOT NULL,
  classes_taken_at_send  INTEGER,
  sent_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, subject_id, cycle_anchor)
);

ALTER TABLE public.package_low_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pla_read" ON public.package_low_alerts;
CREATE POLICY "pla_read" ON public.package_low_alerts FOR SELECT TO authenticated USING (true);

-- No authenticated-write policy — only the service-role cron job writes here.
