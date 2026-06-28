import { NextRequest, NextResponse } from 'next/server'
import { serviceSB } from '@/lib/server'
import nodemailer from 'nodemailer'
import crypto from 'crypto'

function mailer() {
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
}

export async function POST(req: NextRequest) {
  const action = new URL(req.url).searchParams.get('action')
  const svc = await serviceSB()

  if (action === 'request-otp') {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })
    const { data: student } = await svc.from('students').select('id,full_name,email,status').eq('email', email.toLowerCase().trim()).single()
    if (!student) return NextResponse.json({ error: 'No student account found with this email. Please contact the academy.' }, { status: 404 })
    if (student.status === 'Blocked') return NextResponse.json({ error: 'Your account has been blocked. Please contact the academy.' }, { status: 403 })
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    await svc.from('student_otps').delete().eq('email', email.toLowerCase())
    await svc.from('student_otps').insert({ email: email.toLowerCase().trim(), otp, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
    const html = `<div style="font-family:sans-serif;max-width:400px;margin:0 auto"><div style="background:#3B1F8C;padding:20px 24px;border-radius:12px 12px 0 0;text-align:center"><div style="color:white;font-size:20px;font-weight:700">🎵 Hum &amp; Strum</div><div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:4px">Student Portal Login</div></div><div style="background:white;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;text-align:center"><p style="color:#374151;margin:0 0 20px">Hi <strong>${student.full_name}</strong>, your one-time login code is:</p><div style="background:#f0f0ff;border:2px solid #c7d2fe;border-radius:12px;padding:20px;margin:0 auto 20px"><div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#3B1F8C;font-family:monospace">${otp}</div></div><p style="color:#6b7280;font-size:13px;margin:0">Expires in <strong>10 minutes</strong>. Don't share this code.</p></div></div>`
    const t = mailer()
    if (t) { try { await t.sendMail({ from: `"Hum & Strum" <${process.env.GMAIL_USER}>`, to: email, subject: `${otp} — Your Hum & Strum login code`, html }) } catch(e){} }
    else console.log(`[DEV OTP] ${email}: ${otp}`)
    return NextResponse.json({ ok: true, name: student.full_name, dev: !t ? otp : undefined })
  }

  if (action === 'verify-otp') {
    const { email, otp } = await req.json()
    const { data: record } = await svc.from('student_otps').select('*').eq('email', email.toLowerCase().trim()).eq('otp', otp.trim()).eq('used', false).gt('expires_at', new Date().toISOString()).single()
    if (!record) return NextResponse.json({ error: 'Invalid or expired code. Request a new one.' }, { status: 401 })
    await svc.from('student_otps').update({ used: true }).eq('id', record.id)
    const { data: student } = await svc.from('students').select('*, student_subjects(subject_id, subjects(name,code,color))').eq('email', email.toLowerCase().trim()).single()
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    const token = crypto.randomBytes(32).toString('hex')
    await svc.from('student_sessions').insert({ student_id: student.id, token, email: email.toLowerCase().trim(), expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() })
    return NextResponse.json({ ok: true, token, student })
  }

  if (action === 'logout') {
    const { token } = await req.json()
    if (token) await svc.from('student_sessions').delete().eq('token', token)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const token = params.get('token'), action = params.get('action')
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })
  const svc = await serviceSB()
  const { data: session } = await svc.from('student_sessions').select('student_id,email').eq('token', token).gt('expires_at', new Date().toISOString()).single()
  if (!session) return NextResponse.json({ error: 'Invalid or expired session. Please log in again.' }, { status: 401 })

  if (action === 'me') {
    const { data: student } = await svc.from('students').select('*, student_subjects(subject_id, subjects(name,code,color))').eq('id', session.student_id).single()
    return NextResponse.json({ ok: true, student })
  }
  if (action === 'payments') {
    const { data: payments } = await svc.from('payments').select('*, subjects(name,code,color)').eq('student_id', session.student_id).order('payment_date', { ascending: false })
    return NextResponse.json({ ok: true, payments: payments || [] })
  }
  if (action === 'attendance') {
    const { data: attendance } = await svc.from('attendance').select('*, class_schedules(day_of_week,start_time,duration_minutes,subjects(name,code,color))').eq('student_id', session.student_id).eq('type', 'student').order('class_date', { ascending: false }).limit(100)
    return NextResponse.json({ ok: true, attendance: attendance || [] })
  }
  if (action === 'schedule') {
    const { data: schedules } = await svc.from('class_schedules').select('*, subjects(name,code,color), schedule_students!inner(student_id)').eq('schedule_students.student_id', session.student_id).order('day_of_week').order('start_time')
    return NextResponse.json({ ok: true, schedules: schedules || [] })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
