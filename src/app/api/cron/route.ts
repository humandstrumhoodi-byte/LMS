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

// ══════════════════════════════════════════════════════════════
// PACKAGE-RUNNING-LOW ALERTS — "2 classes prior" renewal warning.
// Same billing-cycle math as the Revenue Forecast / Classes Taken reports
// (collapseInvoices + coverageEndDate), reimplemented here in plain TS
// since this route can't import from the client component file. Fires
// once per (student, subject, cycle) the moment classes-remaining hits
// exactly 2 — see supabase/add_package_low_alerts.sql for the dedupe table.
// ══════════════════════════════════════════════════════════════
function paymentAnchorDateStr(p: any): string | null {
  if (p.payment_date) return p.payment_date
  if (p.due_date) return p.due_date
  if (p.month_label) {
    const parsed = new Date(`1 ${p.month_label}`)
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  }
  if (p.created_at) return String(p.created_at).slice(0, 10)
  return null
}
function addMonthsToDateStr(dateStr: string, n: number): Date {
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + n)
  return d
}
function coverageEndDate(anchorStr: string, cycleMonths: number): Date {
  const d = addMonthsToDateStr(anchorStr, cycleMonths)
  d.setDate(d.getDate() - 1)
  return d
}
function collapseInvoices(payments: any[]): { anchor: string; amount: number; months: number; raw: any }[] {
  const groups = new Map<string, any[]>()
  payments.forEach(p => {
    const key = p.invoice_group_id || p.id
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  })
  const invoices: { anchor: string; amount: number; months: number; raw: any }[] = []
  groups.forEach(group => {
    const withAnchor = group.map(p => ({ p, anchor: paymentAnchorDateStr(p) })).filter(x => x.anchor)
    if (!withAnchor.length) return
    withAnchor.sort((a, b) => a.anchor!.localeCompare(b.anchor!))
    const earliest = withAnchor[0]
    const amount = earliest.p.total_invoice_amount || group.reduce((a: number, p: any) => a + (p.amount || 0), 0)
    const months = group.map((p: any) => Number(p.months)).find((m: number) => m > 0) || 1
    invoices.push({ anchor: earliest.anchor!, amount, months, raw: earliest.p })
  })
  return invoices
}

async function checkPackageLowAlerts(svc: any): Promise<{ checked: number; alerted: number; failed: number }> {
  const todayStr = new Date().toISOString().slice(0, 10)

  const [{ data: students }, { data: payments }, { data: packages }, { data: schedules }, { data: attendance }] = await Promise.all([
    svc.from('students').select('id, full_name, email, guardian_email, guardian_name, status, student_subjects(subject_id, subjects(name))'),
    svc.from('payments').select('student_id, subject_id, status, amount, payment_date, due_date, month_label, created_at, months, package_id, invoice_group_id, total_invoice_amount').eq('status', 'paid'),
    svc.from('packages').select('id, name, classes_pm'),
    svc.from('class_schedules').select('id, subject_id'),
    svc.from('attendance').select('student_id, schedule_id, class_date, status, type').eq('type', 'student'),
  ])

  if (!students?.length) return { checked: 0, alerted: 0, failed: 0 }

  const schedSubjectMap = new Map((schedules || []).map((s: any) => [s.id, s.subject_id]))
  let checked = 0, alerted = 0, failed = 0
  const toInsert: any[] = []

  for (const student of students) {
    if ((student.status || 'Active') !== 'Active') continue
    for (const ss of (student as any).student_subjects || []) {
      checked++
      const paidForSubject = (payments || []).filter((p: any) => p.student_id === student.id && p.subject_id === ss.subject_id)
      const invoices = collapseInvoices(paidForSubject).sort((a, b) => b.anchor.localeCompare(a.anchor))
      const latest = invoices[0]
      if (!latest) continue // no paid package on record

      const end = coverageEndDate(latest.anchor, latest.months)
      const endStr = end.toISOString().slice(0, 10)
      if (endStr < todayStr) continue // package already ended — that's overdue renewal, not "running low"

      const pkg = (packages || []).find((pk: any) => pk.id === (latest.raw as any)?.package_id)
      if (!pkg?.classes_pm) continue // no package on file — nothing to count an allowance against
      const allowance = pkg.classes_pm * latest.months

      const cycleAttendance = (attendance || []).filter((a: any) =>
        a.student_id === student.id && schedSubjectMap.get(a.schedule_id) === ss.subject_id &&
        a.class_date >= latest.anchor && a.class_date <= endStr
      )
      const taken = cycleAttendance.filter((a: any) => a.status === 'present' || a.status === 'late').length
      const remaining = allowance - taken
      if (remaining !== 2) continue // fire exactly once, right when 2 classes are left

      const { data: existing } = await svc.from('package_low_alerts').select('id')
        .eq('student_id', student.id).eq('subject_id', ss.subject_id).eq('cycle_anchor', latest.anchor).maybeSingle()
      if (existing) continue // already alerted for this cycle

      const recipient = (student as any).guardian_email || student.email
      if (!recipient) continue

      const subjectName = ss.subjects?.name || 'your class'
      const html = `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
          <div style="background:#3B1F8C;padding:20px 24px;border-radius:12px 12px 0 0">
            <div style="color:white;font-size:18px;font-weight:700">⏳ Package Running Low</div>
            <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:3px">Hum &amp; Strum</div>
          </div>
          <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <p style="color:#374151;margin:0 0 16px">Hi <strong>${(student as any).guardian_name || student.full_name}</strong>,</p>
            <p style="color:#374151;margin:0 0 16px">
              ${student.full_name}'s <strong>${subjectName}</strong> package (${pkg.name || `${pkg.classes_pm} classes/month`}) has
              <strong>2 classes remaining</strong>. Please renew soon to avoid a gap in classes.
            </p>
            <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#92400e">
              Current package covers through <strong>${endStr}</strong>.
            </div>
            <div style="border-top:1px solid #f3f4f6;margin-top:20px;padding-top:12px;font-size:11px;color:#9ca3af;text-align:center">
              Hum &amp; Strum · Hoodi, Bengaluru · +91 97312 70069
            </div>
          </div>
        </div>`

      const ok = await sendMail(recipient, `⏳ ${student.full_name}'s ${subjectName} package — 2 classes left`, html)
      if (ok) {
        alerted++
        toInsert.push({ student_id: student.id, subject_id: ss.subject_id, cycle_anchor: latest.anchor, classes_taken_at_send: taken })
      } else failed++
    }
  }

  if (toInsert.length) await svc.from('package_low_alerts').insert(toInsert)
  return { checked, alerted, failed }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || 'hum-strum-cron-2024'
  if (authHeader !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = await serviceSB()

  // Package-running-low check runs every time this cron fires (daily), independent
  // of whether there are classes today — it's about renewal timing, not today's schedule.
  let packageAlerts = { checked: 0, alerted: 0, failed: 0 }
  try {
    packageAlerts = await checkPackageLowAlerts(svc)
  } catch (e: any) {
    console.error('[CRON package-low-alerts]', e.message)
  }
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
    return NextResponse.json({ ok: true, sent: 0, message: `No classes on ${todayDay}`, packageAlerts })
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
    packageAlerts,
    dev: !createTransporter(),
  })
}
