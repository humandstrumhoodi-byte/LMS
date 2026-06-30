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

    // QR code URL — encodes UPI deep link so parent can scan and pay directly
    const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent('Hum and Strum')}&am=${Number(finalAmount)}&cu=INR&tn=${encodeURIComponent(invoiceNo)}`
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(upiString)}`

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#f9fafb;padding:16px">
        <!-- Header -->
        <div style="background:#3B1F8C;padding:20px 24px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="display:flex;align-items:center;gap:10px">
              <img src="${process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.vercel.app'}/logo.png" alt="" width="36" height="36" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.25)" onerror="this.style.display='none'"/>
              <div style="color:white;font-size:20px;font-weight:700;letter-spacing:-0.3px">Hum &amp; Strum</div>
            </div>
            <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:2px">${academyAddress} · ${academyPhone}</div>
          </div>
          <div style="text-align:right">
            <div style="color:rgba(255,255,255,0.45);font-size:10px;text-transform:uppercase;letter-spacing:0.08em">Invoice</div>
            <div style="color:white;font-size:16px;font-weight:700;font-family:monospace">${invoiceNo}</div>
            <div style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:${status==='paid'?'#059669':'#d97706'};color:white;text-transform:uppercase">${status}</div>
          </div>
        </div>

        <!-- Body -->
        <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">

          <!-- Billed to + dates row -->
          <div style="display:flex;gap:16px;margin-bottom:20px">
            <div style="flex:1;background:#f9fafb;border-radius:10px;padding:12px 14px">
              <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Billed To</div>
              <div style="font-weight:700;font-size:15px;color:#111827">${studentName}</div>
              ${studentPhone ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">${studentPhone}</div>` : ''}
              ${studentIdExt ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px">Student ID: #${studentIdExt}</div>` : ''}
            </div>
            <div style="flex:1;background:#f9fafb;border-radius:10px;padding:12px 14px">
              <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Details</div>
              <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:12px;color:#6b7280">Period</span><span style="font-size:12px;font-weight:500">${monthLabel}</span></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:12px;color:#6b7280">Issue Date</span><span style="font-size:12px;font-weight:500">${issueDate}</span></div>
              <div style="display:flex;justify-content:space-between"><span style="font-size:12px;color:#6b7280">Due Date</span><span style="font-size:12px;font-weight:600;color:${status==='paid'?'#059669':'#d97706'}">${dueDate}</span></div>
            </div>
          </div>

          <!-- Line items -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
            <thead>
              <tr style="border-bottom:2px solid #e5e7eb">
                <th style="text-align:left;padding:8px 0;color:#6b7280;font-weight:500;font-size:11px;text-transform:uppercase">Description</th>
                <th style="text-align:right;padding:8px 0;color:#6b7280;font-weight:500;font-size:11px;text-transform:uppercase">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:12px 0">
                  <div style="font-weight:600;color:#111827;font-size:14px">${subjectName}${pkgName ? ` — ${pkgName}` : ''}</div>
                  ${notes ? `<div style="font-size:11px;color:#6b7280;margin-top:3px;font-style:italic">${notes}</div>` : ''}
                </td>
                <td style="padding:12px 0;text-align:right;font-weight:600;font-size:14px">₹${Number(rawAmount).toLocaleString('en-IN')}</td>
              </tr>
              ${Number(discountAmt) > 0 ? `
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#2563eb;font-size:13px">Discount</td>
                <td style="padding:8px 0;text-align:right;color:#2563eb;font-weight:500">−₹${Number(discountAmt).toLocaleString('en-IN')}</td>
              </tr>` : ''}
            </tbody>
          </table>

          <!-- Total -->
          <div style="background:#3B1F8C;border-radius:10px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
            <span style="color:rgba(255,255,255,0.75);font-size:13px;font-weight:500">Total ${status==='paid'?'Paid':'Amount Due'}</span>
            <span style="color:white;font-size:24px;font-weight:700">₹${Number(finalAmount).toLocaleString('en-IN')}</span>
          </div>

          ${status !== 'paid' ? `
          <!-- Pay now section with QR -->
          <div style="border:2px solid #bbf7d0;border-radius:12px;padding:16px;margin-bottom:16px;background:#f0fdf4">
            <div style="font-size:13px;color:#166534;font-weight:700;margin-bottom:12px;text-align:center">📲 Scan QR to Pay Instantly</div>
            <div style="display:flex;align-items:center;gap:16px">
              <div style="text-align:center;flex-shrink:0">
                <img src="${qrUrl}" alt="UPI QR Code" width="130" height="130" style="border-radius:8px;border:1px solid #d1fae5;display:block"/>
                <div style="font-size:10px;color:#16a34a;margin-top:4px">Scan with any UPI app</div>
              </div>
              <div>
                <div style="font-size:11px;color:#166534;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Or pay manually via UPI</div>
                <div style="font-size:18px;color:#15803d;font-weight:700;font-family:monospace;letter-spacing:0.02em">${upiId}</div>
                <div style="font-size:11px;color:#16a34a;margin-top:3px">State Bank of India</div>
                <div style="margin-top:10px;padding:8px 12px;background:#dcfce7;border-radius:8px">
                  <div style="font-size:11px;color:#166534">Amount to pay</div>
                  <div style="font-size:16px;font-weight:700;color:#15803d">₹${Number(finalAmount).toLocaleString('en-IN')}</div>
                </div>
              </div>
            </div>
          </div>` : `
          <!-- Paid confirmation -->
          <div style="border:1px solid #bbf7d0;border-radius:10px;padding:12px 16px;margin-bottom:16px;background:#f0fdf4;text-align:center">
            <div style="font-size:20px;margin-bottom:4px">✅</div>
            <div style="font-size:13px;color:#166534;font-weight:600">Payment Received — Thank you!</div>
          </div>`}

          <!-- Footer -->
          <div style="border-top:1px solid #f3f4f6;padding-top:12px;display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:11px;color:#9ca3af">Thank you for learning with us!</div>
            <div style="font-size:11px;color:#d1d5db;font-family:monospace">${invoiceNo}</div>
          </div>
        </div>
      </div>`

    const r = await sendEmail(studentEmail, `Invoice ${invoiceNo} — ${subjectName} (${monthLabel})`, html)
    return NextResponse.json({ ...r, dev: !createTransporter() })
  }

  // ── Re-join reminder for inactive students ─────────────────
  if (type === 'rejoin_reminder') {
    const { studentEmail, studentName, customMessage } = body
    if (!studentEmail) return NextResponse.json({ error: 'No email for this student' }, { status: 400 })

    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <div style="background:#3B1F8C;padding:20px 24px;border-radius:12px 12px 0 0">
          <div style="color:white;font-size:18px;font-weight:700">🎵 We Miss You!</div>
          <div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:3px">Hum &amp; Strum Music Academy</div>
        </div>
        <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <p style="color:#374151">Hi <strong>${studentName}</strong>,</p>
          <p style="color:#374151">It's been a while since we've seen you at the academy! We'd love to have you back.</p>
          ${customMessage ? `<p style="color:#374151;font-size:13px;border-left:3px solid #7B5FC4;padding-left:12px;margin:16px 0">${customMessage}</p>` : ''}
          <div style="background:#f0f0ff;border-radius:10px;padding:16px;margin:16px 0;text-align:center">
            <p style="color:#3B1F8C;font-weight:600;margin:0 0 8px">Ready to resume your classes?</p>
            <p style="color:#6b7280;font-size:13px;margin:0">Reply to this email or call us to pick up where you left off.</p>
          </div>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
          <p style="color:#9ca3af;font-size:11px;text-align:center">Hum &amp; Strum Music Academy · Hoodi, Bengaluru · +91 97312 70069</p>
        </div>
      </div>`

    const r = await sendEmail(studentEmail, `We miss you, ${studentName}! 🎵`, html)
    return NextResponse.json({ ...r, dev: !createTransporter() })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}
