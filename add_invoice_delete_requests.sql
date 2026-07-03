-- ================================================================
-- INVOICE DELETE REQUESTS — center managers request deletion of a
-- payment/invoice raised by mistake; only superadmin can approve.
-- Approval performs the actual delete (via service role in the API route).
-- ================================================================

CREATE TABLE IF NOT EXISTS public.invoice_delete_requests (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id       UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  student_id       UUID REFERENCES public.students(id) ON DELETE CASCADE,
  requested_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_by_name TEXT,             -- denormalized snapshot
  reason           TEXT,
  invoice_snapshot JSONB,             -- copy of the payment row at request time (survives the delete)
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  review_note      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idr_payment ON public.invoice_delete_requests(payment_id);
CREATE INDEX IF NOT EXISTS idx_idr_student ON public.invoice_delete_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_idr_status  ON public.invoice_delete_requests(status);

ALTER TABLE public.invoice_delete_requests ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can read (center managers need to see the status of their own requests)
CREATE POLICY "idr_read"   ON public.invoice_delete_requests FOR SELECT TO authenticated USING (true);
-- Center managers & superadmin can raise a request
CREATE POLICY "idr_insert" ON public.invoice_delete_requests FOR INSERT TO authenticated
  WITH CHECK (my_role() IN ('superadmin','center_manager'));
-- Only superadmin can update (approve/reject) a request — enforced at DB level too,
-- not just in the API route
CREATE POLICY "idr_update" ON public.invoice_delete_requests FOR UPDATE TO authenticated
  USING (my_role() = 'superadmin');
