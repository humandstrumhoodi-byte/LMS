'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/client'
import { ArrowLeft, Fingerprint, Users, CalendarDays, Upload, AlertTriangle, Check } from 'lucide-react'

type Profile = { id: string; full_name: string; email: string; role: string; biometric_id: string | null }
type Device = { id: string; serial_number: string; name: string; location: string | null; is_active: boolean; last_seen_at: string | null }
type DailyRow = {
  id: string; profile_id: string; work_date: string; first_punch: string | null; last_punch: string | null
  punch_count: number; total_minutes: number; status: string; is_late: boolean
  needs_review: boolean; review_reason: string | null; is_manual_override: boolean
}

const STATUS_COLOR: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-800',
  half_day: 'bg-amber-100 text-amber-800',
  absent: 'bg-red-100 text-red-800',
  on_leave: 'bg-sky-100 text-sky-800',
  holiday: 'bg-gray-100 text-gray-600',
  week_off: 'bg-gray-100 text-gray-600',
}

function todayIST() {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  return ist.toISOString().slice(0, 10)
}

export default function AttendanceBiometric() {
  const [tab, setTab] = useState<'daily' | 'staff' | 'devices' | 'import'>('daily')
  const [staff, setStaff] = useState<Profile[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [date, setDate] = useState(todayIST())
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function loadStaff() {
    const { data } = await sb().from('profiles').select('id, full_name, email, role, biometric_id').order('full_name')
    setStaff(data || [])
  }
  async function loadDevices() {
    const { data } = await sb().from('biometric_devices').select('*').order('created_at')
    setDevices(data || [])
  }
  async function loadDaily(d: string) {
    setLoading(true)
    const { data } = await sb().from('staff_attendance_daily').select('*').eq('work_date', d)
    setDaily(data || [])
    setLoading(false)
  }

  useEffect(() => { loadStaff(); loadDevices() }, [])
  useEffect(() => { loadDaily(date) }, [date])

  async function saveBiometricId(profileId: string, value: string) {
    const v = value.trim() || null
    const { error } = await sb().from('profiles').update({ biometric_id: v }).eq('id', profileId)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setStaff(s => s.map(p => p.id === profileId ? { ...p, biometric_id: v } : p))
  }

  async function addDevice(form: FormData) {
    const serial_number = String(form.get('serial_number') || '').trim()
    const name = String(form.get('name') || '').trim()
    const location = String(form.get('location') || '').trim() || null
    if (!serial_number || !name) return
    const { error } = await sb().from('biometric_devices').insert({ serial_number, name, location })
    if (error) { setMsg(`Error: ${error.message}`); return }
    await loadDevices()
  }

  async function toggleDevice(d: Device) {
    await sb().from('biometric_devices').update({ is_active: !d.is_active }).eq('id', d.id)
    await loadDevices()
  }

  async function overrideStatus(row: DailyRow, status: string) {
    const reason = window.prompt('Reason for manual override? (shown in audit trail)') || ''
    const { data: { user } } = await sb().auth.getUser()
    const { error } = await sb().from('staff_attendance_daily').update({
      status, needs_review: false, is_manual_override: true,
      override_reason: reason, overridden_by: user?.id, updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    await loadDaily(date)
  }

  const [importSerial, setImportSerial] = useState('')
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState<string | null>(null)
  async function runImport() {
    setImportResult('Importing…')
    const res = await fetch('/api/attendance/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceSerial: importSerial, raw: importText }),
    })
    const json = await res.json()
    if (!res.ok) { setImportResult(`Error: ${json.error}`); return }
    setImportResult(`Imported ${json.inserted} punch(es), ${json.unmatched} unmatched to a staff biometric ID.`)
  }

  const nameFor = (id: string) => staff.find(p => p.id === id)?.full_name || id
  const flaggedCount = daily.filter(d => d.needs_review).length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="btn btn-sm"><ArrowLeft size={14} /> Dashboard</Link>
          <h1 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Fingerprint size={18} className="text-brand-500" /> Staff Attendance — Biometric
          </h1>
        </div>

        {msg && (
          <div className="mb-4 px-4 py-2.5 rounded-lg bg-amber-50 text-amber-800 text-sm border border-amber-100" onClick={() => setMsg(null)}>{msg}</div>
        )}

        <div className="flex gap-2 mb-5">
          {[
            { k: 'daily', label: 'Daily attendance', icon: CalendarDays },
            { k: 'staff', label: 'Staff mapping', icon: Users },
            { k: 'devices', label: 'Devices', icon: Fingerprint },
            { k: 'import', label: 'Manual import', icon: Upload },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k as any)}
              className={`btn btn-sm ${tab === t.k ? 'btn-primary' : ''}`}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'daily' && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <input type="date" className="input w-auto" value={date} onChange={e => setDate(e.target.value)} />
                {flaggedCount > 0 && (
                  <span className="badge bg-amber-100 text-amber-800"><AlertTriangle size={12} className="mr-1" />{flaggedCount} need review</span>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>
                  <th className="th">Staff</th><th className="th">First punch</th><th className="th">Last punch</th>
                  <th className="th">Punches</th><th className="th">Hours</th><th className="th">Status</th><th className="th">Flags</th><th className="th"></th>
                </tr></thead>
                <tbody>
                  {loading && <tr><td className="td" colSpan={8}>Loading…</td></tr>}
                  {!loading && daily.length === 0 && <tr><td className="td text-gray-400" colSpan={8}>No attendance rows for this date yet — the nightly rollup runs after midnight IST, or run it manually via /api/attendance/rollup.</td></tr>}
                  {daily.map(row => (
                    <tr key={row.id}>
                      <td className="td font-medium text-gray-800">{nameFor(row.profile_id)}</td>
                      <td className="td">{row.first_punch ? new Date(row.first_punch).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td className="td">{row.last_punch ? new Date(row.last_punch).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td className="td">{row.punch_count}</td>
                      <td className="td">{(row.total_minutes / 60).toFixed(1)}h</td>
                      <td className="td"><span className={`badge ${STATUS_COLOR[row.status] || ''}`}>{row.status.replace('_', ' ')}</span></td>
                      <td className="td">
                        {row.is_late && <span className="badge bg-orange-100 text-orange-700 mr-1">late</span>}
                        {row.needs_review && <span className="badge bg-amber-100 text-amber-800">{row.review_reason?.replace('_', ' ')}</span>}
                        {row.is_manual_override && <span className="badge bg-violet-100 text-violet-700 ml-1"><Check size={10} className="mr-0.5" />overridden</span>}
                      </td>
                      <td className="td">
                        <select className="input py-1 text-xs" defaultValue="" onChange={e => { if (e.target.value) { overrideStatus(row, e.target.value); e.target.value = '' } }}>
                          <option value="" disabled>Correct…</option>
                          <option value="present">Present</option>
                          <option value="half_day">Half day</option>
                          <option value="absent">Absent</option>
                          <option value="on_leave">On leave</option>
                          <option value="holiday">Holiday</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'staff' && (
          <div className="card p-5">
            <p className="text-sm text-gray-500 mb-4">Enter the enrollment ID/PIN each staff member was assigned on the K40 Pro (set when enrolling their fingerprint on the device itself). Punches only match a staff member once this is filled in.</p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className="th">Name</th><th className="th">Role</th><th className="th">Biometric ID / PIN</th></tr></thead>
                <tbody>
                  {staff.map(p => (
                    <tr key={p.id}>
                      <td className="td font-medium text-gray-800">{p.full_name}<div className="text-xs text-gray-400">{p.email}</div></td>
                      <td className="td capitalize">{p.role.replace('_', ' ')}</td>
                      <td className="td">
                        <input className="input w-40" defaultValue={p.biometric_id || ''}
                          onBlur={e => { if (e.target.value !== (p.biometric_id || '')) saveBiometricId(p.id, e.target.value) }}
                          placeholder="e.g. 1001" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'devices' && (
          <div className="card p-5">
            <div className="overflow-x-auto mb-6">
              <table className="w-full">
                <thead><tr><th className="th">Name</th><th className="th">Serial (SN)</th><th className="th">Location</th><th className="th">Last seen</th><th className="th">Active</th></tr></thead>
                <tbody>
                  {devices.map(d => (
                    <tr key={d.id}>
                      <td className="td font-medium text-gray-800">{d.name}</td>
                      <td className="td font-mono text-xs">{d.serial_number}</td>
                      <td className="td">{d.location || '—'}</td>
                      <td className="td">{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'never'}</td>
                      <td className="td"><button className={`badge cursor-pointer ${d.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`} onClick={() => toggleDevice(d)}>{d.is_active ? 'active' : 'disabled'}</button></td>
                    </tr>
                  ))}
                  {devices.length === 0 && <tr><td className="td text-gray-400" colSpan={5}>No devices registered yet — add the K40 Pro's serial number below (find it under Menu → System Info on the device).</td></tr>}
                </tbody>
              </table>
            </div>
            <form action={addDevice} className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
              <div><label className="label">Device name</label><input name="name" className="input w-44" placeholder="Front desk K40 Pro" required /></div>
              <div><label className="label">Serial number (SN)</label><input name="serial_number" className="input w-44" placeholder="From device Menu → System Info" required /></div>
              <div><label className="label">Location</label><input name="location" className="input w-40" placeholder="Hoodi center" /></div>
              <button className="btn-primary" type="submit">Add device</button>
            </form>
          </div>
        )}

        {tab === 'import' && (
          <div className="card p-5 space-y-4">
            <p className="text-sm text-gray-500">
              Paste punch records exported from the device (USB pendrive .dat file opened in a text editor, or copied from the
              ZKTeco desktop software) — one record per line, tab-separated: <code className="bg-gray-100 px-1 rounded">PIN&nbsp;&nbsp;TIME&nbsp;&nbsp;STATUS&nbsp;&nbsp;VERIFY</code>.
              Use this to backfill before ADMS push is confirmed working, or after a network outage.
            </p>
            <div>
              <label className="label">Device serial number</label>
              <select className="input w-64" value={importSerial} onChange={e => setImportSerial(e.target.value)}>
                <option value="">Select device…</option>
                {devices.map(d => <option key={d.id} value={d.serial_number}>{d.name} ({d.serial_number})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Punch log text</label>
              <textarea className="input font-mono text-xs" rows={10} value={importText} onChange={e => setImportText(e.target.value)}
                placeholder={'1001\t2026-09-05 09:31:02\t0\t1\n1001\t2026-09-05 18:04:11\t1\t1'} />
            </div>
            <button className="btn-primary" onClick={runImport} disabled={!importSerial || !importText.trim()}>Import punches</button>
            {importResult && <div className="text-sm text-gray-600">{importResult}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
