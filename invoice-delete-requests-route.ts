// Invoice delete request + approval workflow.
// center_manager (or superadmin) can request deletion of an invoice raised by mistake.
// Only superadmin can approve/reject — approval performs the actual delete.
import { NextRequest, NextResponse } from 'next/server'
import { serverSB, serviceSB } from '@/lib/server'

async function checkAuth() {
  const s = await serverSB()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return null
  const { data: profile } = await s.from('profiles').select('id, full_name, role').eq('id', user.id).single()
  if (!profile || !['superadmin', 'center_manager'].includes(profile.role)) return null
  return profile
}

// List requests. Optional ?student_id= / ?status= filters.
export async function GET(req: NextRequest) {
  const profile = await checkAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = await serviceSB()
  const studentId = req.nextUrl.searchParams.get('student_id')
  const status = req.nextUrl.searchParams.get('status')

  let q = svc.from('invoice_delete_requests')
    .select('*, payments(invoice_number, receipt_number, amount, status, payment_date, month_label), students(full_name, email)')
    .order('created_at', { ascending: false })
  if (studentId) q = q.eq('student_id', studentId)
  if (status) q = q.eq('status', status)

  const { data: requests, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, requests: requests || [] })
}

// Create a new delete request (center_manager or superadmin).
export async function POST(req: NextRequest) {
  const profile = await checkAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = await serviceSB()
  const { payment_id, reason } = await req.json()
  if (!payment_id) return NextResponse.json({ error: 'payment_id required' }, { status: 400 })

  // Block duplicate pending requests for the same invoice
  const { data: existing } = await svc.from('invoice_delete_requests')
    .select('id').eq('payment_id', payment_id).eq('status', 'pending').maybeSingle()
  if (existing) return NextResponse.json({ error: 'A delete request for this invoice is already pending approval.' }, { status: 409 })

  const { data: payment } = await svc.from('payments').select('*').eq('id', payment_id).single()
  if (!payment) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const { data: reqRow, error } = await svc.from('invoice_delete_requests').insert({
    payment_id,
    student_id: payment.student_id,
    requested_by: profile.id,
    requested_by_name: profile.full_name,
    reason: reason || null,
    invoice_snapshot: payment,
    status: 'pending',
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, request: reqRow })
}

// Approve or reject a request. Superadmin only — approval deletes the invoice.
export async function PATCH(req: NextRequest) {
  const profile = await checkAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'superadmin') return NextResponse.json({ error: 'Only superadmin can approve or reject delete requests' }, { status: 403 })

  const svc = await serviceSB()
  const { request_id, action, review_note } = await req.json() // action: 'approve' | 'reject'
  if (!request_id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'request_id and valid action required' }, { status: 400 })
  }

  const { data: reqRow } = await svc.from('invoice_delete_requests').select('*').eq('id', request_id).single()
  if (!reqRow) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (reqRow.status !== 'pending') return NextResponse.json({ error: 'Request already reviewed' }, { status: 409 })

  if (action === 'approve') {
    const { error: delErr } = await svc.from('payments').delete().eq('id', reqRow.payment_id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    await svc.from('billing_audit_log').insert({
      payment_id: null, // the payment row is gone; snapshot lives on the request itself
      student_id: reqRow.student_id,
      changed_by: profile.id,
      changed_by_name: profile.full_name,
      field_changes: { deleted: { old: reqRow.invoice_snapshot, new: null } },
      reason: `Invoice deleted (approved delete request${reqRow.reason ? ': ' + reqRow.reason : ''})`,
    })
  }

  await svc.from('invoice_delete_requests').update({
    status: action === 'approve' ? 'approved' : 'rejected',
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
    review_note: review_note || null,
  }).eq('id', request_id)

  return NextResponse.json({ ok: true })
}
