import { NextRequest, NextResponse } from 'next/server'
import { serverSB } from '@/lib/server'

// Uses Resend for email delivery (free tier: 100 emails/day)
// Sign up at resend.com and add RESEND_API_KEY to your Vercel env vars
// If no API key, emails are logged to console (dev mode)

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log(`[EMAIL - no RESEND_API_KEY] To: ${to} | Subject: ${subject}`)
    return { ok: true, dev: true }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Hum & Strum Academy <noreply@humandstrum.com>',
      to: [to],
      subject,
      html,
    }),
  })
  return res.ok ? { ok: true } : { ok: false, error: await res.text() }
}

export async function POST(req: NextRequest) {
  const s = await serverSB()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { type, scheduleId, studentIds, teacherIds, customMessage } = body

  if (type === 'class_reminder') {
    // Fetch schedule details
    const { data: cls } = await s
      .from('class_schedules')
      .select('*, subjects(name, code)')
      .eq('id', scheduleId)
      .single()
    if (!cls) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })

    const subjectName = cls.subjects?.name || 'your class'
    const classTime = `${cls.day_of_week} at ${cls.start_time?.slice(0, 5)}`
    let sent = 0, failed = 0

    // Email students
    if (studentIds?.length) {
      const { data: students } = await s.from('students').select('full_name, email').in('id', studentIds)
      for (const stu of students || []) {
        if (!stu.email) continue
        const html = `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
            <div style="background:#3B1F8C;padding:24px;border-radius:12px 12px 0 0">
              <h2 style="color:white;margin:0">🎵 Class Reminder</h2>
              <p style="color:rgba(255,255,255,0.8);margin:6px 0 0">Hum & Strum Music Academy</p>
            </div>
            <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
              <p style="color:#374151">Hi <strong>${stu.full_name}</strong>,</p>
              <p style="color:#374151">This is a reminder for your upcoming <strong>${subjectName}</strong> class.</p>
              <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                  <span style="color:#6b7280">Subject</span>
                  <strong>${subjectName}</strong>
                </div>
                <div style="display:flex;justify-content:space-between">
                  <span style="color:#6b7280">When</span>
                  <strong>${classTime} · ${cls.duration_minutes} minutes</strong>
                </div>
              </div>
              ${customMessage ? `<p style="color:#374151;font-style:italic">${customMessage}</p>` : ''}
              <p style="color:#374151">See you there! 🎶</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
              <p style="color:#9ca3af;font-size:12px">Hum & Strum Music Academy, Hoodi, Bengaluru</p>
            </div>
          </div>`
        const r = await sendEmail(stu.email, `Reminder: ${subjectName} class — ${classTime}`, html)
        r.ok ? sent++ : failed++
      }
    }

    // Email teachers
    if (teacherIds?.length) {
      const { data: teachers } = await s.from('profiles').select('full_name, email').in('id', teacherIds)
      for (const t of teachers || []) {
        if (!t.email) continue
        const html = `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
            <div style="background:#3B1F8C;padding:24px;border-radius:12px 12px 0 0">
              <h2 style="color:white;margin:0">📅 Teaching Reminder</h2>
              <p style="color:rgba(255,255,255,0.8);margin:6px 0 0">Hum & Strum Music Academy</p>
            </div>
            <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
              <p style="color:#374151">Hi <strong>${t.full_name}</strong>,</p>
              <p style="color:#374151">You have a <strong>${subjectName}</strong> class coming up.</p>
              <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                  <span style="color:#6b7280">Subject</span><strong>${subjectName}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                  <span style="color:#6b7280">When</span><strong>${classTime} · ${cls.duration_minutes}min</strong>
                </div>
                <div style="display:flex;justify-content:space-between">
                  <span style="color:#6b7280">Students enrolled</span><strong>${studentIds?.length || 0}</strong>
                </div>
              </div>
              ${customMessage ? `<p style="color:#374151;font-style:italic">${customMessage}</p>` : ''}
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
              <p style="color:#9ca3af;font-size:12px">Hum & Strum Music Academy, Hoodi, Bengaluru</p>
            </div>
          </div>`
        const r = await sendEmail(t.email, `Teaching Reminder: ${subjectName} — ${classTime}`, html)
        r.ok ? sent++ : failed++
      }
    }
    return NextResponse.json({ ok: true, sent, failed })
  }

  if (type === 'payment_reminder') {
    const { studentEmail, studentName, amount, subjectName, month } = body
    if (!studentEmail) return NextResponse.json({ error: 'No email' }, { status: 400 })
    const html = `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <div style="background:#b45309;padding:24px;border-radius:12px 12px 0 0">
          <h2 style="color:white;margin:0">💰 Payment Reminder</h2>
          <p style="color:rgba(255,255,255,0.8);margin:6px 0 0">Hum & Strum Music Academy</p>
        </div>
        <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
          <p style="color:#374151">Hi <strong>${studentName}</strong>,</p>
          <p style="color:#374151">This is a friendly reminder that your fee payment is due.</p>
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <span style="color:#92400e">Subject</span><strong>${subjectName}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <span style="color:#92400e">Month</span><strong>${month}</strong>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:#92400e">Amount Due</span><strong style="color:#b45309">₹${amount?.toLocaleString('en-IN')}</strong>
            </div>
          </div>
          <p style="color:#374151">Please make the payment at the earliest to avoid any disruption to your classes.</p>
          <p style="color:#374151">For any queries, contact us at <a href="mailto:humandstrumhoodi@gmail.com">humandstrumhoodi@gmail.com</a></p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
          <p style="color:#9ca3af;font-size:12px">Hum & Strum Music Academy, Hoodi, Bengaluru</p>
        </div>
      </div>`
    const r = await sendEmail(studentEmail, `Fee Payment Due — ${subjectName} (${month})`, html)
    return NextResponse.json(r)
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}
