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

  if (type === 'invoice') {
    const { studentEmail, studentName, invoiceData } = body
    if (!studentEmail) return NextResponse.json({ error: 'No email address for this student' }, { status: 400 })

    const {
      invoiceNo, subjectName, pkgName, monthLabel, rawAmount, discountAmt,
      finalAmount, issueDate, dueDate, status, notes, upiId, academyName,
      academyAddress, academyPhone, studentPhone, studentIdExt
    } = invoiceData

    const discountRow = discountAmt > 0 ? `
      <tr>
        <td style="padding:8px 0;color:#2563eb;font-style:italic;font-size:13px">Discount</td>
        <td></td>
        <td style="padding:8px 0;text-align:right;color:#2563eb;font-weight:500">-₹${Number(discountAmt).toLocaleString('en-IN')}</td>
      </tr>` : ''

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <!-- Header -->
        <div style="background:#3B1F8C;padding:20px 24px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="color:white;font-size:18px;font-weight:700">🎵 ${academyName}</div>
            <div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:2px">${academyAddress} · ${academyPhone}</div>
          </div>
          <div style="text-align:right">
            <div style="color:rgba(255,255,255,0.5);font-size:10px;text-transform:uppercase;letter-spacing:0.08em">Invoice</div>
            <div style="color:white;font-size:15px;font-weight:700;font-family:monospace">${invoiceNo}</div>
          </div>
        </div>

        <!-- Body -->
        <div style="background:white;padding:20px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <!-- Billed to + dates -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
            <div style="background:#f9fafb;border-radius:10px;padding:12px 14px">
              <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Billed To</div>
              <div style="font-weight:600;font-size:14px;color:#111827">${studentName}</div>
              ${studentEmail ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">${studentEmail}</div>` : ''}
              ${studentPhone ? `<div style="font-size:12px;color:#6b7280">${studentPhone}</div>` : ''}
              ${studentIdExt ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px">Student ID: #${studentIdExt}</div>` : ''}
            </div>
            <div style="background:#f9fafb;border-radius:10px;padding:12px 14px">
              <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Invoice Details</div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="font-size:12px;color:#6b7280">Issue Date</span>
                <span style="font-size:12px;font-weight:500">${issueDate}</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="font-size:12px;color:#6b7280">Due Date</span>
                <span style="font-size:12px;font-weight:500;color:${status==='paid'?'#059669':'#d97706'}">${dueDate}</span>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span style="font-size:12px;color:#6b7280">Status</span>
                <span style="font-size:12px;font-weight:600;color:${status==='paid'?'#059669':'#d97706'};text-transform:capitalize">${status}</span>
              </div>
            </div>
          </div>

          <!-- Line items -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
            <thead>
              <tr style="border-bottom:2px solid #e5e7eb">
                <th style="text-align:left;padding:8px 0;color:#6b7280;font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:0.05em">Description</th>
                <th style="text-align:center;padding:8px 0;color:#6b7280;font-weight:500;font-size:11px;text-transform:uppercase">Period</th>
                <th style="text-align:right;padding:8px 0;color:#6b7280;font-weight:500;font-size:11px;text-transform:uppercase">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:12px 0">
                  <div style="font-weight:600;color:#111827">${subjectName}${pkgName ? ` — ${pkgName}` : ''}</div>
                  ${notes ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;font-style:italic">${notes}</div>` : ''}
                </td>
                <td style="padding:12px 0;text-align:center;color:#6b7280">${monthLabel}</td>
                <td style="padding:12px 0;text-align:right;font-weight:500">₹${Number(rawAmount).toLocaleString('en-IN')}</td>
              </tr>
              ${discountRow}
            </tbody>
          </table>

          <!-- Total box -->
          <div style="background:#3B1F8C;border-radius:10px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <span style="color:rgba(255,255,255,0.8);font-size:13px;font-weight:500">Total ${status==='paid'?'Paid':'Due'}</span>
            <span style="color:white;font-size:22px;font-weight:700">₹${Number(finalAmount).toLocaleString('en-IN')}</span>
          </div>

          <!-- UPI payment -->
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;margin-bottom:16px">
            <div style="font-size:11px;color:#166534;font-weight:600;margin-bottom:4px">Pay via UPI</div>
            <div style="font-size:15px;color:#15803d;font-weight:700;font-family:monospace">${upiId}</div>
            <div style="font-size:11px;color:#16a34a;margin-top:2px">State Bank of India · Amount: ₹${Number(finalAmount).toLocaleString('en-IN')}</div>
          </div>

          <div style="font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;padding-top:12px">
            Thank you for learning with us! · ${academyName} · ${invoiceNo}
          </div>
        </div>
      </div>`

    const r = await sendEmail(studentEmail, `Invoice ${invoiceNo} — ${subjectName} (${monthLabel}) — ${academyName}`, html)
    return NextResponse.json(r)
  }

  if (type === 'invoice') {
    const { studentEmail, studentName, invoiceData } = body
    if (!studentEmail) return NextResponse.json({ error: 'No email for this student' }, { status: 400 })
    const { invoiceNo, subjectName, pkgName, monthLabel, rawAmount, discountAmt, finalAmount,
      issueDate, dueDate, status, notes, upiId, academyName, academyAddress, academyPhone,
      studentPhone, studentIdExt } = invoiceData

    const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
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
      </div></div>`

    const r = await sendEmail(studentEmail, `Invoice ${invoiceNo} — ${subjectName} (${monthLabel})`, html)
    return NextResponse.json(r)
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}
