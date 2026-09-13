// Vercel Cron Job — runs daily, scans for overdue payments and sends
// an updated fine-reminder email every 15 days since the last one.
// Configure vercel.json: { "crons": [{ "path": "/api/cron-fines", "schedule": "0 3 * * *" }] }
// (3:00 UTC = 8:30am IST, staggered after the 7am class-reminder cron)

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
    console.log(`[CRON-FINES - no Gmail] To: ${to} | ${subject}`)
    return true
  }
  try {
    await transporter.sendMail({ from: `"Hum & Strum" <${process.env.GMAIL_USER}>`, to, subject, html })
    return true
  } catch (e: any) {
    console.error(`[CRON-FINES EMAIL ERROR] ${to}:`, e.message)
    return false
  }
}

function calcLateFine(payment: any) {
  if (!payment.due_date || payment.status === 'paid' || payment.fine_enabled === false) {
    return { periods: 0, finePct: 0, fineAmount: 0, daysOverdue: 0 }
  }
  const due = new Date(payment.due_date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86400000)
  if (daysOverdue <= 0) return { periods: 0, finePct: 0, fineAmount: 0, daysOverdue: 0 }
  const periods = Math.ceil(daysOverdue / 15)
  const finePct = periods * 5
  const fineAmount = Math.round((payment.amount || 0) * finePct / 100)
  return { periods, finePct, fineAmount, daysOverdue }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || 'hum-strum-cron-2024'
  if (authHeader !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = await serviceSB()

  // Fetch pending/overdue payments with a due_date in the past, fine enabled, and student/subject info
  const { data: candidates } = await svc
    .from('payments')
    .select('*, students(full_name, email, phone), subjects(name, code, color)')
    .in('status', ['pending', 'overdue'])
    .not('due_date', 'is', null)
    .neq('fine_enabled', false)

  if (!candidates?.length) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No overdue payments found' })
  }

  const logoUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.vercel.app'}/logo.png`
  const upiId = 'truetoneacademy@sbi'
  const phoneNumber = '+91 82960 12123'

  let sent = 0, skipped = 0, failed = 0, markedOverdue = 0

  for (const payment of candidates) {
    const fine = calcLateFine(payment)
    if (fine.daysOverdue <= 0) { skipped++; continue }

    // Mark as 'overdue' status if still 'pending' and now past due
    if (payment.status === 'pending') {
      await svc.from('payments').update({ status: 'overdue' }).eq('id', payment.id)
      markedOverdue++
    }

    // Only send if it's been >= 15 days since the last reminder (or never sent one)
    const lastSent = payment.last_fine_reminder_at ? new Date(payment.last_fine_reminder_at) : null
    const daysSinceLastReminder = lastSent ? Math.floor((Date.now() - lastSent.getTime()) / 86400000) : 9999
    if (daysSinceLastReminder < 15) { skipped++; continue }

    const student = (payment as any).students
    const subject = (payment as any).subjects
    const email = student?.email
    if (!email) { skipped++; continue }

    const studentName = student?.full_name || 'Student'
    const subjectName = subject?.name || payment.description || 'Tuition'
    const finalAmount = payment.amount + fine.fineAmount
    const invoiceNo = payment.invoice_number || payment.id.slice(0, 6)

    const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent('Hum and Strum')}&am=${finalAmount}&cu=INR&tn=${encodeURIComponent(String(invoiceNo))}`
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(upiString)}`

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#f9fafb;padding:16px">
        <div style="background:#B91C1C;padding:20px 24px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="display:flex;align-items:center;gap:10px">
              <img src="${logoUrl}" alt="" width="36" height="36" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.3)" onerror="this.style.display='none'"/>
              <div style="color:white;font-size:18px;font-weight:700">⚠️ Payment Overdue</div>
            </div>
            <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:3px">Hum and Strum Music School, Hoodi</div>
          </div>
          <div style="text-align:right">
            <div style="color:rgba(255,255,255,0.6);font-size:10px;text-transform:uppercase">Invoice</div>
            <div style="color:white;font-size:14px;font-weight:700;font-family:monospace">${invoiceNo}</div>
          </div>
        </div>
        <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <p style="color:#374151">Hi <strong>${studentName}</strong>,</p>
          <p style="color:#374151">This is an automatic reminder — your payment for <strong>${subjectName}</strong>${payment.month_label ? ` (${payment.month_label})` : ''} is overdue by <strong style="color:#dc2626">${fine.daysOverdue} days</strong> (due ${payment.due_date}). A late fee has been applied as per our payment policy, and increases every 15 days.</p>

          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
            <tr style="border-bottom:1px solid #f3f4f6"><td style="padding:8px 0;color:#6b7280">Original Amount</td><td style="padding:8px 0;text-align:right;font-weight:500">₹${payment.amount.toLocaleString('en-IN')}</td></tr>
            <tr style="border-bottom:1px solid #f3f4f6"><td style="padding:8px 0;color:#dc2626">Late Fee (${fine.finePct}% — ${fine.periods} period${fine.periods !== 1 ? 's' : ''} × 5%/15 days)</td><td style="padding:8px 0;text-align:right;color:#dc2626;font-weight:600">+₹${fine.fineAmount.toLocaleString('en-IN')}</td></tr>
          </table>

          <div style="background:#B91C1C;border-radius:10px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <span style="color:rgba(255,255,255,0.85);font-size:13px;font-weight:500">Total Amount Due Now</span>
            <span style="color:white;font-size:22px;font-weight:700">₹${finalAmount.toLocaleString('en-IN')}</span>
          </div>

          <div style="border:2px solid #fecaca;border-radius:12px;padding:16px;margin-bottom:16px;background:#fef2f2">
            <div style="font-size:13px;color:#991b1b;font-weight:700;margin-bottom:12px;text-align:center">📲 Pay Now to Avoid Further Fees</div>
            <div style="display:flex;align-items:center;gap:16px">
              <img src="${qrUrl}" alt="UPI QR" width="120" height="120" style="border-radius:8px;border:1px solid #fecaca"/>
              <div>
                <div style="font-size:11px;color:#991b1b;font-weight:600;text-transform:uppercase">Pay via UPI</div>
                <div style="font-size:16px;color:#b91c1c;font-weight:700;font-family:monospace">${upiId}</div>
                <div style="margin-top:8px;padding:6px 10px;background:#fee2e2;border-radius:6px;display:inline-block">
                  <span style="font-size:14px;font-weight:700;color:#991b1b">₹${finalAmount.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>

          <div style="background:#f0f0ff;border-radius:10px;padding:14px;text-align:center;margin-bottom:16px">
            <p style="color:#3B1F8C;font-size:13px;margin:0 0 8px">Already paid, or have a question? Call or WhatsApp us:</p>
            <a href="tel:${phoneNumber.replace(/\s/g,'')}" style="display:inline-block;background:#3B1F8C;color:white;font-size:17px;font-weight:700;text-decoration:none;padding:8px 18px;border-radius:8px">📞 ${phoneNumber}</a>
          </div>

          <p style="color:#9ca3af;font-size:11px;text-align:center;border-top:1px solid #f3f4f6;padding-top:12px">
            An additional 5% fee will be added if payment isn't received within the next 15 days. Hum and Strum Music School · Hoodi, Bengaluru
          </p>
        </div>
      </div>`

    const ok = await sendMail(email, `⚠️ Overdue: ₹${finalAmount.toLocaleString('en-IN')} due for ${subjectName} — Hum and Strum`, html)

    if (ok) {
      sent++
      await svc.from('payments').update({
        fine_amount: fine.fineAmount,
        last_fine_reminder_at: new Date().toISOString(),
      }).eq('id', payment.id)
    } else {
      failed++
    }
  }

  const holdResults = await processSlotHolds(svc, sendMail)

  return NextResponse.json({ ok: true, sent, skipped, failed, markedOverdue, totalCandidates: candidates.length, slotHolds: holdResults })
}

// ── Slot-hold expiry alerts + auto-release ──────────────────────────────
// An unpaid enrollment's picked class slot is held exclusively for that
// student for SLOT_HOLD_GRACE_DAYS (2 weeks — see DashboardShell's
// SLOT_HOLD_GRACE_DAYS). This closes the loop on that policy: warn everyone
// before a hold lapses, then actually release it back to the free pool
// (status -> 'released') the day it expires, instead of leaving it stuck
// as 'held' forever with no one told.
const SLOT_HOLD_GRACE_DAYS = 14
const HOLD_WARNING_WINDOW_DAYS = 3 // send the "expiring soon" alert once the hold has this many days or fewer left

async function processSlotHolds(svc: any, sendMail: (to: string, subject: string, html: string) => Promise<boolean>) {
  const { data: holds, error } = await svc
    .from('student_slot_holds')
    .select('*, students(full_name, email, phone, guardian_name, guardian_email), subjects(name, code)')
    .eq('status', 'held')
  if (error || !holds?.length) return { warned: 0, released: 0 }

  const todayStr = new Date().toISOString().slice(0, 10)
  const today = new Date(todayStr + 'T00:00:00')

  const { data: managers } = await svc.from('profiles').select('email, full_name').in('role', ['center_manager', 'superadmin'])
  const managerEmails = (managers || []).map((m: any) => m.email).filter(Boolean)

  let warned = 0, released = 0
  const expiringNow: any[] = []
  const releasedNow: any[] = []

  for (const hold of holds) {
    const graceDate = new Date(hold.grace_until + 'T00:00:00')
    const daysLeft = Math.round((graceDate.getTime() - today.getTime()) / 86400000)

    if (daysLeft < 0) {
      // Grace period lapsed — release the slot back to the free pool.
      await svc.from('student_slot_holds').update({ status: 'released' }).eq('id', hold.id)
      released++
      releasedNow.push(hold)

      const student = hold.students
      const subject = hold.subjects
      const parentEmail = student?.guardian_email || student?.email
      if (parentEmail) {
        const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <div style="background:#dc2626;padding:18px 22px;border-radius:10px 10px 0 0"><div style="color:white;font-weight:700;font-size:16px">⏰ Reserved Slot Released</div></div>
          <div style="background:white;padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px">
            <p style="color:#374151">Hi ${student?.guardian_name || student?.full_name || 'there'},</p>
            <p style="color:#374151">The class slot reserved for ${student?.full_name || 'your child'}'s <strong>${subject?.name || 'class'}</strong> (${hold.day_of_week} ${hold.start_time?.slice(0,5)}) was held for ${SLOT_HOLD_GRACE_DAYS} days pending payment and has now been released back to general availability since payment wasn't completed in time.</p>
            <p style="color:#374151">If you'd still like to enroll, please contact us to check current slot availability and complete payment.</p>
            <p style="color:#9ca3af;font-size:11px;margin-top:16px">Hum &amp; Strum · Hoodi, Bengaluru</p>
          </div>
        </div>`
        await sendMail(parentEmail, `⏰ Reserved slot released — ${subject?.name || 'class'} (${student?.full_name || ''})`, html)
      }
    } else if (daysLeft <= HOLD_WARNING_WINDOW_DAYS && !hold.expiry_alert_sent_at) {
      // Approaching expiry and no warning sent yet — nudge the parent, once.
      await svc.from('student_slot_holds').update({ expiry_alert_sent_at: new Date().toISOString() }).eq('id', hold.id)
      warned++
      expiringNow.push(hold)

      const student = hold.students
      const subject = hold.subjects
      const parentEmail = student?.guardian_email || student?.email
      if (parentEmail) {
        const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <div style="background:#d97706;padding:18px 22px;border-radius:10px 10px 0 0"><div style="color:white;font-weight:700;font-size:16px">⚠️ Your Reserved Slot Is Expiring</div></div>
          <div style="background:white;padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px">
            <p style="color:#374151">Hi ${student?.guardian_name || student?.full_name || 'there'},</p>
            <p style="color:#374151">${student?.full_name || 'Your'}'s <strong>${subject?.name || 'class'}</strong> slot (${hold.day_of_week} ${hold.start_time?.slice(0,5)}) is being held for you, but payment hasn't been received yet. This hold expires in <strong>${daysLeft} day${daysLeft===1?'':'s'}</strong> (on ${hold.grace_until}) — after that, the slot is released for other students.</p>
            <p style="color:#374151">Please complete payment soon to keep this slot.</p>
            <p style="color:#9ca3af;font-size:11px;margin-top:16px">Hum &amp; Strum · Hoodi, Bengaluru</p>
          </div>
        </div>`
        await sendMail(parentEmail, `⚠️ ${student?.full_name || 'A'} slot expires in ${daysLeft} day${daysLeft===1?'':'s'} — ${subject?.name || 'class'}`, html)
      }
    }
  }

  // One roll-up alert to center managers/superadmin covering everything that
  // changed today, rather than one email per hold.
  if (managerEmails.length && (expiringNow.length || releasedNow.length)) {
    const rows = (list: any[], label: string, color: string) => list.length ? `
      <div style="margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;color:${color};margin-bottom:6px">${label} (${list.length})</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          ${list.map(h => `<tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:5px 0">${h.students?.full_name || 'Student'}</td>
            <td style="padding:5px 0;color:#6b7280">${h.subjects?.name || ''}</td>
            <td style="padding:5px 0;color:#6b7280">${h.day_of_week} ${h.start_time?.slice(0,5)}</td>
            <td style="padding:5px 0;color:#6b7280;text-align:right">${h.grace_until}</td>
          </tr>`).join('')}
        </table>
      </div>` : ''
    const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <div style="background:#3B1F8C;padding:18px 22px;border-radius:10px 10px 0 0"><div style="color:white;font-weight:700;font-size:16px">🔔 Slot Hold Alerts</div></div>
      <div style="background:white;padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px">
        ${rows(expiringNow, 'Expiring within ' + HOLD_WARNING_WINDOW_DAYS + ' days', '#d97706')}
        ${rows(releasedNow, 'Released today — slot now free', '#dc2626')}
        <p style="color:#9ca3af;font-size:11px;margin-top:8px">Hum &amp; Strum · Automated daily check</p>
      </div>
    </div>`
    for (const email of managerEmails) {
      await sendMail(email, `🔔 ${expiringNow.length} expiring, ${releasedNow.length} released — slot holds`, html)
    }
  }

  return { warned, released }
}
