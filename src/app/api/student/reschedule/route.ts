import { NextRequest, NextResponse } from 'next/server'
import { serviceSB } from '@/lib/server'

async function getStudentFromToken(svc: any, token: string) {
  const { data: session } = await svc.from('student_sessions').select('student_id').eq('token', token).gt('expires_at', new Date().toISOString()).single()
  return session?.student_id || null
}

export async function POST(req: NextRequest) {
  const svc = await serviceSB()
  const body = await req.json()
  const { token, schedule_id, requested_day, requested_time, reason } = body
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const studentId = await getStudentFromToken(svc, token)
  if (!studentId) return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 })
  if (!requested_day || !requested_time) return NextResponse.json({ error: 'Day and time are required' }, { status: 400 })

  let currentDay = null, currentSlotTime = null, subjectId = null
  if (schedule_id) {
    const { data: sched } = await svc.from('class_schedules').select('day_of_week, start_time, subject_id').eq('id', schedule_id).single()
    if (sched) { currentDay = sched.day_of_week; currentSlotTime = sched.start_time; subjectId = sched.subject_id }
  }

  if (schedule_id) {
    const { data: existing } = await svc.from('reschedule_requests').select('id').eq('student_id', studentId).eq('schedule_id', schedule_id).eq('status', 'pending').maybeSingle()
    if (existing) return NextResponse.json({ error: 'You already have a pending reschedule request for this class.' }, { status: 409 })
  }

  const { data: blocked } = await svc.from('blocked_slots').select('id, reason').eq('day_of_week', requested_day).eq('start_time', requested_time).maybeSingle()
  if (blocked) return NextResponse.json({ error: `This slot is blocked${blocked.reason ? ': ' + blocked.reason : ''}. Please choose another.` }, { status: 409 })

  const { data: request, error } = await svc.from('reschedule_requests').insert({
    student_id: studentId, schedule_id: schedule_id || null, subject_id: subjectId,
    current_day: currentDay, current_slot_time: currentSlotTime,
    requested_day, requested_time, reason: reason || null, status: 'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  try {
    const { data: admins } = await svc.from('profiles').select('email, full_name').in('role', ['center_manager', 'superadmin'])
    const { data: student } = await svc.from('students').select('full_name').eq('id', studentId).single()
    if (admins?.length) {
      const nodemailer = (await import('nodemailer')).default
      const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD
      if (user && pass) {
        const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
        const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto"><div style="background:#3B1F8C;padding:18px 22px;border-radius:10px 10px 0 0"><div style="color:white;font-weight:700;font-size:16px">🔄 Reschedule Request</div></div><div style="background:white;padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px"><p style="color:#374151">${student?.full_name} has requested to reschedule a class:</p><div style="background:#f9fafb;border-radius:8px;padding:12px;margin:12px 0;font-size:13px"><div>From: <strong>${currentDay || '—'} ${currentSlotTime?.slice(0,5) || ''}</strong></div><div>To: <strong>${requested_day} ${requested_time.slice(0,5)}</strong></div>${reason ? `<div style="margin-top:6px;color:#6b7280">Reason: ${reason}</div>` : ''}</div><p style="color:#6b7280;font-size:12px">Review from the Schedule tab.</p></div></div>`
        for (const admin of admins) {
          if (admin.email) await transporter.sendMail({ from: `"Hum & Strum" <${user}>`, to: admin.email, subject: `🔄 ${student?.full_name} requested a reschedule`, html })
        }
      }
    }
  } catch (e) { console.error('Notify admin failed:', e) }

  return NextResponse.json({ ok: true, request })
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const svc = await serviceSB()
  const studentId = await getStudentFromToken(svc, token)
  if (!studentId) return NextResponse.json({ error: 'Session expired' }, { status: 401 })
  const { data: requests } = await svc.from('reschedule_requests').select('*, subjects(name, code, color)').eq('student_id', studentId).order('created_at', { ascending: false })
  return NextResponse.json({ ok: true, requests: requests || [] })
}
