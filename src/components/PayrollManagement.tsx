'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/client'
import { ArrowLeft, Wallet, Plus, Loader2, Download, Play } from 'lucide-react'
import type { Profile, StaffSalaryStructure, PayRun } from '@/types'

function jsDayToAbbr(d: number) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d] }
function datesInRange(start: string, end: string): string[] {
  const out: string[] = []
  let d = new Date(start + 'T00:00:00')
  const endD = new Date(end + 'T00:00:00')
  while (d <= endD) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1) }
  return out
}
function fmt(n: number) { return `₹${Math.round(n).toLocaleString('en-IN')}` }
function monthBounds(monthStr: string): { start: string; end: string; label: string } {
  // monthStr = "2026-09"
  const [y, m] = monthStr.split('-').map(Number)
  const start = `${monthStr}-01`
  const end = new Date(y, m, 0).toISOString().slice(0, 10) // last day of month
  const label = new Date(`${monthStr}-01T00:00:00`).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  return { start, end, label }
}

export default function PayrollManagement({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<'structures' | 'runs'>('structures')
  const [staff, setStaff] = useState<any[]>([])
  const [structures, setStructures] = useState<StaffSalaryStructure[]>([])
  const [payRuns, setPayRuns] = useState<PayRun[]>([])
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  const [payslips, setPayslips] = useState<any[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function loadStaff() {
    const { data } = await sb().from('profiles').select('id, full_name, role').order('full_name')
    setStaff(data || [])
  }
  async function loadStructures() {
    const { data } = await sb().from('staff_salary_structures').select('*').eq('is_active', true)
    setStructures(data || [])
  }
  async function loadPayRuns() {
    const { data } = await sb().from('pay_runs').select('*').order('period_start', { ascending: false })
    setPayRuns(data || [])
  }
  async function loadPayslips(runId: string) {
    const { data } = await sb().from('payslips').select('*, profiles(full_name)').eq('pay_run_id', runId)
    setPayslips(data || [])
  }

  useEffect(() => { loadStaff(); loadStructures(); loadPayRuns() }, [])

  // ── Salary structures ────────────────────────────────────────
  const [structForm, setStructForm] = useState<Record<string, { pay_type: string; monthly_salary: string; per_class_rate: string }>>({})
  function editStruct(staffId: string, field: string, value: string) {
    const existing = structures.find(s => s.profile_id === staffId)
    setStructForm(f => ({
      ...f,
      [staffId]: {
        pay_type: f[staffId]?.pay_type ?? existing?.pay_type ?? 'monthly',
        monthly_salary: f[staffId]?.monthly_salary ?? String(existing?.monthly_salary ?? ''),
        per_class_rate: f[staffId]?.per_class_rate ?? String(existing?.per_class_rate ?? ''),
        [field]: value,
      },
    }))
  }
  async function saveStruct(staffId: string) {
    const form = structForm[staffId]
    const existing = structures.find(s => s.profile_id === staffId)
    const pay_type = form?.pay_type ?? existing?.pay_type ?? 'monthly'
    const monthly_salary = form?.monthly_salary !== undefined ? (parseFloat(form.monthly_salary) || null) : (existing?.monthly_salary ?? null)
    const per_class_rate = form?.per_class_rate !== undefined ? (parseFloat(form.per_class_rate) || null) : (existing?.per_class_rate ?? null)
    setBusy(true)
    if (existing) await sb().from('staff_salary_structures').update({ is_active: false }).eq('id', existing.id)
    const { error } = await sb().from('staff_salary_structures').insert({
      profile_id: staffId, pay_type, monthly_salary, per_class_rate, effective_from: new Date().toISOString().slice(0, 10),
    })
    setBusy(false)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setMsg('✓ Salary structure saved')
    loadStructures()
  }

  // ── Pay runs ─────────────────────────────────────────────────
  const [runMonth, setRunMonth] = useState(new Date().toISOString().slice(0, 7))
  async function generatePayRun() {
    setBusy(true)
    setMsg(null)
    const { start, end, label } = monthBounds(runMonth)
    const supabase = sb()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: run, error: runErr } = await supabase.from('pay_runs').insert({
      period_start: start, period_end: end, month_label: label, generated_by: user?.id || null,
    }).select().single()
    if (runErr || !run) { setMsg(`Error: ${runErr?.message || 'could not create pay run'}`); setBusy(false); return }

    const [{ data: liveStructures }, { data: hours }, { data: holidays }, { data: subjs }, { data: scheds }, { data: leaveTypesData }] = await Promise.all([
      supabase.from('staff_salary_structures').select('*').eq('is_active', true),
      supabase.from('center_hours').select('day_of_week, is_closed'),
      supabase.from('staff_holidays').select('holiday_date').gte('holiday_date', start).lte('holiday_date', end),
      supabase.from('subjects').select('id, teacher_id'),
      supabase.from('class_schedules').select('id, subject_id, day_of_week'),
      supabase.from('leave_types').select('id, is_paid'),
    ])

    const holidaySet = new Set((holidays || []).map((h: any) => h.holiday_date))
    const closedDays = new Set((hours || []).filter((h: any) => h.is_closed).map((h: any) => h.day_of_week))
    if (!hours?.length) closedDays.add('Mon') // fallback while center_hours hasn't loaded/been configured
    const unpaidLeaveTypeIds = new Set((leaveTypesData || []).filter((lt: any) => !lt.is_paid).map((lt: any) => lt.id))
    const allDates = datesInRange(start, end)
    const daysInPeriod = allDates.length

    for (const structure of liveStructures || []) {
      const staffId = structure.profile_id
      const [{ data: daily }, { data: leaves }] = await Promise.all([
        supabase.from('staff_attendance_daily').select('work_date,status').eq('profile_id', staffId).gte('work_date', start).lte('work_date', end),
        supabase.from('leave_requests').select('start_date,end_date,is_half_day,leave_type_id').eq('profile_id', staffId).eq('status', 'approved').lte('start_date', end).gte('end_date', start),
      ])
      const dailyByDate = new Map((daily || []).map((d: any) => [d.work_date, d.status]))
      const unpaidLeaveDates = new Set<string>()
      ;(leaves || []).forEach((l: any) => {
        if (!unpaidLeaveTypeIds.has(l.leave_type_id)) return
        const ds = l.is_half_day ? [l.start_date] : datesInRange(l.start_date, l.end_date)
        ds.forEach(d => unpaidLeaveDates.add(d))
      })

      let workingDays = 0, presentCredit = 0, paidLeaveDays = 0, lopDays = 0
      const creditByDate = new Map<string, number>()
      for (const d of allDates) {
        const day = jsDayToAbbr(new Date(d + 'T00:00:00').getDay())
        const isHoliday = holidaySet.has(d)
        if (closedDays.has(day) && !isHoliday) continue // not a working day at all — excluded from both denominators
        workingDays++
        const status = dailyByDate.get(d)
        let credit = 0
        if (isHoliday) credit = 1
        else if (status === 'present') credit = 1
        else if (status === 'half_day') credit = 0.5
        else if (status === 'on_leave') credit = unpaidLeaveDates.has(d) ? 0 : 1
        if (credit > 0) { presentCredit += credit; if (status === 'on_leave') paidLeaveDays += credit }
        else lopDays += 1
        creditByDate.set(d, credit)
      }

      const payableDays = Math.max(0, daysInPeriod - lopDays)
      const monthlyComponent = (structure.pay_type === 'monthly' || structure.pay_type === 'both') && structure.monthly_salary
        ? Math.round((structure.monthly_salary * payableDays) / daysInPeriod) : 0

      let classesTaught = 0
      if ((structure.pay_type === 'per_class' || structure.pay_type === 'both') && structure.per_class_rate) {
        const mySubjectIds = (subjs || []).filter((s: any) => s.teacher_id === staffId).map((s: any) => s.id)
        const mySchedules = (scheds || []).filter((sc: any) => mySubjectIds.includes(sc.subject_id))
        for (const d of allDates) {
          if ((creditByDate.get(d) || 0) <= 0) continue
          const day = jsDayToAbbr(new Date(d + 'T00:00:00').getDay())
          classesTaught += mySchedules.filter((sc: any) => sc.day_of_week === day).length
        }
      }
      const perClassComponent = structure.per_class_rate ? Math.round(structure.per_class_rate * classesTaught) : 0

      await supabase.from('payslips').insert({
        pay_run_id: run.id, profile_id: staffId, pay_type: structure.pay_type,
        working_days: workingDays, present_days: presentCredit, paid_leave_days: paidLeaveDays,
        lop_days: lopDays, classes_taught: classesTaught,
        monthly_component: monthlyComponent, per_class_component: perClassComponent,
        gross_amount: monthlyComponent + perClassComponent,
      })
    }

    setBusy(false)
    setMsg(`✓ Pay run generated for ${label}`)
    loadPayRuns()
    setSelectedRun(run.id)
    loadPayslips(run.id)
    setTab('runs')
  }

  function exportPayslipsCSV() {
    const run = payRuns.find(r => r.id === selectedRun)
    const header = ['Staff', 'Pay Type', 'Working Days', 'Present Days', 'Paid Leave Days', 'LOP Days', 'Classes Taught', 'Monthly Component', 'Per-Class Component', 'Gross Amount']
    const rows = payslips.map((p: any) => [p.profiles?.full_name || '', p.pay_type, p.working_days, p.present_days, p.paid_leave_days, p.lop_days, p.classes_taught, p.monthly_component, p.per_class_component, p.gross_amount])
    const csv = [header, ...rows].map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `payslips_${run?.month_label?.replace(' ', '_') || 'export'}.csv`
    a.click()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-5">
          <Link href="/dashboard" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"><ArrowLeft className="w-4 h-4" /></Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2"><Wallet className="w-5 h-5 text-brand-500" /> Payroll</h1>
            <p className="text-sm text-gray-400 mt-0.5">Salary structures and gross pay runs — leave-aware, no PF/ESI/PT/TDS yet</p>
          </div>
        </div>

        <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit mb-5">
          <button onClick={() => setTab('structures')} className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'structures' ? 'bg-brand-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>Salary Structures</button>
          <button onClick={() => setTab('runs')} className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'runs' ? 'bg-brand-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>Pay Runs</button>
        </div>

        {msg && <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${msg.startsWith('Error') ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>{msg}</div>}

        {tab === 'structures' && (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase">
                <th className="text-left px-4 py-2.5">Staff</th>
                <th className="text-left px-4 py-2.5">Pay Type</th>
                <th className="text-left px-4 py-2.5">Monthly Salary (₹)</th>
                <th className="text-left px-4 py-2.5">Per-Class Rate (₹)</th>
                <th className="px-4 py-2.5"></th>
              </tr></thead>
              <tbody>
                {staff.map((s: any) => {
                  const existing = structures.find(x => x.profile_id === s.id)
                  const f = structForm[s.id]
                  const payType = f?.pay_type ?? existing?.pay_type ?? 'monthly'
                  return (
                    <tr key={s.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{s.full_name}</td>
                      <td className="px-4 py-2.5">
                        <select className="input py-1 text-sm" value={payType} onChange={e => editStruct(s.id, 'pay_type', e.target.value)}>
                          <option value="monthly">Monthly</option>
                          <option value="per_class">Per-Class</option>
                          <option value="both">Both</option>
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        <input type="number" className="input py-1 text-sm w-28" disabled={payType === 'per_class'}
                          value={f?.monthly_salary ?? (existing?.monthly_salary ?? '')} onChange={e => editStruct(s.id, 'monthly_salary', e.target.value)} />
                      </td>
                      <td className="px-4 py-2.5">
                        <input type="number" className="input py-1 text-sm w-28" disabled={payType === 'monthly'}
                          value={f?.per_class_rate ?? (existing?.per_class_rate ?? '')} onChange={e => editStruct(s.id, 'per_class_rate', e.target.value)} />
                      </td>
                      <td className="px-4 py-2.5"><button onClick={() => saveStruct(s.id)} disabled={busy} className="btn btn-sm">Save</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'runs' && (
          <div className="space-y-4">
            <div className="card p-4 flex items-center gap-3">
              <input type="month" className="input w-44" value={runMonth} onChange={e => setRunMonth(e.target.value)} />
              <button onClick={generatePayRun} disabled={busy} className="btn-primary">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Generate Pay Run
              </button>
              <span className="text-xs text-gray-400">Uses attendance + approved leave already on file for that month. Re-running for the same month creates a second run — delete stray ones directly in Supabase if needed.</span>
            </div>

            <div className="flex gap-4">
              <div className="card overflow-hidden w-64 flex-shrink-0">
                <div className="px-4 py-2.5 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase">Pay Runs</div>
                {payRuns.map(r => (
                  <button key={r.id} onClick={() => { setSelectedRun(r.id); loadPayslips(r.id) }}
                    className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-50 last:border-0 ${selectedRun === r.id ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                    {r.month_label}
                  </button>
                ))}
                {payRuns.length === 0 && <div className="px-4 py-6 text-center text-xs text-gray-300">No pay runs yet</div>}
              </div>

              <div className="card overflow-hidden flex-1">
                {selectedRun ? (
                  <>
                    <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-900">{payslips.length} payslip{payslips.length !== 1 ? 's' : ''}</span>
                      <button onClick={exportPayslipsCSV} className="btn btn-sm"><Download className="w-3.5 h-3.5" /> Export CSV</button>
                    </div>
                    <table className="w-full text-xs">
                      <thead><tr className="bg-gray-50 text-gray-400 uppercase">
                        <th className="text-left px-3 py-2">Staff</th>
                        <th className="text-right px-3 py-2">Present</th>
                        <th className="text-right px-3 py-2">Paid Leave</th>
                        <th className="text-right px-3 py-2">LOP</th>
                        <th className="text-right px-3 py-2">Classes</th>
                        <th className="text-right px-3 py-2">Gross</th>
                      </tr></thead>
                      <tbody>
                        {payslips.map((p: any) => (
                          <tr key={p.id} className="border-b border-gray-50 last:border-0">
                            <td className="px-3 py-2 font-medium text-gray-900">{p.profiles?.full_name}</td>
                            <td className="px-3 py-2 text-right">{p.present_days}</td>
                            <td className="px-3 py-2 text-right">{p.paid_leave_days}</td>
                            <td className="px-3 py-2 text-right text-red-500">{p.lop_days}</td>
                            <td className="px-3 py-2 text-right">{p.classes_taught || '—'}</td>
                            <td className="px-3 py-2 text-right font-semibold text-emerald-700">{fmt(p.gross_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : <div className="py-10 text-center text-gray-300 text-sm">Select a pay run</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
