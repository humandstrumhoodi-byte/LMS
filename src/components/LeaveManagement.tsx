'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/client'
import { ArrowLeft, CalendarOff, Check, X, Plus, Loader2 } from 'lucide-react'
import type { Profile, LeaveType, LeaveRequest } from '@/types'

const DAY_ORDER = ['Sun', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Mon']
function jsDayToAbbr(d: number) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d] }

function fyStartStr(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  return `${year}-04-01`
}
function datesInRange(start: string, end: string): string[] {
  const out: string[] = []
  let d = new Date(start + 'T00:00:00')
  const endD = new Date(end + 'T00:00:00')
  while (d <= endD) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1) }
  return out
}
function fmtDate(s: string) { return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

export default function LeaveManagement({ profile }: { profile: Profile }) {
  const isAdmin = profile.role === 'superadmin' || profile.role === 'center_manager'
  const [tab, setTab] = useState<'my' | 'approve' | 'types'>('my')
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([])
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [allApprovedThisYear, setAllApprovedThisYear] = useState<LeaveRequest[]>([])
  const [centerHours, setCenterHours] = useState<any[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function loadLeaveTypes() {
    const { data } = await sb().from('leave_types').select('*').order('name')
    setLeaveTypes(data || [])
  }
  async function loadMyRequests() {
    const { data } = await sb().from('leave_requests').select('*').eq('profile_id', profile.id).order('created_at', { ascending: false })
    setMyRequests(data || [])
    const fy = fyStartStr(new Date().toISOString().slice(0, 10))
    const { data: approved } = await sb().from('leave_requests').select('*').eq('profile_id', profile.id).eq('status', 'approved').gte('start_date', fy)
    setAllApprovedThisYear(approved || [])
  }
  async function loadPending() {
    const { data } = await sb().from('leave_requests').select('*, profiles(full_name), leave_types(name, code)').eq('status', 'pending').order('created_at', { ascending: true })
    setPendingRequests(data || [])
  }
  async function loadCenterHours() {
    const { data } = await sb().from('center_hours').select('day_of_week, is_closed')
    setCenterHours(data || [])
  }

  useEffect(() => { loadLeaveTypes(); loadMyRequests(); loadCenterHours(); if (isAdmin) loadPending() }, [])

  function isClosedDay(day: string): boolean {
    const h = centerHours.find((c: any) => c.day_of_week === day)
    if (h) return !!h.is_closed
    return day === 'Mon' // fallback: Monday is the school's permanent holiday elsewhere in the app
  }

  // ── My Leave: request form ──────────────────────────────────
  const [form, setForm] = useState({ leave_type_id: '', start_date: '', end_date: '', is_half_day: false, reason: '' })
  async function submitRequest() {
    if (!form.leave_type_id || !form.start_date || !form.end_date) return
    if (form.end_date < form.start_date) { setMsg('End date is before start date'); return }
    setBusy(true)
    const { error } = await sb().from('leave_requests').insert({
      profile_id: profile.id,
      leave_type_id: form.leave_type_id,
      start_date: form.start_date,
      end_date: form.is_half_day ? form.start_date : form.end_date,
      is_half_day: form.is_half_day && form.start_date === form.end_date,
      reason: form.reason || null,
    })
    setBusy(false)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setForm({ leave_type_id: '', start_date: '', end_date: '', is_half_day: false, reason: '' })
    setMsg('✓ Leave request submitted')
    loadMyRequests()
  }
  async function cancelRequest(id: string) {
    await sb().from('leave_requests').update({ status: 'cancelled' }).eq('id', id).eq('profile_id', profile.id)
    loadMyRequests()
  }

  // Balance = annual allotment − approved days used this leave-year (Apr–Mar).
  // Computed from the leave_requests ledger directly rather than a separately
  // maintained counter, so it can never drift out of sync.
  function daysForRequest(r: LeaveRequest): number {
    return r.is_half_day ? 0.5 : datesInRange(r.start_date, r.end_date).length
  }
  function balanceFor(lt: LeaveType): { used: number; available: number } {
    const used = allApprovedThisYear.filter(r => r.leave_type_id === lt.id).reduce((a, r) => a + daysForRequest(r), 0)
    return { used, available: Math.max(0, lt.annual_days - used) }
  }

  // ── Admin: review a pending request ─────────────────────────
  async function review(r: any, action: 'approved' | 'rejected') {
    setBusy(true)
    const { data: { user } } = await sb().auth.getUser()
    const { error } = await sb().from('leave_requests').update({
      status: action, reviewed_by: user?.id || null, reviewed_at: new Date().toISOString(),
    }).eq('id', r.id)
    if (error) { setMsg(`Error: ${error.message}`); setBusy(false); return }

    if (action === 'approved') {
      // Mark each covered working day as on_leave in staff_attendance_daily so it
      // feeds payroll and won't be clobbered by the nightly rollup (is_manual_override).
      const dates = r.is_half_day ? [r.start_date] : datesInRange(r.start_date, r.end_date)
      const ltName = r.leave_types?.name || leaveTypes.find(lt => lt.id === r.leave_type_id)?.name || 'Leave'
      for (const d of dates) {
        const day = jsDayToAbbr(new Date(d + 'T00:00:00').getDay())
        if (isClosedDay(day)) continue // don't mark a day the center's already closed
        await sb().from('staff_attendance_daily').upsert({
          profile_id: r.profile_id, work_date: d, status: 'on_leave',
          is_manual_override: true, override_reason: `Leave: ${ltName}`, overridden_by: user?.id || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'profile_id,work_date' })
      }
    }
    setBusy(false)
    loadPending()
    loadMyRequests()
  }

  // ── Admin: leave types ───────────────────────────────────────
  const [typeForm, setTypeForm] = useState({ name: '', code: '', is_paid: true, annual_days: '' })
  async function saveType() {
    if (!typeForm.name.trim() || !typeForm.code.trim()) return
    setBusy(true)
    const { error } = await sb().from('leave_types').insert({
      name: typeForm.name.trim(), code: typeForm.code.trim().toUpperCase(),
      is_paid: typeForm.is_paid, annual_days: +typeForm.annual_days || 0,
    })
    setBusy(false)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setTypeForm({ name: '', code: '', is_paid: true, annual_days: '' })
    loadLeaveTypes()
  }
  async function toggleTypeActive(lt: LeaveType) {
    await sb().from('leave_types').update({ is_active: !lt.is_active }).eq('id', lt.id)
    loadLeaveTypes()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-5">
          <Link href="/dashboard" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"><ArrowLeft className="w-4 h-4" /></Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2"><CalendarOff className="w-5 h-5 text-brand-500" /> Leave</h1>
            <p className="text-sm text-gray-400 mt-0.5">Balances, requests, and approvals</p>
          </div>
        </div>

        <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit mb-5">
          <button onClick={() => setTab('my')} className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'my' ? 'bg-brand-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>My Leave</button>
          {isAdmin && <button onClick={() => setTab('approve')} className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'approve' ? 'bg-brand-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>Approvals {pendingRequests.length > 0 && `(${pendingRequests.length})`}</button>}
          {isAdmin && <button onClick={() => setTab('types')} className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'types' ? 'bg-brand-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>Leave Types</button>}
        </div>

        {msg && <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${msg.startsWith('Error') ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>{msg}</div>}

        {tab === 'my' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {leaveTypes.filter(lt => lt.is_active).map(lt => {
                const { used, available } = balanceFor(lt)
                return (
                  <div key={lt.id} className="card p-4">
                    <div className="text-xs text-gray-400 mb-1">{lt.name} {!lt.is_paid && <span className="text-red-400">(unpaid)</span>}</div>
                    <div className="text-xl font-semibold text-gray-900">{available}<span className="text-sm text-gray-300"> / {lt.annual_days}</span></div>
                    <div className="text-xs text-gray-400 mt-0.5">{used} used this year</div>
                  </div>
                )
              })}
            </div>

            <div className="card p-5">
              <div className="text-sm font-semibold text-gray-900 mb-3">Request Leave</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="label">Leave Type</label>
                  <select className="input" value={form.leave_type_id} onChange={e => setForm(f => ({ ...f, leave_type_id: e.target.value }))}>
                    <option value="">— Select —</option>
                    {leaveTypes.filter(lt => lt.is_active).map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 mt-5">
                  <input type="checkbox" checked={form.is_half_day} onChange={e => setForm(f => ({ ...f, is_half_day: e.target.checked }))} className="rounded border-gray-300 text-brand-500" />
                  <span className="text-sm text-gray-600">Half day</span>
                </label>
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" className="input" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                {!form.is_half_day && (
                  <div>
                    <label className="label">End Date</label>
                    <input type="date" className="input" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                  </div>
                )}
              </div>
              <div className="mb-3">
                <label className="label">Reason (optional)</label>
                <input className="input" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Family function" />
              </div>
              <button onClick={submitRequest} disabled={busy || !form.leave_type_id || !form.start_date} className="btn-primary">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Submit Request
              </button>
            </div>

            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">My Requests</div>
              {myRequests.length === 0 && <div className="py-8 text-center text-gray-300 text-sm">No leave requests yet</div>}
              {myRequests.map(r => {
                const lt = leaveTypes.find(x => x.id === r.leave_type_id)
                return (
                  <div key={r.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{lt?.name || 'Leave'} {r.is_half_day ? '(half day)' : ''}</div>
                      <div className="text-xs text-gray-400">{fmtDate(r.start_date)}{r.end_date !== r.start_date ? ` – ${fmtDate(r.end_date)}` : ''}{r.reason ? ` · ${r.reason}` : ''}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                      {r.status === 'pending' && <button onClick={() => cancelRequest(r.id)} className="text-xs text-gray-400 hover:text-red-500">Cancel</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'approve' && isAdmin && (
          <div className="card overflow-hidden">
            {pendingRequests.length === 0 && <div className="py-10 text-center text-gray-300 text-sm">No pending requests</div>}
            {pendingRequests.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
                <div>
                  <div className="text-sm font-medium text-gray-900">{r.profiles?.full_name} — {r.leave_types?.name}</div>
                  <div className="text-xs text-gray-400">{fmtDate(r.start_date)}{r.end_date !== r.start_date ? ` – ${fmtDate(r.end_date)}` : ''}{r.is_half_day ? ' · half day' : ''}{r.reason ? ` · "${r.reason}"` : ''}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => review(r, 'approved')} disabled={busy} className="btn btn-sm text-emerald-600 border-emerald-200 hover:bg-emerald-50"><Check className="w-3.5 h-3.5" /> Approve</button>
                  <button onClick={() => review(r, 'rejected')} disabled={busy} className="btn btn-sm text-red-500 border-red-200 hover:bg-red-50"><X className="w-3.5 h-3.5" /> Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'types' && isAdmin && (
          <div className="space-y-4">
            <div className="card p-5">
              <div className="text-sm font-semibold text-gray-900 mb-3">Add Leave Type</div>
              <div className="grid grid-cols-4 gap-3 items-end">
                <div><label className="label">Name</label><input className="input" value={typeForm.name} onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Maternity Leave" /></div>
                <div><label className="label">Code</label><input className="input" value={typeForm.code} onChange={e => setTypeForm(f => ({ ...f, code: e.target.value }))} placeholder="ML" /></div>
                <div><label className="label">Annual Days</label><input type="number" className="input" value={typeForm.annual_days} onChange={e => setTypeForm(f => ({ ...f, annual_days: e.target.value }))} /></div>
                <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={typeForm.is_paid} onChange={e => setTypeForm(f => ({ ...f, is_paid: e.target.checked }))} className="rounded border-gray-300 text-brand-500" /><span className="text-sm text-gray-600">Paid</span></label>
              </div>
              <button onClick={saveType} disabled={busy} className="btn-primary mt-3"><Plus className="w-4 h-4" /> Add</button>
            </div>
            <div className="card overflow-hidden">
              {leaveTypes.map(lt => (
                <div key={lt.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{lt.name} <span className="text-xs text-gray-400 font-mono">{lt.code}</span></div>
                    <div className="text-xs text-gray-400">{lt.annual_days} days/year · {lt.is_paid ? 'Paid' : 'Unpaid (LOP)'}</div>
                  </div>
                  <button onClick={() => toggleTypeActive(lt)} className={`btn btn-sm ${lt.is_active ? '' : 'text-gray-400'}`}>{lt.is_active ? 'Active' : 'Inactive'}</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
