// Admin-facing reschedule approval API (center_manager / superadmin only)
import { NextRequest, NextResponse } from 'next/server'
import { serverSB, serviceSB } from '@/lib/server'
import nodemailer from 'nodemailer'

async function checkAuth() {
  const s = await serverSB()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return null
  const { data: profile } = await s.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['superadmin', 'center_manager'].includes(profile.role)) return null
  return user
}

function mailer() {
  const u = process.env.GMAIL_USER, p = process.env.GMAIL_APP_PASSWORD
  if (!u || !p) return null
  return nodemailer.createTransport({ service: 'gmail', auth: { user: u, pass: p } })
}

export async function POST(req: NextRequest) {
  const user = await checkAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = await serviceSB()
  const body = await req.json()
  const { request_id, action, review_note } = body // action: 'approve' | 'reject'

  if (!request_id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'request_id and valid action required' }, { status: 400 })
  }

  const { data: rr } = await svc
    .from('reschedule_requests')
    .select('*, students(full_name, email), subjects(name)')
    .eq('id', request_id)
    .single()

  if (!rr) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (rr.status !== 'pending') return NextResponse.json({ error: 'Request already reviewed' }, { status: 409 })

  if (action === 'approve') {
    // Re-check slot is still free
    const { data: blocked } = await svc.from('blocked_slots').select('id').eq('day_of_week', rr.requested_day).eq('start_time', rr.requested_time).maybeSingle()
    if (blocked) return NextResponse.json({ error: 'This slot has since been blocked. Cannot approve.' }, { status: 409 })

    if (rr.schedule_id) {
      // Update the existing class schedule to the new day/time
      await svc.from('class_schedules').update({ day_of_week: rr.requested_day, start_time: rr.requested_time }).eq('id', rr.schedule_id)
    }
  }

  await svc.from('reschedule_requests').update({
    status: action === 'approve' ? 'approved' : 'rejected',
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    review_note: review_note || null,
  }).eq('id', request_id)

  // Notify student
  const student = (rr as any).students
  const subject = (rr as any).subjects
  if (student?.email) {
    const t = mailer()
    const approved = action === 'approve'
    const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <div style="background:${approved ? '#059669' : '#dc2626'};padding:18px 22px;border-radius:10px 10px 0 0">
        <div style="color:white;font-weight:700;font-size:16px">${approved ? '✅ Reschedule Approved' : '❌ Reschedule Declined'}</div>
      </div>
      <div style="background:white;padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px">
        <p style="color:#374151">Hi ${student.full_name},</p>
        <p style="color:#374151">Your request to reschedule ${subject?.name || 'your class'} has been <strong>${approved ? 'approved' : 'declined'}</strong>.</p>
        <div style="background:#f9fafb;border-radius:8px;padding:12px;margin:12px 0;font-size:13px">
          <div>New time: <strong>${rr.requested_day} ${rr.requested_time?.slice(0,5)}</strong></div>
        </div>
        ${review_note ? `<p style="color:#6b7280;font-size:13px;font-style:italic">"${review_note}"</p>` : ''}
        <p style="color:#9ca3af;font-size:11px;margin-top:16px">Hum &amp; Strum · Hoodi, Bengaluru</p>
      </div>
    </div>`
    if (t) { try { await t.sendMail({ from: `"Hum & Strum" <${process.env.GMAIL_USER}>`, to: student.email, subject: `${approved ? '✅' : '❌'} Reschedule ${approved ? 'Approved' : 'Declined'} — ${subject?.name || 'Class'}`, html }) } catch (e) {} }
  }

  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const user = await checkAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = await serviceSB()
  const { data: requests } = await svc
    .from('reschedule_requests')
    .select('*, students(full_name, email, phone), subjects(name, code, color)')
    .order('created_at', { ascending: false })
  return NextResponse.json({ ok: true, requests: requests || [] })
}
