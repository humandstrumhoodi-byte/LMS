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

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// Next date on/after `fromDateStr` that falls on `dayName`. Used to translate
// the requested day-of-week into a concrete date for the moved-to occurrence,
// anchored to the same week as the occurrence being moved (or the next one, if
// the requested day has already passed within that week).
function nextOccurrenceOnOrAfter(fromDateStr: string, dayName: string): string {
  const targetIdx = DOW.indexOf(dayName)
  const d = new Date(fromDateStr + 'T00:00:00')
  if (targetIdx >= 0) {
    const delta = (targetIdx - d.getDay() + 7) % 7
    d.setDate(d.getDate() + delta)
  }
  return d.toISOString().slice(0, 10)
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
      // Moves ONLY this one occurrence — the recurring class_schedules row (which
      // governs every future week) is deliberately left untouched. A dated
      // exception is recorded instead, so next week's (and every future week's)
      // class stays exactly where it was.
      const exceptionDate: string = rr.requested_date || nextOccurrenceOnOrAfter(new Date().toISOString().slice(0, 10), rr.current_day || rr.requested_day)
      const newDate = nextOccurrenceOnOrAfter(exceptionDate, rr.requested_day)
      const { error: exErr } = await svc.from('class_schedule_exceptions').upsert({
        schedule_id: rr.schedule_id,
        exception_date: exceptionDate,
        new_date: newDate,
        new_time: rr.requested_time,
        reason: rr.reason || null,
        created_by: user.id,
      }, { onConflict: 'schedule_id,exception_date' })
      if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
      // This was a one-time reschedule — mark it used so this enrollment can't request another.
      await svc.from('schedule_students').update({ reschedule_used_at: new Date().toISOString() }).eq('schedule_id', rr.schedule_id).eq('student_id', rr.student_id)
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
