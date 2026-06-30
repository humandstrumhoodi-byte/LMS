'use client'
import { useState, useEffect } from 'react'
import { Music, Mail, KeyRound, Eye, EyeOff, Loader2, LogOut, CalendarDays, Receipt, CheckCircle, Clock, AlertCircle, ChevronRight, X, CreditCard, User, BookOpen, Home } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────
const DAY_ORDER = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const fmt = (n: number) => '₹' + (n || 0).toLocaleString('en-IN')
const UPI_ID = 'truetoneacademy@sbi'

function clx(...args: any[]) { return args.filter(Boolean).join(' ') }

// ── Status helpers ────────────────────────────────────────────
function PayStatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase()
  return (
    <span className={clx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
      s === 'paid' ? 'bg-emerald-100 text-emerald-700' :
      s === 'overdue' ? 'bg-red-100 text-red-700' :
      'bg-amber-100 text-amber-700'
    )}>
      {s === 'paid' ? '✓ ' : s === 'overdue' ? '! ' : '○ '}{status}
    </span>
  )
}

function AttBadge({ status }: { status: string }) {
  const map: Record<string,string> = {
    present: 'bg-emerald-100 text-emerald-700',
    absent: 'bg-amber-100 text-amber-700',
    absent_billable: 'bg-red-100 text-red-700',
    late: 'bg-blue-100 text-blue-700',
  }
  const labels: Record<string,string> = { present: 'Present', absent: 'Absent', absent_billable: 'Absent (billable)', late: 'Late' }
  return <span className={clx('px-2 py-0.5 rounded-full text-xs font-semibold', map[status] || 'bg-gray-100 text-gray-500')}>{labels[status] || status}</span>
}

// ── UPI Payment Modal ─────────────────────────────────────────
function PayModal({ payment, onClose }: { payment: any, onClose: () => void }) {
  const amount = payment.amount
  const upiStr = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent('Hum and Strum')}&am=${amount}&cu=INR&tn=${encodeURIComponent(`INV-${payment.invoice_number || payment.id.slice(0,6)}`)}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiStr)}`

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-gray-900">Pay Now</h3>
            <p className="text-sm text-gray-500">{payment.subjects?.name || payment.description || 'Fee Payment'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"><X className="w-4 h-4"/></button>
        </div>

        <div className="text-center mb-5">
          <div className="text-3xl font-black text-gray-900 mb-1">{fmt(amount)}</div>
          <div className="text-sm text-gray-400">{payment.month_label}</div>
        </div>

        {/* QR Code */}
        <div className="flex justify-center mb-4">
          <div className="bg-white p-3 rounded-2xl border-2 border-purple-100 shadow-sm">
            <img src={qrUrl} alt="UPI QR" width={180} height={180} className="rounded-xl block"/>
          </div>
        </div>
        <p className="text-center text-xs text-gray-400 mb-4">Scan with any UPI app — PhonePe, GPay, Paytm</p>

        {/* UPI ID */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4 text-center">
          <div className="text-xs text-emerald-600 font-semibold uppercase tracking-wide mb-1">Or pay to UPI ID</div>
          <div className="text-lg font-black text-emerald-800 font-mono">{UPI_ID}</div>
          <div className="text-xs text-emerald-600 mt-0.5">State Bank of India</div>
        </div>

        {/* Deep link button for mobile */}
        <a href={upiStr} className="block w-full bg-purple-600 text-white text-center py-3.5 rounded-2xl font-bold text-base active:bg-purple-700 transition-colors">
          Open UPI App →
        </a>
        <p className="text-center text-xs text-gray-400 mt-3">After payment, inform the academy to update your records.</p>
      </div>
    </div>
  )
}

// ── Reschedule Request Modal ──────────────────────────────────
const RESCHED_DAYS = ['Sun','Tue','Wed','Thu','Fri','Sat']
const RESCHED_DAY_LABELS: Record<string,string> = { Sun:'Sunday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday' }

function RescheduleModal({ modal, setModal, onSubmit, busy }: { modal: any, setModal: any, onSubmit: () => void, busy: boolean }) {
  const cls = modal.cls
  const slotsByDay: Record<string, any[]> = {}
  RESCHED_DAYS.forEach(d => { slotsByDay[d] = modal.freeSlots.filter((s: any) => s.day === d) })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setModal(null)}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">Reschedule Class</h3>
            <p className="text-sm text-gray-500">{cls.subjects?.name} · Currently {cls.day_of_week} {cls.start_time?.slice(0,5)}</p>
          </div>
          <button onClick={() => setModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"><X className="w-4 h-4"/></button>
        </div>

        {modal.error && <div className="mb-4 px-3 py-2.5 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{modal.error}</div>}

        {modal.loading ? (
          <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-purple-500 mx-auto mb-2"/><div className="text-sm text-gray-400">Loading available slots…</div></div>
        ) : (
          <>
            <div className="space-y-4 mb-5">
              {RESCHED_DAYS.map(day => {
                const free = slotsByDay[day]?.filter(s => s.status === 'free') || []
                if (!free.length) return null
                return (
                  <div key={day}>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{RESCHED_DAY_LABELS[day]}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {free.map((s: any) => {
                        const selected = modal.selectedDay === day && modal.selectedTime === s.time
                        return (
                          <button key={s.time}
                            onClick={() => setModal((m: any) => ({ ...m, selectedDay: day, selectedTime: s.time, error: '' }))}
                            className={clx('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                              selected ? 'bg-purple-600 text-white border-purple-600' : 'bg-emerald-50 text-emerald-700 border-emerald-100 active:bg-emerald-100'
                            )}>
                            {s.time}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {!modal.freeSlots.some((s: any) => s.status === 'free') && (
                <div className="text-center text-sm text-gray-400 py-6">No free slots available right now. Please check back later or contact the academy.</div>
              )}
            </div>

            {modal.selectedDay && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-4 text-sm text-purple-700">
                Requesting: <strong>{RESCHED_DAY_LABELS[modal.selectedDay]} at {modal.selectedTime}</strong>
              </div>
            )}

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason (optional)</label>
              <textarea
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                rows={2}
                placeholder="e.g. School exam clash this week"
                value={modal.reason}
                onChange={e => setModal((m: any) => ({ ...m, reason: e.target.value }))}
              />
            </div>

            <button
              onClick={onSubmit}
              disabled={busy || !modal.selectedDay || !modal.selectedTime}
              className="w-full bg-purple-600 text-white py-3.5 rounded-2xl font-bold text-sm disabled:opacity-40 active:bg-purple-700 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : null}
              {busy ? 'Submitting…' : 'Submit Reschedule Request'}
            </button>
            <p className="text-center text-xs text-gray-400 mt-3">The academy will review and confirm your new slot.</p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Portal ───────────────────────────────────────────────
export default function StudentPortal() {
  const [screen, setScreen] = useState<'login'|'otp'|'portal'>('login')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpDigits, setOtpDigits] = useState(['','','','','',''])
  const [name, setName] = useState('')
  const [token, setToken] = useState('')
  const [student, setStudent] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [attendance, setAttendance] = useState<any[]>([])
  const [schedule, setSchedule] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'home'|'schedule'|'fees'|'attendance'|'profile'>('home')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [payModal, setPayModal] = useState<any>(null)
  const [devOtp, setDevOtp] = useState('')
  const [myRequests, setMyRequests] = useState<any[]>([])
  const [rescheduleModal, setRescheduleModal] = useState<any>(null)

  // Restore session from localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem('hs_student_token')
    if (savedToken) {
      setToken(savedToken)
      loadPortal(savedToken)
    }
  }, [])

  async function loadPortal(tok: string) {
    setBusy(true)
    try {
      const [me, pay, att, sch, rr] = await Promise.all([
        fetch(`/api/student/auth?action=me&token=${tok}`).then(r => r.json()),
        fetch(`/api/student/auth?action=payments&token=${tok}`).then(r => r.json()),
        fetch(`/api/student/auth?action=attendance&token=${tok}`).then(r => r.json()),
        fetch(`/api/student/auth?action=schedule&token=${tok}`).then(r => r.json()),
        fetch(`/api/student/reschedule?token=${tok}`).then(r => r.json()),
      ])
      if (!me.ok) { localStorage.removeItem('hs_student_token'); setScreen('login'); setBusy(false); return }
      setStudent(me.student)
      setPayments(pay.payments || [])
      setAttendance(att.attendance || [])
      setSchedule(sch.schedules || [])
      setMyRequests(rr.requests || [])
      setScreen('portal')
    } catch {}
    setBusy(false)
  }

  function openReschedule(cls: any) {
    setRescheduleModal({ cls, freeSlots: [], loading: true, selectedDay: '', selectedTime: '', reason: '' })
    fetch(`/api/student/auth?action=free_slots&token=${token}&subject_id=${cls.subject_id}`)
      .then(r => r.json())
      .then(d => setRescheduleModal((m: any) => ({ ...m, freeSlots: d.slots || [], loading: false })))
  }

  async function submitReschedule() {
    if (!rescheduleModal?.selectedDay || !rescheduleModal?.selectedTime) return
    setBusy(true)
    const r = await fetch('/api/student/reschedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token, schedule_id: rescheduleModal.cls.id,
        requested_day: rescheduleModal.selectedDay,
        requested_time: rescheduleModal.selectedTime,
        reason: rescheduleModal.reason,
      })
    })
    const d = await r.json()
    setBusy(false)
    if (!r.ok) { setRescheduleModal((m: any) => ({ ...m, error: d.error })); return }
    setRescheduleModal(null)
    loadPortal(token)
  }

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const r = await fetch('/api/student/auth?action=request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error); setBusy(false); return }
      setName(d.name)
      if (d.dev) setDevOtp(d.dev) // show OTP if no email configured
      setScreen('otp')
    } catch { setErr('Network error') }
    setBusy(false)
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    const code = otpDigits.join('')
    try {
      const r = await fetch('/api/student/auth?action=verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, otp: code }) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error); setBusy(false); return }
      localStorage.setItem('hs_student_token', d.token)
      setToken(d.token)
      setStudent(d.student)
      await loadPortal(d.token)
    } catch { setErr('Network error') }
    setBusy(false)
  }

  async function logout() {
    await fetch('/api/student/auth?action=logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
    localStorage.removeItem('hs_student_token')
    setScreen('login'); setStudent(null); setToken(''); setEmail(''); setOtpDigits(['','','','','',''])
  }

  // OTP digit input handler
  function handleOtpDigit(i: number, val: string) {
    if (!/^\d*$/.test(val)) return
    const next = [...otpDigits]
    next[i] = val.slice(-1)
    setOtpDigits(next)
    if (val && i < 5) {
      const el = document.getElementById(`otp-${i+1}`)
      el?.focus()
    }
  }

  function handleOtpKey(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otpDigits[i] && i > 0) {
      document.getElementById(`otp-${i-1}`)?.focus()
    }
  }

  // ── Computed stats ────────────────────────────────────────────
  const pendingPayments = payments.filter(p => p.status === 'pending' || p.status === 'overdue')
  const paidTotal = payments.filter(p => p.status === 'paid').reduce((a, p) => a + p.amount, 0)
  const pendingTotal = pendingPayments.reduce((a, p) => a + p.amount, 0)
  const attPresent = attendance.filter(a => a.status === 'present').length
  const attTotal = attendance.length
  const attRate = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : 0
  const subjects = (student?.student_subjects || []).map((ss: any) => ss.subjects).filter(Boolean)

  // Group payments by month
  const payByMonth: Record<string, any[]> = {}
  payments.forEach(p => {
    const key = p.month_label || 'Other'
    if (!payByMonth[key]) payByMonth[key] = []
    payByMonth[key].push(p)
  })

  // Sort schedule by day
  const sortedSchedule = [...schedule].sort((a, b) => DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week))

  const TODAY_DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()]

  // ── LOGIN SCREEN ──────────────────────────────────────────────
  if (screen === 'login') return (
    <div className="min-h-screen bg-gradient-to-br from-[#2D1B69] via-[#3B1F8C] to-[#4A2FA0] flex flex-col items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Hum &amp; Strum" className="w-24 h-24 rounded-full mx-auto mb-4 object-cover border-4 border-white/20 shadow-xl"/>
          <h1 className="text-2xl font-bold text-white">Hum &amp; Strum</h1>
          <p className="text-white/60 text-sm mt-1">Student Portal</p>
        </div>

        <div className="bg-white rounded-3xl p-7 shadow-2xl">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Sign in</h2>
          <p className="text-sm text-gray-400 mb-6">Enter your registered email to receive a login code</p>
          {err && <div className="mb-4 px-3 py-2.5 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{err}</div>}
          <form onSubmit={requestOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
                <input
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>
            <button type="submit" disabled={busy || !email} className="w-full bg-[#3B1F8C] text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-50 active:opacity-80 transition-opacity flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <KeyRound className="w-4 h-4"/>}
              {busy ? 'Sending code…' : 'Send Login Code'}
            </button>
          </form>
        </div>

        <p className="text-center text-white/40 text-xs mt-6">Your email must be registered with the academy</p>
      </div>
    </div>
  )

  // ── OTP SCREEN ────────────────────────────────────────────────
  if (screen === 'otp') return (
    <div className="min-h-screen bg-gradient-to-br from-[#2D1B69] via-[#3B1F8C] to-[#4A2FA0] flex flex-col items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Hum &amp; Strum" className="w-20 h-20 rounded-full mx-auto mb-4 object-cover border-4 border-white/20 shadow-xl"/>
          <h1 className="text-2xl font-bold text-white">Hum &amp; Strum</h1>
        </div>

        <div className="bg-white rounded-3xl p-7 shadow-2xl">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Enter your code</h2>
          <p className="text-sm text-gray-400 mb-2">Hi {name}! We sent a 6-digit code to</p>
          <p className="text-sm font-semibold text-purple-700 mb-5">{email}</p>

          {devOtp && (
            <div className="mb-4 px-3 py-2.5 bg-amber-50 text-amber-700 text-sm rounded-xl border border-amber-200">
              Dev mode — OTP: <strong className="font-mono">{devOtp}</strong>
            </div>
          )}
          {err && <div className="mb-4 px-3 py-2.5 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{err}</div>}

          <form onSubmit={verifyOtp}>
            {/* 6-digit OTP boxes */}
            <div className="flex gap-2 mb-6 justify-center">
              {otpDigits.map((d, i) => (
                <input
                  key={i}
                  id={`otp-${i}`}
                  type="text" inputMode="numeric" maxLength={1}
                  value={d}
                  onChange={e => handleOtpDigit(i, e.target.value)}
                  onKeyDown={e => handleOtpKey(i, e)}
                  className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 focus:outline-none transition-colors"
                />
              ))}
            </div>
            <button type="submit" disabled={busy || otpDigits.join('').length < 6}
              className="w-full bg-[#3B1F8C] text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4"/>}
              {busy ? 'Verifying…' : 'Verify & Sign In'}
            </button>
          </form>

          <button onClick={() => { setScreen('login'); setErr(''); setOtpDigits(['','','','','','']) }}
            className="w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-4">
            ← Use a different email
          </button>
          <button onClick={requestOtp} disabled={busy}
            className="w-full text-center text-sm text-purple-600 hover:text-purple-800 mt-2">
            Resend code
          </button>
        </div>
      </div>
    </div>
  )

  // ── PORTAL SCREEN ─────────────────────────────────────────────
  if (screen === 'portal' && student) return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      {payModal && <PayModal payment={payModal} onClose={() => setPayModal(null)}/>}
      {rescheduleModal && <RescheduleModal modal={rescheduleModal} setModal={setRescheduleModal} onSubmit={submitReschedule} busy={busy}/>}

      {/* Top bar */}
      <div className="bg-[#3B1F8C] px-4 pt-10 pb-16">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="w-9 h-9 rounded-full object-cover border-2 border-white/20"/>
            <div>
              <div className="text-white/60 text-xs">Welcome back</div>
              <div className="text-white font-bold text-lg">{student.full_name.split(' ')[0]} 👋</div>
            </div>
          </div>
          <button onClick={logout} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20">
            <LogOut className="w-4 h-4"/>
          </button>
        </div>
      </div>

      {/* Cards float over top bar */}
      <div className="px-4 -mt-10 mb-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
            <div className="text-xl font-black text-[#3B1F8C]">{fmt(paidTotal)}</div>
            <div className="text-xs text-gray-400 mt-0.5">Total Paid</div>
          </div>
          <div className={clx('rounded-2xl p-3 shadow-sm text-center', pendingTotal > 0 ? 'bg-amber-500' : 'bg-white')}>
            <div className={clx('text-xl font-black', pendingTotal > 0 ? 'text-white' : 'text-gray-400')}>{fmt(pendingTotal)}</div>
            <div className={clx('text-xs mt-0.5', pendingTotal > 0 ? 'text-white/70' : 'text-gray-400')}>Pending</div>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
            <div className="text-xl font-black text-emerald-600">{attRate}%</div>
            <div className="text-xs text-gray-400 mt-0.5">Attendance</div>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">

        {/* ── HOME ── */}
        {activeTab === 'home' && (
          <div className="space-y-4">
            {/* Pending alert */}
            {pendingPayments.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-amber-600"/>
                  <div className="text-sm font-bold text-amber-800">{pendingPayments.length} payment{pendingPayments.length > 1 ? 's' : ''} pending</div>
                </div>
                {pendingPayments.slice(0, 2).map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-t border-amber-100">
                    <div>
                      <div className="text-sm font-medium text-amber-900">{p.subjects?.name || p.description || 'Fee'}</div>
                      <div className="text-xs text-amber-600">{p.month_label}</div>
                    </div>
                    <button onClick={() => setPayModal(p)} className="bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl">
                      Pay {fmt(p.amount)}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Today's classes */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Today's Classes</div>
              {sortedSchedule.filter(s => s.day_of_week === TODAY_DAY).length === 0
                ? <div className="text-sm text-gray-400 py-4 text-center">No classes today 🎉</div>
                : sortedSchedule.filter(s => s.day_of_week === TODAY_DAY).map(cls => (
                    <div key={cls.id} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                      <div className="w-10 h-10 bg-[#f0f0ff] rounded-xl flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">🎵</span>
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 text-sm">{cls.subjects?.name}</div>
                        <div className="text-xs text-gray-400">{cls.start_time?.slice(0,5)} · {cls.duration_minutes} min</div>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-emerald-400"/>
                    </div>
                  ))
              }
            </div>

            {/* My instruments */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">My Instruments</div>
              {subjects.length === 0
                ? <div className="text-sm text-gray-400">No instruments enrolled yet</div>
                : <div className="flex flex-wrap gap-2">
                    {subjects.map((s: any) => (
                      <div key={s.name} className="flex items-center gap-2 bg-[#f0f0ff] rounded-xl px-3 py-2">
                        <span className="text-base">🎸</span>
                        <span className="text-sm font-semibold text-[#3B1F8C]">{s.name}</span>
                      </div>
                    ))}
                  </div>
              }
            </div>

            {/* Recent attendance */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Recent Attendance</div>
              {attendance.slice(0, 4).map(a => (
                <div key={a.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{(a.class_schedules as any)?.subjects?.name || 'Class'}</div>
                    <div className="text-xs text-gray-400">{a.class_date}</div>
                  </div>
                  <AttBadge status={a.status}/>
                </div>
              ))}
              {!attendance.length && <div className="text-sm text-gray-400 text-center py-4">No attendance records yet</div>}
            </div>
          </div>
        )}

        {/* ── SCHEDULE ── */}
        {activeTab === 'schedule' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mt-1">
              <h2 className="font-bold text-gray-900">My Schedule</h2>
              {myRequests.filter(r => r.status === 'pending').length > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2.5 py-1 rounded-full">
                  {myRequests.filter(r => r.status === 'pending').length} pending
                </span>
              )}
            </div>
            {sortedSchedule.length === 0
              ? <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-gray-400">No classes scheduled yet</div>
              : DAY_ORDER.filter(d => sortedSchedule.some(s => s.day_of_week === d)).map(day => (
                  <div key={day}>
                    <div className={clx('text-xs font-bold uppercase tracking-widest mb-2', day === TODAY_DAY ? 'text-purple-600' : 'text-gray-400')}>
                      {day === TODAY_DAY ? '⚡ ' : ''}{day}{day === TODAY_DAY ? ' — Today' : ''}
                    </div>
                    {sortedSchedule.filter(s => s.day_of_week === day).map(cls => {
                      const pendingReq = myRequests.find(r => r.schedule_id === cls.id && r.status === 'pending')
                      return (
                        <div key={cls.id} className="bg-white rounded-2xl p-4 shadow-sm mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-[#f0f0ff] rounded-xl flex items-center justify-center flex-shrink-0">
                              <span className="text-2xl">🎵</span>
                            </div>
                            <div className="flex-1">
                              <div className="font-bold text-gray-900">{cls.subjects?.name}</div>
                              <div className="text-sm text-gray-500">{cls.start_time?.slice(0,5)} · {cls.duration_minutes} min</div>
                            </div>
                            {day === TODAY_DAY && <div className="flex flex-col items-end"><div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"/><div className="text-xs text-emerald-600 mt-0.5">Today</div></div>}
                          </div>
                          {pendingReq ? (
                            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
                              ⏳ Reschedule to <strong>{pendingReq.requested_day} {pendingReq.requested_time?.slice(0,5)}</strong> pending approval
                            </div>
                          ) : (
                            <button onClick={() => openReschedule(cls)} className="mt-3 w-full text-center text-xs font-semibold text-purple-600 bg-purple-50 py-2 rounded-xl active:bg-purple-100">
                              🔄 Request Reschedule
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))
            }

            {/* Past requests */}
            {myRequests.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Reschedule History</div>
                {myRequests.map(r => (
                  <div key={r.id} className="bg-white rounded-2xl p-3.5 mb-2 shadow-sm flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-800">{r.subjects?.name}</div>
                      <div className="text-xs text-gray-400">{r.current_day} {r.current_slot_time?.slice(0,5)} → {r.requested_day} {r.requested_time?.slice(0,5)}</div>
                    </div>
                    <span className={clx('px-2 py-0.5 rounded-full text-xs font-semibold',
                      r.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                      r.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    )}>{r.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── FEES ── */}
        {activeTab === 'fees' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <div className="text-xs text-emerald-600 font-bold uppercase mb-1">Total Paid</div>
                <div className="text-2xl font-black text-emerald-700">{fmt(paidTotal)}</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="text-xs text-amber-600 font-bold uppercase mb-1">Pending</div>
                <div className="text-2xl font-black text-amber-700">{fmt(pendingTotal)}</div>
              </div>
            </div>

            {pendingPayments.length > 0 && (
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Pay Now</div>
                {pendingPayments.map(p => (
                  <div key={p.id} className="bg-white border border-amber-100 rounded-2xl p-4 mb-2 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-bold text-gray-900">{p.subjects?.name || p.description || 'Fee'}</div>
                        <div className="text-sm text-gray-400">{p.month_label}</div>
                      </div>
                      <PayStatusBadge status={p.status}/>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-black text-gray-900">{fmt(p.amount)}</div>
                      <button onClick={() => setPayModal(p)} className="bg-[#3B1F8C] text-white font-bold text-sm px-5 py-2.5 rounded-xl flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4"/> Pay
                      </button>
                    </div>
                    {p.invoice_number && <div className="text-xs text-gray-400 mt-2">Invoice #{p.invoice_number}</div>}
                  </div>
                ))}
              </div>
            )}

            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Payment History</div>
              {Object.entries(payByMonth).map(([month, monthPay]) => (
                <div key={month} className="mb-3">
                  <div className="text-xs font-semibold text-gray-500 mb-2">{month}</div>
                  {(monthPay as any[]).map(p => (
                    <div key={p.id} className="bg-white rounded-2xl p-3.5 mb-1.5 shadow-sm flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-gray-900 text-sm">{p.subjects?.name || p.description || 'Fee'}</div>
                        <div className="text-xs text-gray-400">{p.payment_date || '—'} · {p.mode_of_payment || 'UPI'}</div>
                        {p.invoice_number && <div className="text-xs text-gray-300">#{p.invoice_number}</div>}
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-gray-900">{fmt(p.amount)}</div>
                        <PayStatusBadge status={p.status}/>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {!payments.length && <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-gray-400">No payment history yet</div>}
            </div>
          </div>
        )}

        {/* ── ATTENDANCE ── */}
        {activeTab === 'attendance' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Present', val: attPresent, color: 'bg-emerald-50 text-emerald-700' },
                { label: 'Absent', val: attendance.filter(a => a.status === 'absent').length, color: 'bg-amber-50 text-amber-700' },
                { label: 'Rate', val: `${attRate}%`, color: 'bg-purple-50 text-purple-700' },
              ].map(s => (
                <div key={s.label} className={clx('rounded-2xl p-3 text-center', s.color)}>
                  <div className="text-xl font-black">{s.val}</div>
                  <div className="text-xs opacity-70 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Attendance Log</div>
              {attendance.length === 0
                ? <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-gray-400">No attendance records yet</div>
                : attendance.map(a => (
                    <div key={a.id} className="bg-white rounded-2xl p-4 mb-2 shadow-sm flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0">
                          <span className="text-lg">{a.status === 'present' ? '✅' : a.status === 'late' ? '⏰' : '❌'}</span>
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900 text-sm">{(a.class_schedules as any)?.subjects?.name || 'Class'}</div>
                          <div className="text-xs text-gray-400">{a.class_date} · {(a.class_schedules as any)?.start_time?.slice(0,5)}</div>
                        </div>
                      </div>
                      <AttBadge status={a.status}/>
                    </div>
                  ))
              }
            </div>
          </div>
        )}

        {/* ── PROFILE ── */}
        {activeTab === 'profile' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
              <div className="w-16 h-16 bg-[#f0f0ff] rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl font-black text-[#3B1F8C]">{student.full_name.charAt(0)}</span>
              </div>
              <div className="font-bold text-gray-900 text-lg">{student.full_name}</div>
              {student.student_id_ext && <div className="text-xs text-gray-400 mt-0.5">Student ID: #{student.student_id_ext}</div>}
              <div className={clx('inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold',
                student.status === 'Active' ? 'bg-emerald-100 text-emerald-700' :
                student.status === 'Trial' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
              )}>{student.status || 'Active'}</div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">My Details</div>
              {[
                ['Email', student.email],
                ['Phone', student.phone],
                ['Date of Birth', student.date_of_birth],
                ['Gender', student.gender],
                ['City', student.city],
                ['Area', student.area],
                ['Guardian', student.guardian_name],
                ['Guardian Phone', student.guardian_phone],
                ['Joined', student.joined_date],
              ].filter(([,v]) => v).map(([k,v]) => (
                <div key={k} className="flex justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-400">{k}</span>
                  <span className="text-sm font-medium text-gray-800">{v}</span>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Enrolled Instruments</div>
              {subjects.map((s: any) => (
                <div key={s.name} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <span className="text-lg">🎵</span>
                  <span className="font-medium text-gray-800">{s.name}</span>
                </div>
              ))}
            </div>

            <button onClick={logout} className="w-full bg-white border border-red-100 text-red-500 font-semibold py-3.5 rounded-2xl shadow-sm flex items-center justify-center gap-2">
              <LogOut className="w-4 h-4"/> Sign Out
            </button>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t border-gray-100 px-2 py-2 flex items-center justify-around safe-area-inset-bottom shadow-lg">
        {[
          { id: 'home', icon: Home, label: 'Home' },
          { id: 'schedule', icon: CalendarDays, label: 'Schedule' },
          { id: 'fees', icon: Receipt, label: 'Fees', badge: pendingPayments.length },
          { id: 'attendance', icon: CheckCircle, label: 'Attendance' },
          { id: 'profile', icon: User, label: 'Profile' },
        ].map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              className={clx('flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all relative',
                active ? 'text-[#3B1F8C]' : 'text-gray-400'
              )}>
              <div className="relative">
                <Icon className={clx('w-5 h-5', active ? 'stroke-[2.5]' : 'stroke-[1.5]')}/>
                {tab.badge ? <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{tab.badge}</span> : null}
              </div>
              <span className={clx('text-xs', active ? 'font-semibold' : 'font-normal')}>{tab.label}</span>
              {active && <div className="absolute -bottom-1.5 w-5 h-1 bg-[#3B1F8C] rounded-full"/>}
            </button>
          )
        })}
      </div>
    </div>
  )

  // Loading
  return (
    <div className="min-h-screen bg-[#3B1F8C] flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-white animate-spin mx-auto mb-3"/>
        <div className="text-white/60 text-sm">Loading your portal…</div>
      </div>
    </div>
  )
}
