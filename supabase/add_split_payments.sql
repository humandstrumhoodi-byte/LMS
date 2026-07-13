-- ================================================================
-- SPLIT / INSTALLMENT PAYMENTS
-- Lets one package bill (e.g. ₹6,000 for a 3-month package) be
-- recorded as multiple linked payment rows — e.g. ₹4,000 paid now
-- + ₹2,000 due later, or ₹4,000 cash + ₹2,000 UPI paid together.
-- Each installment is still a normal row in `payments` (so nothing
-- that already reads amount/status/mode_of_payment breaks) — they
-- are just tagged with a shared invoice_group_id so the UI can
-- show them together and track total paid vs. total due.
-- ================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS invoice_group_id   UUID,
  ADD COLUMN IF NOT EXISTS installment_no      INT,
  ADD COLUMN IF NOT EXISTS installment_count   INT,
  ADD COLUMN IF NOT EXISTS total_invoice_amount INT;

CREATE INDEX IF NOT EXISTS idx_payments_invoice_group ON public.payments(invoice_group_id);

-- Verify — should return 0 rows on a fresh run.
SELECT column_name FROM information_schema.columns
WHERE table_name='payments' AND column_name IN
  ('invoice_group_id','installment_no','installment_count','total_invoice_amount');
