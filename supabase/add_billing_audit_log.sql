-- ================================================================
-- BILLING AUDIT LOG — tracks every edit to historical payment records
-- Visible to superadmin only
-- ================================================================

CREATE TABLE IF NOT EXISTS public.billing_audit_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id   UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  student_id   UUID REFERENCES public.students(id) ON DELETE SET NULL,
  changed_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name TEXT,           -- denormalized snapshot in case the profile is later deleted
  field_changes JSONB NOT NULL,   -- { "amount": {"old": 2200, "new": 2500}, "status": {...} }
  reason       TEXT,              -- optional note typed in the confirmation dialog
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_audit_payment ON public.billing_audit_log(payment_id);
CREATE INDEX IF NOT EXISTS idx_billing_audit_student ON public.billing_audit_log(student_id);

ALTER TABLE public.billing_audit_log ENABLE ROW LEVEL SECURITY;

-- Only superadmin can read the audit log
CREATE POLICY "bal_read" ON public.billing_audit_log FOR SELECT TO authenticated USING (my_role() = 'superadmin');
-- Inserts happen via the app for any role that can edit payments (insert itself doesn't leak old data)
CREATE POLICY "bal_insert" ON public.billing_audit_log FOR INSERT TO authenticated WITH CHECK (my_role() IN ('superadmin','center_manager'));
