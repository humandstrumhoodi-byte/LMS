import { NextRequest, NextResponse } from 'next/server'
import { serverSB } from '@/lib/server'
import nodemailer from 'nodemailer'

// ── Gmail SMTP transporter ────────────────────────────────────
// Env vars needed in Vercel:
//   GMAIL_USER = your Gmail address  e.g. humandstrumhoodi@gmail.com
//   GMAIL_APP_PASSWORD = 16-char app password from Google Account → Security → App Passwords
// Without these, emails are logged to console only (dev mode)

function createTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
}

async function sendEmail(to: string, subject: string, html: string) {
  const transporter = createTransporter()
  const from = process.env.GMAIL_USER
    ? `"${process.env.EMAIL_FROM_NAME || 'True Tone Music Academy'}" <${process.env.GMAIL_USER}>`
    : null

  if (!transporter || !from) {
    console.log(`[EMAIL - no GMAIL credentials] To: ${to} | Subject: ${subject}`)
    return { ok: true, dev: true }
  }

  try {
    await transporter.sendMail({ from, to, subject, html })
    return { ok: true }
  } catch (err: any) {
    console.error('[EMAIL ERROR]', err.message)
    return { ok: false, error: err.message }
  }
}

// ── Auth check ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const s = await serverSB()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { type } = body

  // ── Class reminder to students ─────────────────────────────
  if (type === 'class_reminder') {
    const { scheduleId, studentIds, teacherIds, customMessage } = body
    const { serviceSB } = await import('@/lib/server')
    const svc = await serviceSB()

    const [{ data: schedule }, { data: stuProfiles }, { data: tchProfiles }] = await Promise.all([
      svc.from('class_schedules').select('*, subjects(name,code)').eq('id', scheduleId).single(),
      svc.from('students').select('full_name,email').in('id', studentIds || []),
      svc.from('profiles').select('full_name,email').in('id', teacherIds || []),
    ])

    const sub = (schedule as any)?.subjects
    const time = (schedule as any)?.start_time?.slice(0, 5)
    const day  = (schedule as any)?.day_of_week
    const dur  = (schedule as any)?.duration_minutes
    let sent = 0

    const recipients = [...(stuProfiles || []), ...(tchProfiles || [])]
    for (const r of recipients) {
      if (!r.email) continue
      const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <div style="background:#3B1F8C;padding:20px 24px;border-radius:12px 12px 0 0">
            <h2 style="color:white;margin:0;font-size:16px">📅 Class Reminder</h2>
            <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:12px">True Tone Music Academy</p>
          </div>
          <div style="background:white;padding:20px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <p style="color:#374151">Hi <strong>${r.full_name}</strong>,</p>
            <p style="color:#374151">Reminder for your upcoming class:</p>
            <div style="background:#f3f4f6;border-radius:10px;padding:16px;margin:12px 0">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280;font-size:13px">Subject</span><strong style="font-size:13px">${sub?.name || 'Music Class'}</strong></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280;font-size:13px">Day</span><strong style="font-size:13px">${day}</strong></div>
              <div style="display:flex;justify-content:space-between"><span style="color:#6b7280;font-size:13px">Time</span><strong style="font-size:13px">${time} · ${dur} min</strong></div>
            </div>
            ${customMessage ? `<p style="color:#374151;font-size:13px;border-left:3px solid #7B5FC4;padding-left:12px;margin:12px 0">${customMessage}</p>` : ''}
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
            <p style="color:#9ca3af;font-size:11px;text-align:center">True Tone Music Academy · Hoodi, Bengaluru</p>
          </div>
        </div>`
      const r2 = await sendEmail(r.email, `Class Reminder: ${sub?.name} on ${day} at ${time}`, html)
      if (r2.ok) sent++
    }
    return NextResponse.json({ ok: true, sent, dev: !createTransporter() })
  }

  // ── Payment reminder to student ────────────────────────────
  if (type === 'payment_reminder') {
    const { studentEmail, studentName, amount, subjectName, month } = body
    if (!studentEmail) return NextResponse.json({ error: 'No email provided' }, { status: 400 })
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <div style="background:#3B1F8C;padding:20px 24px;border-radius:12px 12px 0 0">
          <h2 style="color:white;margin:0;font-size:16px">💳 Payment Reminder</h2>
          <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:12px">True Tone Music Academy</p>
        </div>
        <div style="background:white;padding:20px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <p style="color:#374151">Hi <strong>${studentName}</strong>,</p>
          <p style="color:#374151">This is a friendly reminder that your fee payment is due:</p>
          <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:16px;margin:12px 0">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#92400e;font-size:13px">Subject</span><strong style="font-size:13px">${subjectName}</strong></div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#92400e;font-size:13px">Month</span><strong style="font-size:13px">${month}</strong></div>
            <div style="display:flex;justify-content:space-between"><span style="color:#92400e;font-size:13px">Amount Due</span><strong style="font-size:16px;color:#b45309">₹${amount?.toLocaleString('en-IN')}</strong></div>
          </div>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;margin:12px 0">
            <div style="font-size:11px;color:#166534;font-weight:600;margin-bottom:4px">Pay via UPI</div>
            <div style="font-size:15px;color:#15803d;font-weight:700;font-family:monospace">truetoneacademy@sbi</div>
            <div style="font-size:11px;color:#16a34a">State Bank of India</div>
          </div>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
          <p style="color:#9ca3af;font-size:11px;text-align:center">True Tone Music Academy · Hoodi, Bengaluru</p>
        </div>
      </div>`
    const r = await sendEmail(studentEmail, `Fee Reminder: ${subjectName} — ${month}`, html)
    return NextResponse.json({ ...r, dev: !createTransporter() })
  }

  // ── Invoice email ──────────────────────────────────────────
  if (type === 'invoice') {
    const { studentEmail, studentName, invoiceData } = body
    if (!studentEmail) return NextResponse.json({ error: 'No email for this student' }, { status: 400 })

    const { invoiceNo, subjectName, pkgName, monthLabel, rawAmount, discountAmt, finalAmount,
      issueDate, dueDate, status, notes, upiId, academyName, academyAddress, academyPhone,
      studentPhone, studentIdExt } = invoiceData

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <div style="background:#3B1F8C;padding:20px 24px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center">
          <div><div style="color:white;font-size:18px;font-weight:700">🎵 ${academyName}</div><div style="color:rgba(255,255,255,0.7);font-size:12px">${academyAddress} · ${academyPhone}</div></div>
          <div style="text-align:right"><div style="color:rgba(255,255,255,0.5);font-size:10px;text-transform:uppercase">Invoice</div><div style="color:white;font-size:15px;font-weight:700;font-family:monospace">${invoiceNo}</div></div>
        </div>
        <div style="background:white;padding:20px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
            <div style="background:#f9fafb;border-radius:10px;padding:12px 14px">
              <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;margin-bottom:6px">Billed To</div>
              <div style="font-weight:600;font-size:14px;color:#111827">${studentName}</div>
              ${studentEmail ? `<div style="font-size:12px;color:#6b7280">${studentEmail}</div>` : ''}
              ${studentPhone ? `<div style="font-size:12px;color:#6b7280">${studentPhone}</div>` : ''}
              ${studentIdExt ? `<div style="font-size:11px;color:#9ca3af">Student ID: #${studentIdExt}</div>` : ''}
            </div>
            <div style="background:#f9fafb;border-radius:10px;padding:12px 14px">
              <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;margin-bottom:6px">Invoice Details</div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;color:#6b7280">Issue Date</span><span style="font-size:12px;font-weight:500">${issueDate}</span></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;color:#6b7280">Due Date</span><span style="font-size:12px;font-weight:500;color:${status==='paid'?'#059669':'#d97706'}">${dueDate}</span></div>
              <div style="display:flex;justify-content:space-between"><span style="font-size:12px;color:#6b7280">Status</span><span style="font-size:12px;font-weight:600;color:${status==='paid'?'#059669':'#d97706'};text-transform:capitalize">${status}</span></div>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
            <thead><tr style="border-bottom:2px solid #e5e7eb">
              <th style="text-align:left;padding:8px 0;color:#6b7280;font-weight:500;font-size:11px;text-transform:uppercase">Description</th>
              <th style="text-align:center;padding:8px 0;color:#6b7280;font-weight:500;font-size:11px;text-transform:uppercase">Period</th>
              <th style="text-align:right;padding:8px 0;color:#6b7280;font-weight:500;font-size:11px;text-transform:uppercase">Amount</th>
            </tr></thead>
            <tbody>
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:12px 0"><div style="font-weight:600;color:#111827">${subjectName}${pkgName ? ` — ${pkgName}` : ''}</div>${notes ? `<div style="font-size:11px;color:#6b7280;font-style:italic">${notes}</div>` : ''}</td>
                <td style="padding:12px 0;text-align:center;color:#6b7280">${monthLabel}</td>
                <td style="padding:12px 0;text-align:right;font-weight:500">₹${Number(rawAmount).toLocaleString('en-IN')}</td>
              </tr>
              ${Number(discountAmt) > 0 ? `<tr><td style="padding:8px 0;color:#2563eb;font-style:italic">Discount</td><td></td><td style="padding:8px 0;text-align:right;color:#2563eb;font-weight:500">-₹${Number(discountAmt).toLocaleString('en-IN')}</td></tr>` : ''}
            </tbody>
          </table>
          <div style="background:#3B1F8C;border-radius:10px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <span style="color:rgba(255,255,255,0.8);font-size:13px;font-weight:500">Total ${status==='paid'?'Paid':'Due'}</span>
            <span style="color:white;font-size:22px;font-weight:700">₹${Number(finalAmount).toLocaleString('en-IN')}</span>
          </div>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;margin-bottom:16px">
            <div style="font-size:11px;color:#166534;font-weight:600;margin-bottom:4px">Pay via UPI</div>
            <div style="font-size:15px;color:#15803d;font-weight:700;font-family:monospace">${upiId}</div>
            <div style="font-size:11px;color:#16a34a">State Bank of India · Amount: ₹${Number(finalAmount).toLocaleString('en-IN')}</div>
          </div>
          <div style="font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;padding-top:12px">Thank you for learning with us! · ${academyName}</div>
        </div>
      </div>`

    const r = await sendEmail(studentEmail, `Invoice ${invoiceNo} — ${subjectName} (${monthLabel})`, html)
    return NextResponse.json({ ...r, dev: !createTransporter() })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}
