import { NextRequest, NextResponse } from 'next/server'
import { serverSB, serviceSB } from '@/lib/server'

// Bulk import API — uses service role to bypass RLS
// Handles payments in batches of 50 for speed

function parseCSVServer(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  function splitLine(line: string): string[] {
    const fields: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = !inQ
      } else if (ch === ',' && !inQ) {
        fields.push(cur.trim()); cur = ''
      } else cur += ch
    }
    fields.push(cur.trim())
    return fields
  }

  const rawHeaders = splitLine(lines[0])
  const headers = rawHeaders.map(h =>
    h.replace(/^"|"$/g, '').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  )

  return lines.slice(1).map(line => {
    const vals = splitLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^"|"$/g, '').trim() })
    return row
  }).filter(r => Object.values(r).some(v => v))
}

function mapPaymentRow(row: Record<string, string>) {
  const rawStatus = (row['status'] || '').toLowerCase()
  const status = rawStatus === 'successful' ? 'paid' : rawStatus === 'failed' ? 'failed' : 'pending'
  const dateStr = row['date'] || row['payment_date'] || null
  let month_label = 'Imported'
  if (dateStr) {
    try { month_label = new Date(dateStr).toLocaleString('en-IN', { month: 'long', year: 'numeric' }) } catch {}
  }
  return {
    payment_date:    dateStr?.slice(0, 10) || null,
    amount:          parseInt(row['amount'] || '0') || 0,
    receipt_number:  row['receipt_'] || row['receipt_number'] || row['receipt'] || null,
    invoice_number:  row['invoice_'] || row['invoice_number'] || row['invoice'] || null,
    description:     row['payment_description'] || row['description'] || null,
    mode_of_payment: row['mode_of_payment'] || 'UPI',
    transaction_id:  row['transaction_id'] || null,
    student_name:    row['student'] || row['student_name'] || null,
    student_email:   row['student_email'] || null,
    student_phone:   row['student_phone'] || null,
    student_id_ext:  row['student_id'] || row['student_id_ext'] || null,
    recorded_by:     row['recorded_by'] || null,
    status,
    month_label,
  }
}

export async function POST(req: NextRequest) {
  // Auth check
  const s = await serverSB()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await s.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['superadmin', 'center_manager'].includes(profile.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { type, csvText } = body

  if (!csvText) return NextResponse.json({ error: 'No CSV text provided' }, { status: 400 })

  const svc = await serviceSB()
  const rows = parseCSVServer(csvText)

  if (!rows.length) return NextResponse.json({ error: 'No data rows parsed from CSV' }, { status: 400 })

  if (type === 'payments') {
    // Pre-fetch all students for matching (avoids N+1 queries)
    const { data: allStudents } = await svc.from('students')
      .select('id, student_id_ext, email, phone, full_name')

    const studentById: Record<string, string> = {}
    const studentByEmail: Record<string, string> = {}
    const studentByPhone: Record<string, string> = {}
    ;(allStudents || []).forEach(st => {
      if (st.student_id_ext) studentById[st.student_id_ext] = st.id
      if (st.email) studentByEmail[st.email.toLowerCase()] = st.id
      if (st.phone) studentByPhone[st.phone.replace(/\s/g, '')] = st.id
    })

    const toInsert: any[] = []
    let skip = 0

    for (const row of rows) {
      const mapped = mapPaymentRow(row)
      if (!mapped.amount || mapped.amount <= 0) { skip++; continue }

      // Match student
      let studentId: string | null = null
      if (mapped.student_id_ext) studentId = studentById[mapped.student_id_ext] || null
      if (!studentId && mapped.student_email)
        studentId = studentByEmail[mapped.student_email.toLowerCase()] || null
      if (!studentId && mapped.student_phone)
        studentId = studentByPhone[mapped.student_phone.replace(/\s/g, '')] || null

      toInsert.push({
        amount:          mapped.amount,
        payment_date:    mapped.payment_date,
        status:          mapped.status,
        month_label:     mapped.month_label,
        student_id:      studentId,
        student_name:    mapped.student_name,
        student_email:   mapped.student_email,
        student_phone:   mapped.student_phone,
        student_id_ext:  mapped.student_id_ext,
        receipt_number:  mapped.receipt_number,
        invoice_number:  mapped.invoice_number,
        mode_of_payment: mapped.mode_of_payment,
        transaction_id:  mapped.transaction_id,
        description:     mapped.description,
        recorded_by:     mapped.recorded_by,
      })
    }

    if (!toInsert.length) {
      return NextResponse.json({ ok: true, inserted: 0, skipped: skip, error: 'All rows had zero amount' })
    }

    // Insert in batches of 50
    let inserted = 0, failed = 0
    const firstErrors: string[] = []
    const BATCH = 50

    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH)
      const { error } = await svc.from('payments').insert(batch)
      if (error) {
        console.error('[Payments bulk insert error]', error.message, error.details)
        firstErrors.push(error.message)
        // Try one by one to salvage
        for (const row of batch) {
          const { error: e2 } = await svc.from('payments').insert(row)
          if (e2) { failed++; }
          else inserted++
        }
      } else {
        inserted += batch.length
      }
    }

    return NextResponse.json({
      ok: true,
      inserted,
      failed,
      skipped: skip,
      total: rows.length,
      firstError: firstErrors[0] || null,
    })
  }

  return NextResponse.json({ error: `Unknown import type: ${type}` }, { status: 400 })
}
