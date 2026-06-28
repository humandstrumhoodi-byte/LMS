// Vercel Cron Job — runs daily at 7am IST (1:30am UTC)
// Emails teachers their schedule AND students their class reminder
// Configure vercel.json: { "crons": [{ "path": "/api/cron", "schedule": "30 1 * * *" }] }
import { NextRequest, NextResponse } from 'next/server'
import { serviceSB } from '@/lib/server'
import nodemailer from 'nodemailer'

export const dynamic = 'force-dynamic'

function createTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
}

async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const transporter = createTransporter()
  if (!transporter) {
    console.log(`[CRON - no Gmail] To: ${to} | ${subject}`)
    return true // count as sent in dev
  }
  try {
    const from = `"Hum & Strum" <${process.env.GMAIL_USER}>`
    await transporter.sendMail({ from, to, subject, html })
    return true
  } catch (e: any) {
    console.error(`[CRON EMAIL ERROR] ${to}:`, e.message)
    return false
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || 'hum-strum-cron-2024'
  if (authHeader !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = await serviceSB()
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const today = new Date()
  const todayDay = days[today.getDay()]
  const todayStr = today.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })

  // Fetch all classes for today with students + their guardian info
  const { data: classes } = await svc
    .from('class_schedules')
    .select(`
      *,
      subjects(name, code, teacher_id),
      schedule_students(
        student_id,
        students(full_name, email, phone, guardian_name, guardian_email, guardian_phone)
      )
    `)
    .eq('day_of_week', todayDay)
    .order('start_time')

  if (!classes?.length) {
    return NextResponse.json({ ok: true, sent: 0, message: `No classes on ${todayDay}` })
  }

  let teacherSent = 0, studentSent = 0, failed = 0

  for (const cls of classes) {
    const subject = (cls as any).subjects
    if (!subject) continue

    const timeStr = (cls.start_time as string)?.slice(0, 5)
    const duration = cls.duration_minutes
    const students = ((cls as any).schedule_students || [])
      .map((ss: any) => ss.students)
      .filter(Boolean)

    // ── TEACHER EMAIL ─────────────────────────────────────────
    if (subject.teacher_id) {
      const { data: teacher } = await svc
        .from('profiles')
        .select('full_name, email')
        .eq('id', subject.teacher_id)
        .single()

      if (teacher?.email) {
        const teacherHtml = `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
            <div style="background:#3B1F8C;padding:20px 24px;border-radius:12px 12px 0 0">
              <div style="color:white;font-size:18px;font-weight:700">📅 Today's Teaching Schedule</div>
              <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:3px">Hum &amp; Strum · ${todayStr}</div>
            </div>
            <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
              <p style="color:#374151;margin:0 0 16px">Hi <strong>${teacher.full_name}</strong>, here's your class for today:</p>
              <div style="background:#f3f4f6;border-radius:10px;padding:16px;margin-bottom:16px">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                  <span style="color:#6b7280;font-size:13px">Subject</span>
                  <strong style="font-size:13px">${subject.name}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                  <span style="color:#6b7280;font-size:13px">Time</span>
                  <strong style="font-size:13px">${timeStr} · ${duration} min</strong>
                </div>
                <div style="display:flex;justify-content:space-between">
                  <span style="color:#6b7280;font-size:13px">Students</span>
                  <strong style="font-size:13px">${students.length} enrolled</strong>
                </div>
              </div>
              ${students.length ? `
              <div style="margin-bottom:16px">
                <div style="font-size:12px;color:#6b7280;font-weight:600;margin-bottom:8px">STUDENT LIST</div>
                <table style="width:100%;border-collapse:collapse;font-size:13px">
                  ${students.map((s: any) => `
                  <tr style="border-bottom:1px solid #f3f4f6">
                    <td style="padding:6px 0;color:#111827;font-weight:500">${s.full_name}</td>
                    <td style="padding:6px 0;color:#6b7280;text-align:right">${s.phone || ''}</td>
                  </tr>`).join('')}
                </table>
              </div>` : ''}
              <div style="border-top:1px solid #f3f4f6;padding-top:12px;font-size:11px;color:#9ca3af;text-align:center">
                Hum &amp; Strum · Hoodi, Bengaluru · +91 97312 70069
              </div>
            </div>
          </div>`

        const ok = await sendMail(
          teacher.email,
          `📅 Today: ${subject.name} at ${timeStr} — ${students.length} student${students.length !== 1 ? 's' : ''}`,
          teacherHtml
        )
        if (ok) teacherSent++; else failed++
      }
    }

    // ── STUDENT EMAILS ────────────────────────────────────────
    for (const stu of students) {
      if (!stu.email) continue

      // Determine recipient — use guardian email for young students if available
      const recipientEmail = stu.email
      const recipientName = stu.full_name

      const studentHtml = `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
          <div style="background:#3B1F8C;padding:20px 24px;border-radius:12px 12px 0 0">
            <div style="color:white;font-size:18px;font-weight:700">🎵 Class Reminder</div>
            <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:3px">Hum &amp; Strum · ${todayStr}</div>
          </div>
          <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <p style="color:#374151;margin:0 0 16px">Hi <strong>${recipientName}</strong> 👋</p>
            <p style="color:#374151;margin:0 0 16px">
              Just a reminder that you have a <strong>${subject.name}</strong> class today!
            </p>
            <div style="background:#f0f0ff;border:1px solid #c7d2fe;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center">
              <div style="font-size:28px;margin-bottom:8px">🎸</div>
              <div style="font-size:22px;font-weight:700;color:#3B1F8C">${subject.name}</div>
              <div style="font-size:28px;font-weight:800;color:#3B1F8C;margin:8px 0">${timeStr}</div>
              <div style="font-size:13px;color:#6b7280">${duration} minutes · ${todayStr}</div>
            </div>
            <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#92400e">
              📍 <strong>Location:</strong> Hum &amp; Strum Music Academy, Hoodi, Bengaluru
            </div>
            <p style="color:#6b7280;font-size:13px;margin:0">
              If you can't make it today, please inform us as soon as possible.<br/>
              See you in class! 🎵
            </p>
            <div style="border-top:1px solid #f3f4f6;margin-top:20px;padding-top:12px;font-size:11px;color:#9ca3af;text-align:center">
              Hum &amp; Strum · Hoodi, Bengaluru · +91 97312 70069
            </div>
          </div>
        </div>`

      const ok = await sendMail(
        recipientEmail,
        `🎵 Reminder: ${subject.name} class today at ${timeStr}`,
        studentHtml
      )
      if (ok) studentSent++; else failed++

      // Also email guardian if different email exists
      if (stu.guardian_email && stu.guardian_email !== stu.email) {
        const guardianHtml = `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
            <div style="background:#3B1F8C;padding:20px 24px;border-radius:12px 12px 0 0">
              <div style="color:white;font-size:18px;font-weight:700">🎵 Class Reminder</div>
              <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:3px">Hum &amp; Strum · ${todayStr}</div>
            </div>
            <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
              <p style="color:#374151;margin:0 0 16px">Hi <strong>${stu.guardian_name || 'Parent/Guardian'}</strong>,</p>
              <p style="color:#374151;margin:0 0 16px">
                This is a reminder that <strong>${stu.full_name}</strong> has a 
                <strong>${subject.name}</strong> class today.
              </p>
              <div style="background:#f0f0ff;border:1px solid #c7d2fe;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center">
                <div style="font-size:22px;font-weight:700;color:#3B1F8C">${subject.name}</div>
                <div style="font-size:28px;font-weight:800;color:#3B1F8C;margin:8px 0">${timeStr}</div>
                <div style="font-size:13px;color:#6b7280">${duration} minutes · ${todayStr}</div>
              </div>
              <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#92400e">
                📍 <strong>Location:</strong> Hum &amp; Strum Music Academy, Hoodi, Bengaluru
              </div>
              <p style="color:#6b7280;font-size:13px;margin:0">
                Please ensure ${stu.full_name} is on time. If they can't attend today, 
                kindly inform us in advance.
              </p>
              <div style="border-top:1px solid #f3f4f6;margin-top:20px;padding-top:12px;font-size:11px;color:#9ca3af;text-align:center">
                Hum &amp; Strum · Hoodi, Bengaluru · +91 97312 70069
              </div>
            </div>
          </div>`

        const gOk = await sendMail(
          stu.guardian_email,
          `🎵 Reminder: ${stu.full_name}'s ${subject.name} class today at ${timeStr}`,
          guardianHtml
        )
        if (gOk) studentSent++; else failed++
      }
    }
  }

  return NextResponse.json({
    ok: true,
    teacher_emails: teacherSent,
    student_emails: studentSent,
    failed,
    day: todayDay,
    classes: classes.length,
    dev: !createTransporter(),
  })
}
