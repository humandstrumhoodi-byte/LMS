import { NextRequest, NextResponse } from 'next/server'
import { serverSB, serviceSB } from '@/lib/server'

// ── CSV parser (handles quoted fields) ───────────────────────
function parseCSV(text: string): Record<string, string>[] {
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
      } else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = '' }
      else cur += ch
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

// ── Amount parser (handles "2,200.000" format) ────────────────
function parseAmount(s: string): number {
  if (!s) return 0
  const cleaned = s.replace(/,/g, '').trim()
  return Math.round(parseFloat(cleaned) || 0)
}

// ── Subject extraction from item name + description ───────────
const SUBJECT_KEYWORDS: [string, string][] = [
  ['keyboard/piano', 'Keyboard'],
  ['keyboard',       'Keyboard'],
  ['piano',          'Piano'],
  ['western vocal',  'Western Vocal'],
  ['hindustani',     'Hindustani Vocal'],
  ['vocals',         'Vocals'],
  ['vocal',          'Vocals'],
  ['guitar & ukulele', 'Guitar'],
  ['ukulele',        'Ukulele'],
  ['guitar',         'Guitar'],
  ['violin',         'Violin'],
  ['flute',          'Flute'],
  ['cajon',          'Drums'],
  ['drums',          'Drums'],
  ['bharatnatyam',   'Bharatnatyam'],
  ['dance',          'Dance'],
]

function extractSubject(itemName: string, itemDesc: string): string | null {
  const text = (itemName + ' ' + itemDesc).toLowerCase()
  for (const [kw, subject] of SUBJECT_KEYWORDS) {
    if (text.includes(kw)) return subject
  }
  return null
}

function extractGrade(itemName: string): string {
  const t = itemName.toLowerCase()
  if (t.includes('grade 6') || t.includes('grade-6') || t.includes('grade6')) return 'Grade 6–8'
  if (t.includes('grade 3') || t.includes('grade 4') || t.includes('grade 5') || t.includes('grade-3')) return 'Grade 3–5'
  return 'Beginner–Grade 2'
}

function extractClassesPerMonth(itemName: string, qty: string): { classes_pm: number; months: number } {
  const m = itemName.toLowerCase().match(/(\d+)x\s*a\s*week/)
  const q = parseInt(qty) || 4
  if (m) {
    const perWeek = parseInt(m[1])
    const months = Math.max(1, Math.round(q / (perWeek * 4)))
    return { classes_pm: perWeek * 4, months }
  }
  // Fall back to qty-based
  if (q <= 4) return { classes_pm: 4, months: 1 }
  if (q <= 8) return { classes_pm: 8, months: 1 }
  if (q <= 12) return { classes_pm: 4, months: 3 }
  if (q <= 24) return { classes_pm: 8, months: 3 }
  return { classes_pm: 4, months: Math.ceil(q / 4) }
}

// ── Map invoice_items row → payment record ────────────────────
function mapInvoiceRow(row: Record<string, string>) {
  const itemName = row['item_name'] || ''
  const itemDesc = row['item_description'] || ''
  const subjectName = extractSubject(itemName, itemDesc)
  const gradeLeval = extractGrade(itemName)
  const { classes_pm, months } = extractClassesPerMonth(itemName, row['quantity'])

  const rawStatus = (row['invoice_status'] || '').toLowerCase()
  const status = rawStatus === 'paid' ? 'paid' : rawStatus === 'overdue' ? 'overdue' : 'pending'

  const dateStr = row['invoice_issue_date'] || null
  let month_label = 'Imported'
  if (dateStr) {
    try { month_label = new Date(dateStr).toLocaleString('en-IN', { month: 'long', year: 'numeric' }) } catch {}
  }

  // Use "Subtotal After Discount" as the actual amount paid
  const amount = parseAmount(row['subtotal_after_discount_inr']) ||
                 parseAmount(row['total_amount_inr']) ||
                 parseAmount(row['item_subtotal_inr']) || 0

  const discount = parseAmount(row['discount_inr']) || 0

  return {
    invoice_number:  row['invoice_number'] || null,
    student_name:    row['invoicee'] || null,
    student_email:   row['email'] || null,
    student_phone:   row['phone'] || null,
    student_id_ext:  row['student_id'] || null,
    amount,
    discount,
    payment_date:    dateStr?.slice(0, 10) || null,
    status,
    month_label,
    description:     itemName || null,
    mode_of_payment: 'UPI',
    recorded_by:     row['logged_by'] || row['invoiced_by'] || null,
    // Extracted fields
    subject_name:    subjectName,
    grade_level:     gradeLeval,
    classes_pm,
    months,
    quantity:        parseInt(row['quantity']) || 0,
    validity:        row['validity'] || null,
  }
}

// ── Old payments CSV mapper ───────────────────────────────────
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

// ── Auth check ────────────────────────────────────────────────
async function checkAuth() {
  const s = await serverSB()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return null
  const { data: profile } = await s.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['superadmin', 'center_manager'].includes(profile.role)) return null
  return user
}

// ═══════════════════════════════════════════════════════════════
// POST /api/import
// body: { type: 'payments' | 'invoice_items', csvText: string }
// ═══════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const user = await checkAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { type, csvText } = body
  if (!csvText) return NextResponse.json({ error: 'No CSV text provided' }, { status: 400 })

  const svc = await serviceSB()
  const rows = parseCSV(csvText)
  if (!rows.length) return NextResponse.json({ error: 'No data rows found in CSV' }, { status: 400 })

  // ── Detect format automatically ──────────────────────────────
  const firstRowKeys = Object.keys(rows[0]).join(',')
  const isInvoiceFormat = firstRowKeys.includes('invoice_number') && firstRowKeys.includes('item_name')
  const actualType = type || (isInvoiceFormat ? 'invoice_items' : 'payments')

  console.log(`[Import] type=${actualType}, rows=${rows.length}, keys=${firstRowKeys.slice(0,80)}`)

  // ── Pre-fetch all students for matching ──────────────────────
  const { data: allStudents } = await svc.from('students')
    .select('id, student_id_ext, email, phone, full_name')

  // NOTE: phone/email are NOT guaranteed unique per student — siblings commonly
  // share a guardian's phone/email. So these maps hold ARRAYS of candidates,
  // and we disambiguate by name below rather than silently keeping only the
  // last student seen for that phone/email (that was the old bug — it caused
  // one sibling's invoices to get attributed to the other).
  const studentByExtId: Record<string, string> = {}
  const studentByEmail: Record<string, { id: string; full_name: string }[]> = {}
  const studentByPhone: Record<string, { id: string; full_name: string }[]> = {}

  ;(allStudents || []).forEach(st => {
    if (st.student_id_ext) studentByExtId[String(st.student_id_ext).trim()] = st.id
    if (st.email) {
      const key = st.email.toLowerCase().trim()
      ;(studentByEmail[key] ||= []).push({ id: st.id, full_name: st.full_name })
    }
    if (st.phone) {
      const key = st.phone.replace(/\s/g, '').replace(/^\+91/, '91')
      ;(studentByPhone[key] ||= []).push({ id: st.id, full_name: st.full_name })
    }
  })

  // Loose first-name comparison — good enough to tell siblings apart
  // without breaking on minor spelling/spacing differences.
  function firstNameOf(n: string | null | undefined): string {
    return (n || '').trim().split(/\s+/)[0]?.toLowerCase() || ''
  }

  // Given a list of same-phone/email candidates, pick the one whose first
  // name matches the CSV row's name. Returns null (unmatched — safer than
  // guessing) if there's more than one candidate and none match by name.
  function disambiguate(candidates: { id: string; full_name: string }[], rowName?: string | null): string | null {
    if (candidates.length === 1) return candidates[0].id
    if (candidates.length === 0) return null
    const wantFirst = firstNameOf(rowName)
    if (!wantFirst) return null // multiple siblings, no name to disambiguate with — don't guess
    const match = candidates.find(c => firstNameOf(c.full_name) === wantFirst)
    return match ? match.id : null
  }

  function findStudent(extId?: string | null, email?: string | null, phone?: string | null, name?: string | null): string | null {
    if (extId) {
      const found = studentByExtId[String(extId).trim()]
      if (found) return found
    }
    if (email) {
      const found = disambiguate(studentByEmail[email.toLowerCase().trim()] || [], name)
      if (found) return found
    }
    if (phone) {
      const norm = phone.replace(/\s/g, '').replace(/^\+91/, '91').replace(/^0/, '')
      const candidates = studentByPhone[norm] || studentByPhone['91' + norm] || studentByPhone['+91' + norm] || []
      const found = disambiguate(candidates, name)
      if (found) return found
    }
    return null
  }

  // ── Pre-fetch all subjects for matching ──────────────────────
  const { data: allSubjects } = await svc.from('subjects').select('id, name')
  const subjectByName: Record<string, string> = {}
  ;(allSubjects || []).forEach(s => {
    subjectByName[s.name.toLowerCase().trim()] = s.id
  })

  function findSubjectId(name: string | null): string | null {
    if (!name) return null
    const key = name.toLowerCase().trim()
    // Exact match
    if (subjectByName[key]) return subjectByName[key]
    // Fuzzy match — check if subject name is contained
    for (const [sName, sId] of Object.entries(subjectByName)) {
      if (key.includes(sName) || sName.includes(key)) return sId
    }
    return null
  }

  // ═══════════════════════════════════════════════════════════
  // INVOICE ITEMS FORMAT (invoices_items CSV)
  // ═══════════════════════════════════════════════════════════
  if (actualType === 'invoice_items') {
    const toInsert: any[] = []
    let skip = 0
    const subjectsMissing: string[] = []
    const studentsMissing: string[] = []

    for (const row of rows) {
      const mapped = mapInvoiceRow(row)

      // Skip zero-amount rows (free makeup classes etc.)
      if (!mapped.amount || mapped.amount <= 0) { skip++; continue }

      const studentId = findStudent(mapped.student_id_ext, mapped.student_email, mapped.student_phone, mapped.student_name)
      if (!studentId && mapped.student_name && mapped.student_name !== 'Student Sample') {
        studentsMissing.push(mapped.student_name)
      }

      const subjectId = findSubjectId(mapped.subject_name)
      if (!subjectId && mapped.subject_name) {
        subjectsMissing.push(mapped.subject_name)
      }

      toInsert.push({
        student_id:      studentId,
        subject_id:      subjectId,
        amount:          mapped.amount,
        payment_date:    mapped.payment_date,
        status:          mapped.status,
        month_label:     mapped.month_label,
        invoice_number:  mapped.invoice_number,
        description:     mapped.description,
        mode_of_payment: 'UPI',
        recorded_by:     mapped.recorded_by,
        student_name:    mapped.student_name,
        student_email:   mapped.student_email,
        student_phone:   mapped.student_phone,
        student_id_ext:  mapped.student_id_ext,
      })
    }

    if (!toInsert.length) {
      return NextResponse.json({
        ok: false,
        error: 'All rows had zero amount — nothing to import',
        skipped: skip
      })
    }

    // Batch insert
    let inserted = 0, failed = 0
    const BATCH = 50
    const firstErrors: string[] = []

    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH)
      const { error } = await svc.from('payments').insert(batch)
      if (error) {
        console.error('[Invoice import batch error]', error.message)
        firstErrors.push(error.message)
        // Row-by-row fallback
        for (const row of batch) {
          const { error: e2 } = await svc.from('payments').insert(row)
          if (e2) failed++
          else inserted++
        }
      } else {
        inserted += batch.length
      }
    }

    // Also update student_subjects links where missing
    let linked = 0
    for (const row of toInsert) {
      if (row.student_id && row.subject_id) {
        const { error } = await svc.from('student_subjects').upsert(
          { student_id: row.student_id, subject_id: row.subject_id },
          { onConflict: 'student_id,subject_id', ignoreDuplicates: true }
        )
        if (!error) linked++
      }
    }

    return NextResponse.json({
      ok: true,
      inserted,
      failed,
      skipped: skip,
      linked,
      total: rows.length,
      subjects_missing: Array.from(new Set(subjectsMissing)).slice(0, 10),
      students_missing: Array.from(new Set(studentsMissing)).slice(0, 10),
      firstError: firstErrors[0] || null,
    })
  }

  // ═══════════════════════════════════════════════════════════
  // OLD PAYMENTS FORMAT (payments CSV)
  // ═══════════════════════════════════════════════════════════
  const toInsert: any[] = []
  let skip = 0

  for (const row of rows) {
    const mapped = mapPaymentRow(row)
    if (!mapped.amount || mapped.amount <= 0) { skip++; continue }

    const studentId = findStudent(mapped.student_id_ext, mapped.student_email, mapped.student_phone, mapped.student_name)

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
    return NextResponse.json({ ok: false, error: 'No valid rows to import', skipped: skip })
  }

  let inserted = 0, failed = 0
  const firstErrors: string[] = []
  const BATCH = 50

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH)
    const { error } = await svc.from('payments').insert(batch)
    if (error) {
      firstErrors.push(error.message)
      for (const r of batch) {
        const { error: e2 } = await svc.from('payments').insert(r)
        if (e2) failed++
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
