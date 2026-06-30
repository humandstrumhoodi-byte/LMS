'use client'
import React, { useState, useEffect, useCallback, useRef, Component, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/client'
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, CalendarDays, Coins,
  Receipt, ShieldCheck, LogOut, Music, Bell, FileText, CheckCircle,
  Plus, Trash2, Edit, Search, X, ChevronRight, Loader2, AlertCircle,
  Upload, Download, UserPlus, Mail, Send, Eye, EyeOff, CreditCard, Phone, KeyRound, RefreshCw, BarChart2, Clock
} from 'lucide-react'
import clsx from 'clsx'
import type { Profile, Perms, Role } from '@/types'
import { ROLE_PERMS, ROLE_LABEL, ROLE_COLOR, DAYS, TIMES, COLORS } from '@/types'

const fmt = (n: number) => '₹' + (n||0).toLocaleString('en-IN')

// Late payment fine: 5% of the outstanding amount per 15 days overdue, compounding on the base amount.
// e.g. 1-15 days late = +5%, 16-30 days = +10%, 31-45 days = +15%, etc.
function calcLateFine(payment: any): { periods: number; finePct: number; fineAmount: number; daysOverdue: number } {
  if (!payment.due_date || payment.status === 'paid' || payment.fine_enabled === false) {
    return { periods: 0, finePct: 0, fineAmount: 0, daysOverdue: 0 }
  }
  const due = new Date(payment.due_date + 'T00:00:00')
  const today = new Date()
  today.setHours(0,0,0,0)
  const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86400000)
  if (daysOverdue <= 0) return { periods: 0, finePct: 0, fineAmount: 0, daysOverdue: 0 }
  const periods = Math.ceil(daysOverdue / 15)
  const finePct = periods * 5
  const fineAmount = Math.round((payment.amount || 0) * finePct / 100)
  return { periods, finePct, fineAmount, daysOverdue }
}
const ini = (name: string) => (name||'?').split(' ').map((w:string)=>w[0]).join('').toUpperCase().slice(0,2)
const avatarColors = ['bg-violet-100 text-violet-700','bg-sky-100 text-sky-700','bg-emerald-100 text-emerald-700','bg-amber-100 text-amber-700','bg-rose-100 text-rose-700']
const ac = (i:number) => avatarColors[i%avatarColors.length]
const colorBadge:Record<string,string> = { violet:'bg-violet-50 text-violet-700', sky:'bg-sky-50 text-sky-700', emerald:'bg-emerald-50 text-emerald-700', amber:'bg-amber-50 text-amber-700', rose:'bg-rose-50 text-rose-700', indigo:'bg-indigo-50 text-indigo-700' }
const colorCell:Record<string,string> = { violet:'bg-violet-100 text-violet-700 border border-violet-200', sky:'bg-sky-100 text-sky-700 border border-sky-200', emerald:'bg-emerald-100 text-emerald-700 border border-emerald-200', amber:'bg-amber-100 text-amber-700 border border-amber-200', rose:'bg-rose-100 text-rose-700 border border-rose-200', indigo:'bg-indigo-100 text-indigo-700 border border-indigo-200' }
const PAY_MODES = ['UPI','Cash','Credit / Debit Card','Payment gateway','Cheque','Bank Transfer','Other']

const STUDENT_STATUSES = [
  { value: 'Active',          label: 'Active',           color: 'bg-emerald-50 text-emerald-700 border-emerald-200',  dot: 'bg-emerald-500' },
  { value: 'Trial',           label: 'Trial',            color: 'bg-amber-50 text-amber-700 border-amber-200',        dot: 'bg-amber-400' },
  { value: 'Paid Break',      label: 'Paid Break',       color: 'bg-blue-50 text-blue-700 border-blue-200',           dot: 'bg-blue-400' },
  { value: 'Unpaid Break',    label: 'Unpaid Break',     color: 'bg-orange-50 text-orange-700 border-orange-200',     dot: 'bg-orange-400' },
  { value: 'Inactive',        label: 'Inactive',         color: 'bg-gray-100 text-gray-500 border-gray-200',          dot: 'bg-gray-400' },
  { value: 'Blocked',         label: 'Blocked',          color: 'bg-red-50 text-red-700 border-red-200',              dot: 'bg-red-500' },
  { value: 'Dropped Off',     label: 'Dropped Off',      color: 'bg-slate-100 text-slate-500 border-slate-200',       dot: 'bg-slate-400' },
] as const

function studentStatusStyle(status: string) {
  return STUDENT_STATUSES.find(s => s.value === status) || STUDENT_STATUSES[0]
}
const PAY_STATUSES = ['paid','pending','overdue','failed']
const LEAD_STATUSES = ['New','Contacted','Interested','Trial Scheduled','Converted','Lost']
const leadColor:Record<string,string> = { 'New':'bg-blue-50 text-blue-700','Contacted':'bg-purple-50 text-purple-700','Interested':'bg-amber-50 text-amber-700','Trial Scheduled':'bg-orange-50 text-orange-700','Converted':'bg-emerald-50 text-emerald-700','Lost':'bg-red-50 text-red-700' }

// ── CSV Parser (handles quoted fields) ────────────────────────
function parseCSV(text:string):Record<string,string>[]{
  const lines = text.trim().split('\n').filter(l=>l.trim())
  if(lines.length<2) return []
  function splitLine(line:string):string[]{
    const f:string[]=[]; let cur='',inQ=false
    for(let i=0;i<line.length;i++){
      const ch=line[i]
      if(ch==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++}else inQ=!inQ}
      else if(ch===','&&!inQ){f.push(cur.trim());cur=''}
      else cur+=ch
    }
    f.push(cur.trim()); return f
  }
  const headers=splitLine(lines[0]).map(h=>h.replace(/^"|"$/g,'').trim().toLowerCase())
  return lines.slice(1).map(line=>{
    const vals=splitLine(line)
    const row:Record<string,string>={}
    headers.forEach((h,i)=>{row[h]=(vals[i]||'').replace(/^"|"$/g,'').trim()})
    return row
  }).filter(r=>Object.values(r).some(v=>v))
}

function mapStudent(row:Record<string,string>){
  const fullName=row['name']||`${row['first_name']||''} ${row['last_name']||''}`.trim()
  return {
    full_name:fullName, email:row['email']||null, phone:row['phone']||null,
    status:row['status']||'Active', student_id_ext:row['student_id']||null,
    guardian_name:row['guardian_name']||null, guardian_phone:row['guardian_phone']||null,
    guardian_email:row['guardian_email']||null,
    date_of_birth:row['date_of_birth']?row['date_of_birth'].slice(0,10):null,
    age:row['age']?parseInt(row['age'])||null:null,
    gender:row['gender']||null, nationality:row['nationality']||null,
    city:row['city']||null, area:row['area']||null,
    referral_source:row['refferal_source']||row['referral_source']||null,
    discipline:row['what_is_your_discipline?']||row['please_select_you_discipline?']||row['courses']||null,
    signup_source:row['signup_source']||null, batch:row['batch']||null,
    joined_date:row['created_on']?row['created_on'].slice(0,10):new Date().toISOString().slice(0,10),
  }
}

function mapPayment(row:Record<string,string>){
  // Normalize keys — strip all special chars, lowercase, trim
  // e.g. "Receipt #" -> "receipt_", "Mode of Payment" -> "mode_of_payment"
  const r: Record<string,string> = {}
  Object.entries(row).forEach(([k,v]) => {
    const normalized = k.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '_')  // replace non-alphanumeric runs with _
      .replace(/^_|_$/g, '')         // strip leading/trailing _
    r[normalized] = v
  })

  // Debug: log first row keys to console
  if (typeof window !== 'undefined' && (window as any).__payDebug !== true) {
    console.log('[Payment Import] Normalized keys:', Object.keys(r))
    ;(window as any).__payDebug = true
  }

  const rawStatus = (r['status']||'').toLowerCase()
  const status = rawStatus==='successful'?'paid':rawStatus==='failed'?'failed':'pending'

  const dateStr = r['date']||r['payment_date']||null
  let month_label = ''
  if (dateStr) {
    try { month_label = new Date(dateStr).toLocaleString('en-IN',{month:'long',year:'numeric'}) } catch {}
  }

  return {
    payment_date:   dateStr?.slice(0,10) || null,
    amount:         parseInt(r['amount']||'0') || 0,
    receipt_number: r['receipt_'] || r['receipt_number'] || r['receipt'] || null,
    invoice_number: r['invoice_'] || r['invoice_number'] || r['invoice'] || null,
    description:    r['payment_description'] || r['description'] || null,
    mode_of_payment:r['mode_of_payment'] || r['mode_of_payment_'] || 'UPI',
    transaction_id: r['transaction_id'] || r['transaction_id_'] || null,
    student_name:   r['student'] || r['student_name'] || null,
    student_email:  r['student_email'] || r['student_email_'] || null,
    student_phone:  r['student_phone'] || r['student_phone_'] || null,
    student_id_ext: r['student_id'] || r['student_id_ext'] || null,
    recorded_by:    r['recorded_by'] || r['recorded_by_'] || null,
    status,
    month_label,
  }
}

function mapStaff(row:Record<string,string>){
  return {
    full_name:row['name']||'', email:row['email']||'',
    phone:row['phone']||null,
    role:(row['role']?.toLowerCase()==='teacher'?'teacher':row['role']?.toLowerCase()==='owner'||row['role']?.toLowerCase()==='administrator'?'center_manager':'teacher') as Role,
    staff_role:row['role']||null,
    calendar_enabled:row['calendar']==='1'||row['calendar']?.toLowerCase()==='true',
  }
}

// ── Modal ─────────────────────────────────────────────────────
function Modal({open,onClose,title,children,wide,xl}:{open:boolean;onClose:()=>void;title:string;children:React.ReactNode;wide?:boolean;xl?:boolean}){
  useEffect(()=>{const h=(e:KeyboardEvent)=>e.key==='Escape'&&onClose();if(open)document.addEventListener('keydown',h);return()=>document.removeEventListener('keydown',h)},[open,onClose])
  if(!open)return null
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className={clsx('bg-white rounded-2xl shadow-2xl w-full animate-fu max-h-[90vh] flex flex-col',xl?'max-w-4xl':wide?'max-w-2xl':'max-w-md')}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4"/></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
function Avatar({name,i}:{name:string;i:number}){return<div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0',ac(i))}>{ini(name)}</div>}

// ── CSV Import Panel ──────────────────────────────────────────
function ImportPanel({type,onImport}:{type:'students'|'payments'|'staff';onImport:(rows:any[],rawText?:string)=>void}){
  const fileRef=useRef<HTMLInputElement>(null)
  const [rows,setRows]=useState<any[]>([])
  const [error,setError]=useState('')
  const [reading,setReading]=useState(false)
  const [rawCSV,setRawCSV]=useState('')
  const templates:Record<string,string>={
    students:'"First Name","Last Name","Name","Status","Email","Phone","Guardian Name","Guardian Phone","Guardian Email","Created On","Batch","Student ID Prefix","Student ID","Courses","School Year","School Name","Refferal Source","Nationality","Area","City","Date Of Birth","Age","Signup Source","Gender"\n"Arjun","Mehta","Arjun Mehta","Active","arjun@email.com","+91 98765 43210","","","","2024-01-15 00:00:00","","","1","Guitar","","","Instagram","IN","Hoodi","Bengaluru","2012-06-15","12","Manual entry","Male"',
    payments:'"Date","Amount","Receipt #","Invoice #","Payment Description","Mode of Payment","Transaction ID","Response Code","Student","Student Email","Student Phone","Student ID","Status","Created","Recorded By"\n"2026-06-28","2200","402","407","","UPI","","","Arjun Mehta","arjun@email.com","+91 98765 43210","1","Successful","2026-06-28 06:36:12","Benjamin Singh"',
    staff:'"Name","Role","Calendar","Phone","Email"\n"Sadhana Singh","Teacher","","+91 98838 81289","singh.sadna24@gmail.com"',
  }
  function handleFile(e:React.ChangeEvent<HTMLInputElement>){
    setError('');setRows([]);setRawCSV('')
    const file=e.target.files?.[0];if(!file)return
    setReading(true)
    const reader=new FileReader()
    reader.onload=(ev)=>{
      try{
        const text=ev.target?.result as string
        const parsed=parseCSV(text)
        if(!parsed.length){setError('No data rows found. Check the file has a header row.');setReading(false);return}
        setRows(parsed);setRawCSV(text)
      }catch{setError('Could not read file. Use CSV format.')}
      setReading(false)
    }
    reader.onerror=()=>{setError('File read failed.');setReading(false)}
    reader.readAsText(file)
  }
  const previewCols=rows[0]?Object.keys(rows[0]).slice(0,6):[]
  return(
    <div className="space-y-4">
      <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(templates[type])}`} download={`${type}-template.csv`} className="btn btn-sm w-full justify-center"><Download className="w-3 h-3"/> Download {type} Template</a>
      <div>
        <label className="label">Upload CSV file</label>
        <label className={clsx('flex flex-col items-center justify-center w-full border-2 border-dashed rounded-xl cursor-pointer transition-all p-6 text-center',reading?'border-brand-400 bg-brand-50':rows.length?'border-emerald-300 bg-emerald-50':'border-gray-200 bg-gray-50 hover:border-brand-300 hover:bg-brand-50/30')}>
          {reading?(
            <div className="flex flex-col items-center gap-3">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-4 border-brand-100"/>
                <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin"/>
              </div>
              <div className="text-sm font-medium text-brand-600 animate-pulse">Reading file…</div>
            </div>
          ):rows.length>0?(
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mb-1"><CheckCircle className="w-5 h-5 text-emerald-600"/></div>
              <div className="text-sm font-semibold text-emerald-700">{rows.length} rows detected</div>
              <div className="text-xs text-emerald-600">Click to change file</div>
            </div>
          ):(
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"><Upload className="w-5 h-5 text-gray-400"/></div>
              <div className="text-sm font-medium text-gray-600">Click to upload CSV</div>
              <div className="text-xs text-gray-400">Excel: File → Save As → CSV (Comma delimited)</div>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden"/>
        </label>
      </div>
      {error&&<div className="px-3 py-2.5 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100 flex items-start gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5"/>{error}</div>}
      {rows.length>0&&!reading&&(
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-100 text-xs">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">Preview — first 3 of {rows.length} rows</div>
            <table className="w-full"><thead><tr>{previewCols.map(c=><th key={c} className="th py-1.5 whitespace-nowrap">{c}</th>)}</tr></thead>
            <tbody>{rows.slice(0,3).map((row,i)=><tr key={i}>{previewCols.map(c=><td key={c} className="td py-1.5 max-w-[120px] truncate">{row[c]||'—'}</td>)}</tr>)}</tbody></table>
          </div>
          <button onClick={()=>onImport(rows,rawCSV)} className="btn-primary w-full justify-center py-2.5">
            <Upload className="w-4 h-4"/> Import {rows.length} {type==='payments'?'Payments':type==='staff'?'Staff Members':'Students'}
          </button>
        </>
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════════════
// ERROR BOUNDARY
// ══════════════════════════════════════════════════════════════
class ErrorBoundary extends Component<{children:ReactNode},{hasError:boolean;msg:string}> {
  constructor(props:any){super(props);this.state={hasError:false,msg:''}}
  static getDerivedStateFromError(e:Error){return{hasError:true,msg:e.message}}
  render(){
    if(this.state.hasError)return(
      <div className="min-h-screen flex items-center justify-center p-8 bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-100 shadow-sm p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-500 mb-4">{this.state.msg}</p>
          <button onClick={()=>window.location.reload()} className="btn-primary mx-auto">Reload page</button>
          <p className="text-xs text-gray-400 mt-4">If this keeps happening, check the browser console (F12) and share the error.</p>
        </div>
      </div>
    )
    return this.props.children
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN SHELL
// ══════════════════════════════════════════════════════════════
function DashboardShellInner({profile}:{profile:Profile}){
  const router=useRouter()
  const supabase=sb()
  const perms:Perms=ROLE_PERMS[profile.role as Role]
  // Safety: catch render errors
  const [tab,setTab]=useState('home')
  const [students,setStudents]=useState<any[]>([])
  const [profiles,setProfiles]=useState<any[]>([])
  const [subjects,setSubjects]=useState<any[]>([])
  const [schedules,setSchedules]=useState<any[]>([])
  const [fees,setFees]=useState<any[]>([])
  const [payments,setPayments]=useState<any[]>([])
  const [leads,setLeads]=useState<any[]>([])
  const [packages,setPackages]=useState<any[]>([])
  const [subjectTeachers,setSubjectTeachers]=useState<any[]>([])
  const [attendance,setAttendance]=useState<any[]>([])

  const load=useCallback(async()=>{
    try{
      const client=sb()
      const [s,p,sub,sch,f,pay,l] = await Promise.all([
        client.from('students').select('*, student_subjects(subject_id)').order('full_name'),
        client.from('profiles').select('*').order('full_name'),
        client.from('subjects').select('*').order('name'),
        client.from('class_schedules').select('*, schedule_students(student_id)').order('day_of_week').order('start_time'),
        client.from('fee_structures').select('*'),
        client.from('payments').select('*, students(full_name,email,phone), subjects(name,code,color)').order('created_at',{ascending:false}),
        client.from('leads').select('*').order('created_at',{ascending:false}),
      ])
      setStudents(s.data||[]);setProfiles(p.data||[]);setSubjects(sub.data||[])
      setSchedules(sch.data||[]);setFees(f.data||[]);setPayments(pay.data||[]);setLeads(l.data||[])
      // Load packages separately — table may not exist if SQL migration hasn't run
      try{
        const pkg = await client.from('subject_packages').select('*, subjects(name,code,color)').order('subject_id').order('grade_level').order('classes_pm')
        setPackages(pkg.data||[])
      }catch(pkgErr){ console.warn('[subject_packages] Table may not exist yet — run add_packages.sql in Supabase') }
      try{
        const st = await client.from('subject_teachers').select('*, profiles(id,full_name,role)').order('subject_id').order('grade_level')
        setSubjectTeachers(st.data||[])
      }catch(stErr){ console.warn('[subject_teachers] Table may not exist yet — run add_subject_teachers.sql') }
      try{
        const att = await client.from('attendance').select('*, students(full_name), profiles(full_name), class_schedules(day_of_week,start_time,subjects(name))').order('class_date',{ascending:false}).limit(500)
        setAttendance(att.data||[])
      }catch(attErr){ console.warn('[attendance] Table may not exist yet') }
    }catch(e){console.error('[LMS load error]',e)}
  },[])

  useEffect(()=>{load()},[load])
  async function signOut(){await supabase.auth.signOut();router.push('/login')}

  const nav=[
    {id:'home',icon:LayoutDashboard,label:'Dashboard',show:true},
    {id:'students',icon:Users,label:'Students',show:perms.manageStudents},
    {id:'leads',icon:UserPlus,label:'Leads',show:perms.manageStudents},
    {id:'teachers',icon:GraduationCap,label:'Teachers',show:perms.manageTeachers},
    {id:'subjects',icon:BookOpen,label:'Subjects',show:perms.manageSubjects},
    {id:'packages',icon:CreditCard,label:'Packages',show:perms.manageFees},
    {id:'schedule',icon:CalendarDays,label:'Schedule',show:perms.viewOwnSchedule},
    {id:'fees',icon:Coins,label:'Fee Structure',show:perms.manageFees},
    {id:'payments',icon:Receipt,label:'Payments',show:perms.viewPayments},
    {id:'reports',   icon:BarChart2,   label:'Reports',       show:perms.viewPayments},
    {id:'attendance', icon:CheckCircle, label:'Attendance',    show:perms.viewOwnSchedule},
    {id:'users',      icon:ShieldCheck, label:'Users & Roles', show:perms.manageUsers},
    {id:'settings',   icon:Clock,       label:'Center Hours',  show:perms.manageUsers},
  ].filter(n=>n.show)

  return(
    <div className="flex h-screen overflow-hidden">
      <aside className="w-[210px] flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0"><Music className="w-4 h-4 text-white"/></div>
            <div><div className="text-sm font-semibold text-gray-900">Hum & Strum</div><div className="text-xs text-gray-400">Academy LMS</div></div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(n=>{const Icon=n.icon;const active=tab===n.id;return(
            <button key={n.id} onClick={()=>setTab(n.id)} className={clsx('nav-link w-full text-left',active&&'active')}>
              <Icon className="w-4 h-4 flex-shrink-0"/><span className="flex-1">{n.label}</span>{active&&<ChevronRight className="w-3 h-3 opacity-40"/>}
            </button>
          )})}
        </nav>
        <div className="px-3 py-4 border-t border-gray-100">
          {/* Academy logo */}
          <div className="flex items-center gap-2.5 px-3 mb-3">
            <img src="/logo.png" alt="Hum & Strum" className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-gray-100"/>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-gray-900">Hum &amp; Strum</div>
              <div className="text-xs text-gray-400">Music School</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-3 mb-2">
            <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0',ac(0))}>{ini(profile.full_name)}</div>
            <div className="min-w-0"><div className="text-xs font-medium text-gray-900 truncate">{profile.full_name}</div><span className={clsx('badge text-xs',ROLE_COLOR[profile.role as Role])}>{ROLE_LABEL[profile.role as Role]}</span></div>
          </div>
          <button onClick={signOut} className="nav-link w-full text-red-500 hover:bg-red-50 hover:text-red-600"><LogOut className="w-4 h-4"/> Sign out</button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-6">
          {tab==='home'&&<HomeTab profile={profile} perms={perms} students={students} profiles={profiles} payments={payments} schedules={schedules} subjects={subjects} leads={leads} setTab={setTab}/>}
          {tab==='students'&&<StudentsTab students={students} subjects={subjects} packages={packages} fees={fees} schedules={schedules} reload={load}/>}
          {tab==='leads'&&<LeadsTab leads={leads} subjects={subjects} reload={load}/>}
          {tab==='teachers'&&<TeachersTab profiles={profiles} subjects={subjects} reload={load}/>}
          {tab==='subjects'&&<SubjectsTab subjects={subjects} profiles={profiles} students={students} fees={fees} subjectTeachers={subjectTeachers} reload={load}/>}
          {tab==='packages'&&<PackagesTab packages={packages} subjects={subjects} reload={load}/>}
          {tab==='schedule'&&<ScheduleTab schedules={schedules} subjects={subjects} students={students} profiles={profiles} profile={profile} perms={perms} reload={load}/>}
          {tab==='fees'&&<FeesTab subjects={subjects} fees={fees} reload={load}/>}
          {tab==='payments'&&<PaymentsTab payments={payments} students={students} subjects={subjects} fees={fees} perms={perms} reload={load}/>}
          {tab==='reports'&&<ReportsTab students={students} subjects={subjects} payments={payments} profiles={profiles} attendance={attendance} reload={load}/>}
          {tab==='attendance'&&<AttendanceTab schedules={schedules} subjects={subjects} students={students} profiles={profiles} profile={profile} attendance={attendance} reload={load}/>}
          {tab==='users'&&<UsersTab profiles={profiles} profile={profile} reload={load}/>}
          {tab==='settings'&&<CenterHoursTab profile={profile}/>}
        </div>
      </main>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════ HOME
function HomeTab({profile,perms,students,profiles,payments,schedules,subjects,leads,setTab}:any){
  const teachers=profiles.filter((p:any)=>p.role==='teacher'||p.role==='center_manager')
  const activeStudents=students.filter((s:any)=>s.status==='Active'||!s.status)
  const inactiveStudents=students.filter((s:any)=>s.status==='Inactive')
  const trialStudents=students.filter((s:any)=>s.status==='Trial')
  const blockedStudents=students.filter((s:any)=>s.status==='Blocked')
  const paidBreakStudents=students.filter((s:any)=>s.status==='Paid Break')
  const unpaidBreakStudents=students.filter((s:any)=>s.status==='Unpaid Break')
  const droppedStudents=students.filter((s:any)=>s.status==='Dropped Off')
  const paid=payments.filter((p:any)=>p.status==='paid').reduce((a:number,p:any)=>a+p.amount,0)
  const pending=payments.filter((p:any)=>p.status==='pending'||p.status==='overdue').reduce((a:number,p:any)=>a+p.amount,0)
  const overdue=payments.filter((p:any)=>p.status==='overdue')
  const newLeads=leads.filter((l:any)=>l.status==='New').length
  const isTeacher=profile.role==='teacher'

  // Drilldown state — show a mini student list overlay on the dashboard
  const [drilldown,setDrilldown]=useState<{title:string;list:any[]}|null>(null)

  function StudentDrilldown({title,list}:{title:string;list:any[]}){
    return(
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={()=>setDrilldown(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-fu" onClick={e=>e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-900">{title}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{list.length} students</p>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>{setDrilldown(null);setTab('students')}} className="btn btn-sm">View All →</button>
              <button onClick={()=>setDrilldown(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4"/></button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {list.length===0
              ? <div className="py-10 text-center text-gray-300">No students</div>
              : list.map((s:any,i:number)=>{
                  const subs=subjects.filter((sub:any)=>(s.student_subjects||[]).some((ss:any)=>ss.subject_id===sub.id))
                  return(
                    <div key={s.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <div className="flex items-center gap-3">
                        <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0',ac(i))}>{ini(s.full_name)}</div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{s.full_name}</div>
                          <div className="text-xs text-gray-400">{s.phone||s.email||'—'}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-wrap gap-1">{subs.slice(0,2).map((sub:any)=><span key={sub.id} className={clsx('badge text-xs',colorBadge[sub.color]||colorBadge.violet)}>{sub.code}</span>)}</div>
                        <span className={clsx('badge text-xs',s.status==='Active'||!s.status?'bg-emerald-50 text-emerald-700':s.status==='Trial'?'bg-amber-50 text-amber-700':'bg-gray-100 text-gray-500')}>{s.status||'Active'}</span>
                      </div>
                    </div>
                  )
                })
            }
          </div>
        </div>
      </div>
    )
  }

  return(
    <div className="animate-fu">
      {drilldown&&<StudentDrilldown title={drilldown.title} list={drilldown.list}/>}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Good day, {profile.full_name.split(' ')[0]} 👋</h1>
        <p className="text-sm text-gray-400 mt-0.5">{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
      </div>
      <div className={clsx('inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border mb-6',profile.role==='superadmin'?'bg-purple-50 text-purple-700 border-purple-200':profile.role==='center_manager'?'bg-blue-50 text-blue-700 border-blue-200':'bg-emerald-50 text-emerald-700 border-emerald-200')}>
        <span className="w-1.5 h-1.5 rounded-full bg-current"/>{ROLE_LABEL[profile.role as Role]}{isTeacher&&' — schedule view only'}
      </div>

      {!isTeacher&&(<>
        {/* ── Student status breakdown ── */}
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Students by Status</div>
            <div className="text-xs text-gray-400">Total: {students.length}</div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              {label:'Active',       list:activeStudents,      color:'emerald'},
              {label:'Trial',        list:trialStudents,       color:'amber'},
              {label:'Paid Break',   list:paidBreakStudents,   color:'blue'},
              {label:'Unpaid Break', list:unpaidBreakStudents, color:'orange'},
              {label:'Inactive',     list:inactiveStudents,    color:'gray'},
              {label:'Blocked',      list:blockedStudents,     color:'red'},
              {label:'Dropped Off',  list:droppedStudents,     color:'slate'},
            ].map(({label,list,color})=>{
              const st = studentStatusStyle(label)
              return(
                <button key={label}
                  onClick={()=>list.length>0&&setDrilldown({title:`${label} Students`,list})}
                  className={clsx('flex flex-col p-3 rounded-xl border transition-all text-left',
                    list.length>0?'cursor-pointer hover:shadow-sm':'cursor-default opacity-50',
                    st.color
                  )}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className={clsx('w-2 h-2 rounded-full',st.dot)}/>
                    <div className="text-xs font-medium truncate">{label}</div>
                  </div>
                  <div className="text-2xl font-bold">{list.length}</div>
                </button>
              )
            })}
            {/* Total card */}
            <button onClick={()=>setDrilldown({title:'All Students',list:students})}
              className="flex flex-col p-3 rounded-xl border border-brand-200 bg-brand-50 transition-all hover:shadow-sm cursor-pointer text-left">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-2 h-2 rounded-full bg-brand-500"/>
                <div className="text-xs font-medium text-brand-700">All</div>
              </div>
              <div className="text-2xl font-bold text-brand-700">{students.length}</div>
            </button>
          </div>
        </div>

        {/* ── Other quick stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[
            {label:'Leads',val:leads.length,icon:UserPlus,color:'bg-purple-50 text-purple-600',page:'leads'},
            {label:'Teachers',val:teachers.length,icon:GraduationCap,color:'bg-indigo-50 text-indigo-600',page:'teachers'},
            {label:'Subjects',val:subjects.length,icon:BookOpen,color:'bg-teal-50 text-teal-600',page:'subjects'},
            {label:'Classes/wk',val:schedules.length,icon:CalendarDays,color:'bg-amber-50 text-amber-600',page:'schedule'},
          ].map(m=>{
            const Icon=m.icon
            return(
              <button key={m.label} onClick={()=>setTab(m.page)} className="card p-4 text-left hover:shadow-md transition-shadow group">
                <div className="flex items-center justify-between mb-2">
                  <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center',m.color)}><Icon className="w-4 h-4"/></div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors"/>
                </div>
                <div className="text-xl font-bold text-gray-900">{m.val}</div>
                <div className="text-xs text-gray-400 mt-0.5">{m.label}</div>
              </button>
            )
          })}
        </div>

        {/* ── Payment summary ── */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <button onClick={()=>setTab('payments')} className="card p-4 bg-emerald-50 border-emerald-100 text-left hover:shadow-md transition-shadow">
            <div className="text-xs text-emerald-600 font-medium mb-1">Collected</div>
            <div className="text-xl font-semibold text-emerald-700">{fmt(paid)}</div>
          </button>
          <button onClick={()=>setTab('payments')} className="card p-4 bg-amber-50 border-amber-100 text-left hover:shadow-md transition-shadow">
            <div className="text-xs text-amber-600 font-medium mb-1">Pending</div>
            <div className="text-xl font-semibold text-amber-700">{fmt(pending)}</div>
          </button>
          <button onClick={()=>setTab('payments')} className="card p-4 bg-red-50 border-red-100 text-left hover:shadow-md transition-shadow">
            <div className="text-xs text-red-500 font-medium mb-1">Overdue</div>
            <div className="text-xl font-semibold text-red-600">{overdue.length} invoice{overdue.length!==1?'s':''}</div>
          </button>
        </div>

        {/* ── By instrument ── */}
        <div className="card p-4 mb-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Students by Instrument</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {subjects.map((sub:any)=>{
              const count=students.filter((s:any)=>(s.student_subjects||[]).some((ss:any)=>ss.subject_id===sub.id)).length
              if(!count) return null
              return(
                <button key={sub.id}
                  onClick={()=>setDrilldown({title:`${sub.name} Students`,list:students.filter((s:any)=>(s.student_subjects||[]).some((ss:any)=>ss.subject_id===sub.id))})}
                  className="flex flex-col items-center p-3 rounded-xl border border-gray-100 hover:border-brand-200 hover:bg-brand-50/30 transition-all group">
                  <span className={clsx('badge text-xs mb-1',colorBadge[sub.color]||colorBadge.violet)}>{sub.code}</span>
                  <div className="text-xl font-bold text-gray-900">{count}</div>
                  <div className="text-xs text-gray-400 truncate w-full text-center">{sub.name}</div>
                </button>
              )
            })}
          </div>
        </div>

        {newLeads>0&&<div className="card p-4 mb-4 border-purple-100 bg-purple-50/50 flex items-center justify-between"><div className="flex items-center gap-2 text-purple-700"><UserPlus className="w-4 h-4"/><span className="text-sm font-medium">{newLeads} new lead{newLeads>1?'s':''} awaiting follow-up</span></div><button onClick={()=>setTab('leads')} className="btn btn-sm text-purple-700 border-purple-200">View Leads</button></div>}
        {overdue.length>0&&<div className="card mb-4"><div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-medium text-red-600"><AlertCircle className="w-4 h-4"/>Overdue Fees</div><button onClick={()=>setTab('payments')} className="text-xs text-red-400 hover:text-red-600">View all →</button></div>{overdue.slice(0,5).map((p:any)=><div key={p.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-50 last:border-0"><div><div className="text-sm font-medium text-gray-800">{p.students?.full_name||p.student_name}</div><div className="text-xs text-gray-400">{p.subjects?.name} · {p.month_label}</div></div><span className="text-sm font-semibold text-red-600">{fmt(p.amount)}</span></div>)}</div>}
      </>)}

      {isTeacher&&<div className="card p-10 text-center"><CalendarDays className="w-12 h-12 text-brand-300 mx-auto mb-3"/><h2 className="text-base font-medium text-gray-800 mb-1">Your Teaching Schedule</h2><p className="text-sm text-gray-400 mb-5">View classes assigned to your subjects.</p><button onClick={()=>setTab('schedule')} className="btn-primary">View My Schedule</button></div>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════ STUDENTS
function StudentsTab({students,subjects,packages,fees,schedules,reload}:any){
  const supabase=sb()
  const [q,setQ]=useState('')
  const [enrollOpen,setEnrollOpen]=useState(false)
  const [importOpen,setImportOpen]=useState(false)
  const [detailStudent,setDetailStudent]=useState<any>(null)
  const [studentPayments,setStudentPayments]=useState<any[]>([])
  const [editing,setEditing]=useState<any>(null)
  const [busy,setBusy]=useState(false)
  const [importResult,setImportResult]=useState('')

  async function viewStudent(s:any){
    setDetailStudent(s)
    setStudentPayments([])
    const [{data:d1},{data:d2}]=await Promise.all([
      supabase.from('payments').select('*, subjects(name,color)').eq('student_id',s.id).order('payment_date',{ascending:false}),
      s.student_id_ext ? supabase.from('payments').select('*, subjects(name,color)').eq('student_id_ext',s.student_id_ext).is('student_id',null).order('payment_date',{ascending:false}) : Promise.resolve({data:[]}),
    ])
    const all=[...(d1||[]),...(d2||[])]
    const seen=new Set<string>()
    const deduped=all.filter(p=>{const key=p.invoice_number||p.id;if(seen.has(key))return false;seen.add(key);return true})
    setStudentPayments(deduped)
  }

  function openAdd(){setEditing(null);setEnrollOpen(true)}
  function openEdit(s:any){setEditing(s);setEnrollOpen(true)}

  async function handleImport(rows:any[]){
    setBusy(true);let ok=0,fail=0,skip=0
    for(const row of rows){
      const mapped=mapStudent(row)
      if(!mapped.full_name?.trim()){skip++;continue}
      const{error}=await supabase.from('students').insert(mapped)
      if(error){console.error(mapped.full_name,error.message);fail++}else ok++
    }
    setBusy(false);setImportResult(`✓ Imported ${ok}${fail>0?` · ${fail} failed`:''}${skip>0?` · ${skip} skipped`:''}`);setImportOpen(false);reload()
  }

  async function del(id:string){if(!confirm('Delete student?'))return;await supabase.from('students').delete().eq('id',id);reload()}

  const filtered=students.filter((s:any)=>s.full_name?.toLowerCase().includes(q.toLowerCase())||s.email?.toLowerCase().includes(q.toLowerCase())||s.phone?.includes(q))

  return(
    <div className="animate-fu">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-xl font-semibold text-gray-900">Students</h1><p className="text-sm text-gray-400 mt-0.5">{students.length} enrolled</p></div>
        <div className="flex gap-2">
          <button onClick={()=>setImportOpen(true)} className="btn"><Upload className="w-4 h-4"/> Import CSV</button>
          <button onClick={openAdd} className="btn-primary"><Plus className="w-4 h-4"/> Enroll Student</button>
        </div>
      </div>
      {importResult&&<div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-100">{importResult}</div>}
      <div className="card">
        <div className="p-4 border-b border-gray-100"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/><input className="input pl-9" placeholder="Search name, email, phone…" value={q} onChange={e=>setQ(e.target.value)}/></div></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">Student</th><th className="th">Phone</th><th className="th">Subjects</th><th className="th">Status</th><th className="th">Joined</th><th className="th w-28"></th></tr></thead>
            <tbody>
              {filtered.map((s:any,i:number)=>{
                const subs=subjects.filter((sub:any)=>(s.student_subjects||[]).some((ss:any)=>ss.subject_id===sub.id))
                const st=studentStatusStyle(s.status||'Active')
                return(<tr key={s.id} className="hover:bg-gray-50/50">
                  <td className="td"><div className="flex items-center gap-3"><Avatar name={s.full_name} i={i}/><div><div className="font-medium text-gray-900">{s.full_name}</div><div className="text-xs text-gray-400">{s.email}</div></div></div></td>
                  <td className="td text-gray-500">{s.phone||'—'}</td>
                  <td className="td"><div className="flex flex-wrap gap-1">{subs.map((sub:any)=><span key={sub.id} className={clsx('badge',colorBadge[sub.color]||colorBadge.violet)}>{sub.name}</span>)}</div></td>
                  <td className="td"><span className={clsx('badge border',st.color)}><span className={clsx('w-1.5 h-1.5 rounded-full mr-1 inline-block',st.dot)}/>{s.status||'Active'}</span></td>
                  <td className="td text-gray-400">{s.joined_date||'—'}</td>
                  <td className="td"><div className="flex gap-1">
                    <button onClick={()=>viewStudent(s)} className="btn btn-sm" title="View details"><Eye className="w-3 h-3"/></button>
                    <button onClick={()=>openEdit(s)} className="btn btn-sm" title="Edit"><Edit className="w-3 h-3"/></button>
                    <select
                      value={s.status||'Active'}
                      onChange={async e=>{await supabase.from('students').update({status:e.target.value}).eq('id',s.id);reload()}}
                      className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white text-gray-600 cursor-pointer hover:border-gray-300"
                      title="Change status"
                      onClick={e=>e.stopPropagation()}
                    >
                      {STUDENT_STATUSES.map(st=><option key={st.value} value={st.value}>{st.label}</option>)}
                    </select>
                    <button onClick={()=>del(s.id)} className="btn btn-sm btn-danger"><Trash2 className="w-3 h-3"/></button>
                  </div></td>
                </tr>)
              })}
              {!filtered.length&&<tr><td colSpan={6} className="td text-center text-gray-300 py-10">No students found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detailStudent&&<StudentDetailModal
        student={detailStudent}
        payments={studentPayments}
        subjects={subjects}
        packages={packages}
        fees={fees}
        onClose={()=>setDetailStudent(null)}
        reload={reload}
      />}

      {enrollOpen&&<EnrollmentModal
        student={editing}
        subjects={subjects}
        packages={packages}
        schedules={schedules||[]}
        onClose={()=>{setEnrollOpen(false);setEditing(null)}}
        reload={reload}
      />}

      <Modal open={importOpen} onClose={()=>setImportOpen(false)} title="Import Students from CSV" wide>
        <ImportPanel type="students" onImport={handleImport}/>
      </Modal>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════ LEADS
function LeadsTab({leads,subjects,reload}:any){
  const supabase=sb()
  const [open,setOpen]=useState(false);const [importOpen,setImportOpen]=useState(false)
  const [editing,setEditing]=useState<any>(null)
  const [form,setForm]=useState({full_name:'',email:'',phone:'',source:'',notes:'',status:'New',interest_subject:''})
  const [busy,setBusy]=useState(false);const [q,setQ]=useState('');const [importResult,setImportResult]=useState('')
  const openAdd=()=>{setEditing(null);setForm({full_name:'',email:'',phone:'',source:'',notes:'',status:'New',interest_subject:''});setOpen(true)}
  const openEdit=(l:any)=>{setEditing(l);setForm({full_name:l.full_name,email:l.email||'',phone:l.phone||'',source:l.source||'',notes:l.notes||'',status:l.status||'New',interest_subject:l.interest_subject||''});setOpen(true)}
  async function save(){if(!form.full_name.trim())return;setBusy(true);const p={full_name:form.full_name.trim(),email:form.email||null,phone:form.phone||null,source:form.source||null,notes:form.notes||null,status:form.status,interest_subject:form.interest_subject||null};if(editing)await supabase.from('leads').update(p).eq('id',editing.id);else await supabase.from('leads').insert(p);setBusy(false);setOpen(false);reload()}
  async function convertToStudent(l:any){if(!confirm(`Convert ${l.full_name} to student?`))return;await supabase.from('students').insert({full_name:l.full_name,email:l.email,phone:l.phone,joined_date:new Date().toISOString().slice(0,10),status:'Active'});await supabase.from('leads').update({status:'Converted'}).eq('id',l.id);reload()}
  async function del(id:string){if(!confirm('Delete lead?'))return;await supabase.from('leads').delete().eq('id',id);reload()}
  async function handleImport(rows:any[]){setBusy(true);let ok=0,fail=0;for(const r of rows){const{error}=await supabase.from('leads').insert({full_name:r['name']||r['full_name']||'',email:r['email']||null,phone:r['phone']||null,source:r['source']||null,notes:r['notes']||null,status:'New'});if(error)fail++;else ok++}setBusy(false);setImportResult(`✓ ${ok} imported${fail>0?`, ${fail} failed`:''}`);setImportOpen(false);reload()}
  const filtered=leads.filter((l:any)=>l.full_name?.toLowerCase().includes(q.toLowerCase())||l.phone?.includes(q)||l.email?.toLowerCase().includes(q.toLowerCase()))
  const byStatus=LEAD_STATUSES.reduce((acc:any,s)=>{acc[s]=leads.filter((l:any)=>l.status===s).length;return acc},{})
  return(
    <div className="animate-fu">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-xl font-semibold text-gray-900">Leads</h1><p className="text-sm text-gray-400 mt-0.5">{leads.length} total</p></div>
        <div className="flex gap-2"><button onClick={()=>setImportOpen(true)} className="btn"><Upload className="w-4 h-4"/> Import CSV</button><button onClick={openAdd} className="btn-primary"><Plus className="w-4 h-4"/> Add Lead</button></div>
      </div>
      {importResult&&<div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-100">{importResult}</div>}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-5">{LEAD_STATUSES.map(s=><div key={s} className={clsx('rounded-lg px-3 py-2 text-center',leadColor[s]||'bg-gray-50 text-gray-600')}><div className="text-lg font-semibold">{byStatus[s]||0}</div><div className="text-xs opacity-70">{s}</div></div>)}</div>
      <div className="card">
        <div className="p-4 border-b border-gray-100"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/><input className="input pl-9" placeholder="Search…" value={q} onChange={e=>setQ(e.target.value)}/></div></div>
        <div className="overflow-x-auto"><table className="w-full">
          <thead><tr><th className="th">Lead</th><th className="th">Phone</th><th className="th">Source</th><th className="th">Interest</th><th className="th">Status</th><th className="th">Notes</th><th className="th w-28"></th></tr></thead>
          <tbody>
            {filtered.map((l:any,i:number)=>(
              <tr key={l.id} className="hover:bg-gray-50/50">
                <td className="td"><div className="flex items-center gap-2"><Avatar name={l.full_name} i={i}/><div><div className="font-medium text-gray-900">{l.full_name}</div><div className="text-xs text-gray-400">{l.email}</div></div></div></td>
                <td className="td text-gray-500">{l.phone||'—'}</td>
                <td className="td text-gray-500">{l.source||'—'}</td>
                <td className="td text-gray-500">{l.interest_subject||'—'}</td>
                <td className="td"><select className={clsx('badge cursor-pointer border-0 outline-none',leadColor[l.status]||'bg-gray-50 text-gray-600')} value={l.status} onChange={async e=>{await supabase.from('leads').update({status:e.target.value}).eq('id',l.id);reload()}}>{LEAD_STATUSES.map(s=><option key={s}>{s}</option>)}</select></td>
                <td className="td text-gray-400 text-xs max-w-[120px] truncate">{l.notes||'—'}</td>
                <td className="td"><div className="flex gap-1">{l.status!=='Converted'&&<button onClick={()=>convertToStudent(l)} title="Convert" className="btn btn-sm text-emerald-600 border-emerald-200 hover:bg-emerald-50"><UserPlus className="w-3 h-3"/></button>}<button onClick={()=>openEdit(l)} className="btn btn-sm"><Edit className="w-3 h-3"/></button><button onClick={()=>del(l.id)} className="btn btn-sm btn-danger"><Trash2 className="w-3 h-3"/></button></div></td>
              </tr>
            ))}
            {!filtered.length&&<tr><td colSpan={7} className="td text-center text-gray-300 py-10">No leads</td></tr>}
          </tbody>
        </table></div>
      </div>
      <Modal open={open} onClose={()=>setOpen(false)} title={editing?'Edit Lead':'Add Lead'}>
        <div className="space-y-3">
          <div><label className="label">Full Name *</label><input className="input" value={form.full_name} onChange={e=>setForm(f=>({...f,full_name:e.target.value}))}/></div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Source</label><input className="input" value={form.source} onChange={e=>setForm(f=>({...f,source:e.target.value}))} placeholder="Instagram, Referral…"/></div>
            <div><label className="label">Status</label><select className="input" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{LEAD_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
          </div>
          <div><label className="label">Interested In</label><select className="input" value={form.interest_subject} onChange={e=>setForm(f=>({...f,interest_subject:e.target.value}))}><option value="">— Any —</option>{subjects.map((s:any)=><option key={s.id} value={s.name}>{s.name}</option>)}</select></div>
          <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
          <div className="flex justify-end gap-2 pt-2"><button className="btn" onClick={()=>setOpen(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy?<Loader2 className="w-4 h-4 animate-spin"/>:null}{editing?'Save':'Add Lead'}</button></div>
        </div>
      </Modal>
      <Modal open={importOpen} onClose={()=>setImportOpen(false)} title="Import Leads" wide><ImportPanel type="students" onImport={handleImport}/></Modal>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════ TEACHERS
function TeachersTab({profiles,subjects,reload}:any){
  const teachers=profiles.filter((p:any)=>p.role==='teacher'||p.role==='center_manager')
  const [open,setOpen]=useState(false)
  const [importOpen,setImportOpen]=useState(false)
  const [pwdOpen,setPwdOpen]=useState(false)
  const [pwdUser,setPwdUser]=useState<any>(null)
  const [form,setForm]=useState({full_name:'',email:'',phone:'',password:''})
  const [pwdForm,setPwdForm]=useState({password:'',confirm:''})
  const [showPwd,setShowPwd]=useState(false)
  const [busy,setBusy]=useState(false)
  const [err,setErr]=useState('')
  const [pwdErr,setPwdErr]=useState('')
  const [pwdSuccess,setPwdSuccess]=useState('')
  const [importResult,setImportResult]=useState('')
  const [editOpen,setEditOpen]=useState(false)
  const [editUser,setEditUser]=useState<any>(null)
  const [editForm,setEditForm]=useState({full_name:'',email:'',phone:'',staff_role:'',role:'teacher' as Role})
  const [editErr,setEditErr]=useState('')
  const [editBusy,setEditBusy]=useState(false)

  function openEditUser(user:any){
    setEditUser(user)
    setEditForm({full_name:user.full_name,email:user.email,phone:user.phone||'',staff_role:user.staff_role||'',role:user.role})
    setEditErr(''); setEditOpen(true)
  }

  async function saveEditUser(){
    if(!editForm.full_name||!editForm.email){setEditErr('Name and email are required');return}
    setEditBusy(true);setEditErr('')
    const supa=sb()
    const{error}=await supa.from('profiles').update({
      full_name:editForm.full_name,
      email:editForm.email,
      phone:editForm.phone||null,
      staff_role:editForm.staff_role||null,
    }).eq('id',editUser.id)
    if(error){setEditErr(error.message);setEditBusy(false);return}
    // Also update role if changed (superadmin only via API)
    if(editForm.role!==editUser.role){
      await fetch('/api/admin',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editUser.id,role:editForm.role})})
    }
    setEditBusy(false);setEditOpen(false);reload()
  }

  function openResetPwd(user:any){
    setPwdUser(user)
    setPwdForm({password:'',confirm:''})
    setPwdErr(''); setPwdSuccess(''); setShowPwd(false)
    setPwdOpen(true)
  }

  async function savePassword(){
    if(!pwdForm.password||pwdForm.password.length<8){setPwdErr('Password must be at least 8 characters');return}
    if(pwdForm.password!==pwdForm.confirm){setPwdErr('Passwords do not match');return}
    setBusy(true);setPwdErr('');setPwdSuccess('')
    const r=await fetch('/api/admin',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:pwdUser.id,password:pwdForm.password})})
    const d=await r.json()
    setBusy(false)
    if(!r.ok){setPwdErr(d.error||'Error updating password');return}
    setPwdSuccess(`✓ Password updated for ${pwdUser.full_name}`)
    setPwdForm({password:'',confirm:''})
  }

  async function generateAndSet(){
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!'
    const pwd=Array.from({length:10},()=>chars[Math.floor(Math.random()*chars.length)]).join('')
    setPwdForm({password:pwd,confirm:pwd})
    setShowPwd(true)
    setPwdErr(''); setPwdSuccess('')
  }

  async function save(){
    if(!form.full_name||!form.email||!form.password)return setErr('Fill all required fields')
    setBusy(true);setErr('')
    const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,role:'teacher'})})
    const d=await r.json()
    if(!r.ok){setErr(d.error||'Error');setBusy(false);return}
    setBusy(false);setOpen(false);setForm({full_name:'',email:'',phone:'',password:''});reload()
  }

  async function handleImport(rows:any[]){
    setBusy(true);let ok=0,fail=0
    for(const row of rows){
      const mapped=mapStaff(row)
      if(!mapped.full_name||!mapped.email){fail++;continue}
      const tempPass='HumStrum@'+Math.floor(1000+Math.random()*9000)
      const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...mapped,password:tempPass})})
      if(r.ok)ok++;else{const d=await r.json();console.error(mapped.full_name,d.error);fail++}
    }
    setBusy(false);setImportResult(`✓ ${ok} staff imported${fail>0?`, ${fail} failed. Check console.`:'. Temp passwords: HumStrum@XXXX'}`);setImportOpen(false);reload()
  }

  async function del(id:string){if(!confirm('Delete?'))return;await fetch(`/api/admin?id=${id}`,{method:'DELETE'});reload()}

  const roleColor:Record<string,string>={teacher:'bg-emerald-50 text-emerald-700',center_manager:'bg-blue-50 text-blue-700'}
  const roleLabel:Record<string,string>={teacher:'Teacher',center_manager:'Center Manager'}

  return(
    <div className="animate-fu">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-xl font-semibold text-gray-900">Staff</h1><p className="text-sm text-gray-400 mt-0.5">{teachers.length} staff members</p></div>
        <div className="flex gap-2"><button onClick={()=>setImportOpen(true)} className="btn"><Upload className="w-4 h-4"/> Import Staff CSV</button><button onClick={()=>setOpen(true)} className="btn-primary"><Plus className="w-4 h-4"/> Add Teacher</button></div>
      </div>
      {importResult&&<div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-100">{importResult}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teachers.map((t:any,i:number)=>{
          const tSubs=subjects.filter((s:any)=>s.teacher_id===t.id)
          return(<div key={t.id} className="card p-5 hover:shadow-md transition-shadow">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <Avatar name={t.full_name} i={i}/>
                <div>
                  <div className="font-medium text-gray-900">{t.full_name}</div>
                  <span className={clsx('badge text-xs',roleColor[t.role]||roleColor.teacher)}>{roleLabel[t.role]||'Teacher'}</span>
                </div>
              </div>
              <button onClick={()=>del(t.id)} className="btn btn-sm btn-danger"><Trash2 className="w-3 h-3"/></button>
            </div>
            {/* Contact */}
            <div className="space-y-1 mb-3">
              <div className="text-xs text-gray-400 flex items-center gap-1.5"><Mail className="w-3 h-3"/>{t.email}</div>
              {t.phone&&<div className="text-xs text-gray-400 flex items-center gap-1.5"><Phone className="w-3 h-3"/>{t.phone}</div>}
            </div>
            {/* Subjects */}
            <div className="flex flex-wrap gap-1 mb-4">{tSubs.map((s:any)=><span key={s.id} className={clsx('badge',colorBadge[s.color]||colorBadge.violet)}>{s.name}</span>)}{!tSubs.length&&<span className="text-xs text-gray-300">No subjects assigned</span>}</div>
            {/* Action buttons */}
            <div className="flex gap-2">
              <button onClick={()=>openEditUser(t)} className="flex-1 btn btn-sm justify-center text-gray-600 hover:bg-gray-100">
                <Edit className="w-3.5 h-3.5"/> Edit
              </button>
              <button onClick={()=>openResetPwd(t)} className="flex-1 btn btn-sm justify-center text-brand-600 border-brand-200 hover:bg-brand-50">
                <KeyRound className="w-3.5 h-3.5"/> Password
              </button>
            </div>
          </div>)
        })}
        {!teachers.length&&<div className="col-span-3 text-center py-16 text-gray-300">No staff yet. Import your staff CSV to get started.</div>}
      </div>

      {/* Edit Staff Modal */}
      <Modal open={editOpen} onClose={()=>setEditOpen(false)} title={`Edit — ${editUser?.full_name||''}`}>
        <div className="space-y-3">
          {editErr&&<div className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100">{editErr}</div>}
          <div><label className="label">Full Name *</label><input className="input" value={editForm.full_name} onChange={e=>setEditForm(f=>({...f,full_name:e.target.value}))}/></div>
          <div><label className="label">Email *</label><input className="input" type="email" value={editForm.email} onChange={e=>setEditForm(f=>({...f,email:e.target.value}))}/></div>
          <div><label className="label">Phone</label><input className="input" value={editForm.phone} onChange={e=>setEditForm(f=>({...f,phone:e.target.value}))}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Staff Role (display)</label>
              <select className="input" value={editForm.staff_role} onChange={e=>setEditForm(f=>({...f,staff_role:e.target.value}))}>
                <option value="">— Select —</option>
                <option>Teacher</option>
                <option>Administrator</option>
                <option>Owner</option>
                <option>Coordinator</option>
              </select>
            </div>
            <div>
              <label className="label">System Role</label>
              <select className="input" value={editForm.role} onChange={e=>setEditForm(f=>({...f,role:e.target.value as Role}))}>
                <option value="teacher">Teacher</option>
                <option value="center_manager">Center Manager</option>
                <option value="superadmin">Super Admin</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn" onClick={()=>setEditOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={saveEditUser} disabled={editBusy}>
              {editBusy?<Loader2 className="w-4 h-4 animate-spin"/>:<Edit className="w-4 h-4"/>}
              Save Changes
            </button>
          </div>
        </div>
      </Modal>

      {/* Password Reset Modal */}
      <Modal open={pwdOpen} onClose={()=>setPwdOpen(false)} title={`Reset Password — ${pwdUser?.full_name||''}`}>
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-3 text-sm">
            <div className="text-xs text-gray-400 mb-1">Account</div>
            <div className="font-medium text-gray-900">{pwdUser?.full_name}</div>
            <div className="text-xs text-gray-500">{pwdUser?.email}</div>
          </div>

          {pwdErr&&<div className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100">{pwdErr}</div>}
          {pwdSuccess&&<div className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-100">{pwdSuccess}</div>}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">New Password *</label>
              <button onClick={generateAndSet} className="text-xs text-brand-500 hover:text-brand-700 flex items-center gap-1">
                <RefreshCw className="w-3 h-3"/> Generate
              </button>
            </div>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPwd?'text':'password'}
                value={pwdForm.password}
                onChange={e=>setPwdForm(f=>({...f,password:e.target.value}))}
                placeholder="Min 8 characters"
                autoComplete="new-password"
              />
              <button type="button" onClick={()=>setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPwd?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}
              </button>
            </div>
            {pwdForm.password&&<div className={clsx('text-xs mt-1',pwdForm.password.length>=8?'text-emerald-600':'text-red-400')}>{pwdForm.password.length>=8?'✓ Strong enough':'Too short — need at least 8 characters'}</div>}
          </div>

          <div>
            <label className="label">Confirm Password *</label>
            <input
              className={clsx('input',pwdForm.confirm&&pwdForm.confirm!==pwdForm.password?'border-red-300':'')}
              type={showPwd?'text':'password'}
              value={pwdForm.confirm}
              onChange={e=>setPwdForm(f=>({...f,confirm:e.target.value}))}
              placeholder="Re-enter password"
              autoComplete="new-password"
            />
            {pwdForm.confirm&&pwdForm.confirm!==pwdForm.password&&<div className="text-xs text-red-400 mt-1">Passwords do not match</div>}
            {pwdForm.confirm&&pwdForm.confirm===pwdForm.password&&pwdForm.password.length>=8&&<div className="text-xs text-emerald-600 mt-1">✓ Passwords match</div>}
          </div>

          {showPwd&&pwdForm.password&&(
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-xs text-amber-700">
              <strong>Remember to share this password</strong> with {pwdUser?.full_name} securely — via WhatsApp or in person. They should change it after first login.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn" onClick={()=>setPwdOpen(false)}>Close</button>
            <button
              className="btn-primary"
              onClick={savePassword}
              disabled={busy||!pwdForm.password||pwdForm.password!==pwdForm.confirm||pwdForm.password.length<8}
            >
              {busy?<Loader2 className="w-4 h-4 animate-spin"/>:<KeyRound className="w-4 h-4"/>}
              {busy?'Updating…':'Set Password'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={open} onClose={()=>setOpen(false)} title="Add Teacher">
        <div className="space-y-3">
          {err&&<div className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm">{err}</div>}
          <div><label className="label">Full Name *</label><input className="input" value={form.full_name} onChange={e=>setForm(f=>({...f,full_name:e.target.value}))}/></div>
          <div><label className="label">Email *</label><input className="input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
          <div><label className="label">Password *</label><input className="input" type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Min 8 chars"/></div>
          <div className="flex justify-end gap-2 pt-2"><button className="btn" onClick={()=>setOpen(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy?<Loader2 className="w-4 h-4 animate-spin"/>:null}Add Teacher</button></div>
        </div>
      </Modal>
      <Modal open={importOpen} onClose={()=>setImportOpen(false)} title="Import Staff from CSV" wide>
        <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">Staff will be created with temporary password <strong>HumStrum@XXXX</strong>. Ask them to change on first login.</div>
        <ImportPanel type="staff" onImport={handleImport}/>
      </Modal>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════ SUBJECTS
const GRADE_LEVELS_LIST = ['All Levels', 'Beginner–Grade 2', 'Grade 3–5', 'Grade 6–8']

function SubjectsTab({subjects,profiles,students,fees,subjectTeachers,reload}:any){
  const supabase=sb()
  const teachers=profiles.filter((p:any)=>['teacher','center_manager','superadmin'].includes(p.role))

  // Subject add/edit
  const [open,setOpen]=useState(false)
  const [editing,setEditing]=useState<any>(null)
  const [form,setForm]=useState({name:'',code:'',level:'',color:'violet'})
  const [busy,setBusy]=useState(false)

  // Teacher assignment modal
  const [teacherOpen,setTeacherOpen]=useState(false)
  const [teacherSubject,setTeacherSubject]=useState<any>(null)
  const [tForm,setTForm]=useState({teacher_id:'',grade_level:'All Levels',is_primary:false})
  const [tBusy,setTBusy]=useState(false)

  const openAdd=()=>{setEditing(null);setForm({name:'',code:'',level:'',color:'violet'});setOpen(true)}
  const openEdit=(s:any)=>{setEditing(s);setForm({name:s.name,code:s.code,level:s.level||'',color:s.color||'violet'});setOpen(true)}

  async function save(){
    if(!form.name.trim())return;setBusy(true)
    const p={name:form.name.trim(),code:form.code.toUpperCase(),level:form.level||null,color:form.color}
    if(editing)await supabase.from('subjects').update(p).eq('id',editing.id)
    else await supabase.from('subjects').insert(p)
    setBusy(false);setOpen(false);reload()
  }

  async function del(id:string){
    if(!confirm('Delete subject? This will also remove all teacher assignments.'))return
    await supabase.from('subjects').delete().eq('id',id);reload()
  }

  // Teacher assignment
  function openTeacherAssign(s:any){
    setTeacherSubject(s)
    setTForm({teacher_id:'',grade_level:'All Levels',is_primary:false})
    setTeacherOpen(true)
  }

  async function addTeacher(){
    if(!tForm.teacher_id||!teacherSubject)return
    setTBusy(true)
    await supabase.from('subject_teachers').upsert({
      subject_id: teacherSubject.id,
      teacher_id: tForm.teacher_id,
      grade_level: tForm.grade_level,
      is_primary: tForm.is_primary,
    },{onConflict:'subject_id,teacher_id,grade_level'})
    // If primary, also update the legacy teacher_id on subjects
    if(tForm.is_primary){
      await supabase.from('subjects').update({teacher_id:tForm.teacher_id}).eq('id',teacherSubject.id)
    }
    setTBusy(false)
    setTForm({teacher_id:'',grade_level:'All Levels',is_primary:false})
    reload()
  }

  async function removeTeacher(stId:string, subjectId:string, teacherId:string){
    await supabase.from('subject_teachers').delete().eq('id',stId)
    // If this was the primary teacher, clear the legacy field
    const sub=subjects.find((s:any)=>s.id===subjectId)
    if(sub?.teacher_id===teacherId){
      await supabase.from('subjects').update({teacher_id:null}).eq('id',subjectId)
    }
    reload()
  }

  async function setPrimary(stId:string, subjectId:string, teacherId:string){
    // Clear all primary for this subject first
    await supabase.from('subject_teachers').update({is_primary:false}).eq('subject_id',subjectId)
    await supabase.from('subject_teachers').update({is_primary:true}).eq('id',stId)
    await supabase.from('subjects').update({teacher_id:teacherId}).eq('id',subjectId)
    reload()
  }

  const gradeColor:Record<string,string>={
    'All Levels':'bg-gray-100 text-gray-600',
    'Beginner–Grade 2':'bg-emerald-50 text-emerald-700',
    'Grade 3–5':'bg-blue-50 text-blue-700',
    'Grade 6–8':'bg-purple-50 text-purple-700',
  }

  return(
    <div className="animate-fu">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-xl font-semibold text-gray-900">Subjects</h1><p className="text-sm text-gray-400 mt-0.5">{subjects.length} courses</p></div>
        <button onClick={openAdd} className="btn-primary"><Plus className="w-4 h-4"/> Add Subject</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.map((s:any)=>{
          const enrolled=students.filter((st:any)=>(st.student_subjects||[]).some((ss:any)=>ss.subject_id===s.id)).length
          const fee=fees.find((f:any)=>f.subject_id===s.id)
          const sTeachers=(subjectTeachers||[]).filter((st:any)=>st.subject_id===s.id)
          const primaryT=sTeachers.find((st:any)=>st.is_primary)||sTeachers[0]

          return(
            <div key={s.id} className="card p-5 hover:shadow-md transition-shadow">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <span className={clsx('badge',colorBadge[s.color]||colorBadge.violet)}>{s.code||s.name.slice(0,3).toUpperCase()}</span>
                <div className="flex gap-1">
                  <button onClick={()=>openEdit(s)} className="btn btn-sm"><Edit className="w-3 h-3"/></button>
                  <button onClick={()=>del(s.id)} className="btn btn-sm btn-danger"><Trash2 className="w-3 h-3"/></button>
                </div>
              </div>

              <div className="font-semibold text-gray-900 mb-0.5">{s.name}</div>
              <div className="text-xs text-gray-400 mb-3">{s.level}</div>

              {/* Stats */}
              <div className="flex gap-3 text-xs mb-3">
                <div className="flex-1 bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                  <div className="font-semibold text-gray-900">{enrolled}</div>
                  <div className="text-gray-400">students</div>
                </div>
                <div className="flex-1 bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                  <div className="font-semibold text-brand-600">{fee?fmt(fee.amount):'—'}</div>
                  <div className="text-gray-400">base fee</div>
                </div>
              </div>

              {/* Teachers by grade */}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Teachers</span>
                  <button onClick={()=>openTeacherAssign(s)} className="text-xs text-brand-500 hover:text-brand-700 flex items-center gap-1">
                    <Plus className="w-3 h-3"/> Assign
                  </button>
                </div>
                {sTeachers.length===0
                  ? <div className="text-xs text-gray-300">No teachers assigned</div>
                  : <div className="space-y-1.5">
                      {sTeachers.map((st:any)=>(
                        <div key={st.id} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0', ac(0))}>
                              {ini(st.profiles?.full_name||'?')}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-gray-800 truncate">{st.profiles?.full_name}</div>
                              <span className={clsx('badge text-xs', gradeColor[st.grade_level]||gradeColor['All Levels'])}>{st.grade_level}</span>
                              {st.is_primary && <span className="ml-1 text-xs text-amber-600 font-medium">★</span>}
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            {!st.is_primary&&<button onClick={()=>setPrimary(st.id,s.id,st.teacher_id)} title="Set as primary" className="text-xs text-gray-300 hover:text-amber-500 px-1">★</button>}
                            <button onClick={()=>removeTeacher(st.id,s.id,st.teacher_id)} className="text-gray-300 hover:text-red-500"><X className="w-3 h-3"/></button>
                          </div>
                        </div>
                      ))}
                    </div>
                }
              </div>
            </div>
          )
        })}
      </div>

      {/* Add/Edit Subject Modal */}
      <Modal open={open} onClose={()=>setOpen(false)} title={editing?'Edit Subject':'Add Subject'}>
        <div className="space-y-3">
          <div><label className="label">Subject Name *</label><input className="input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Code</label><input className="input" value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value}))} placeholder="e.g. GTR" maxLength={5}/></div>
            <div><label className="label">Color</label><select className="input" value={form.color} onChange={e=>setForm(f=>({...f,color:e.target.value}))}>{COLORS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          <div><label className="label">Level / Description</label><input className="input" value={form.level} onChange={e=>setForm(f=>({...f,level:e.target.value}))} placeholder="e.g. Beginner–Advanced"/></div>
          <p className="text-xs text-gray-400">After saving, use the Assign button on the card to add teachers per grade level.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn" onClick={()=>setOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={busy}>{busy?<Loader2 className="w-4 h-4 animate-spin"/>:null}{editing?'Save':'Add Subject'}</button>
          </div>
        </div>
      </Modal>

      {/* Assign Teacher Modal */}
      <Modal open={teacherOpen} onClose={()=>setTeacherOpen(false)} title={`Assign Teacher — ${teacherSubject?.name||''}`} wide>
        <div className="space-y-5">
          {/* Current assignments */}
          {teacherSubject && (()=>{
            const sTeachers=(subjectTeachers||[]).filter((st:any)=>st.subject_id===teacherSubject.id)
            return sTeachers.length>0?(
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Current Assignments</div>
                <div className="space-y-2">
                  {sTeachers.map((st:any)=>(
                    <div key={st.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold', ac(0))}>{ini(st.profiles?.full_name||'?')}</div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{st.profiles?.full_name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={clsx('badge text-xs',gradeColor[st.grade_level]||gradeColor['All Levels'])}>{st.grade_level}</span>
                            {st.is_primary&&<span className="badge bg-amber-50 text-amber-700 text-xs">★ Primary</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {!st.is_primary&&(
                          <button onClick={()=>setPrimary(st.id,teacherSubject.id,st.teacher_id)} className="btn btn-sm text-amber-600 border-amber-200 hover:bg-amber-50">
                            ★ Set Primary
                          </button>
                        )}
                        <button onClick={()=>removeTeacher(st.id,teacherSubject.id,st.teacher_id)} className="btn btn-sm btn-danger">
                          <X className="w-3 h-3"/> Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ):null
          })()}

          {/* Add new assignment */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Add Teacher</div>
            <div className="space-y-3">
              <div>
                <label className="label">Teacher *</label>
                <select className="input" value={tForm.teacher_id} onChange={e=>setTForm(f=>({...f,teacher_id:e.target.value}))}>
                  <option value="">— Select teacher —</option>
                  {teachers.map((t:any)=><option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Grade Level</label>
                <div className="grid grid-cols-2 gap-2">
                  {GRADE_LEVELS_LIST.map(g=>(
                    <button
                      key={g}
                      type="button"
                      onClick={()=>setTForm(f=>({...f,grade_level:g}))}
                      className={clsx('px-3 py-2 rounded-lg border text-sm font-medium transition-all text-left',
                        tForm.grade_level===g
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tForm.is_primary}
                  onChange={e=>setTForm(f=>({...f,is_primary:e.target.checked}))}
                  className="rounded border-gray-300 text-brand-500"
                />
                <div>
                  <div className="text-sm font-medium text-gray-700">Set as primary teacher</div>
                  <div className="text-xs text-gray-400">Primary teacher appears on class schedules and reminders</div>
                </div>
              </label>
              <button
                onClick={addTeacher}
                disabled={!tForm.teacher_id||tBusy}
                className="btn-primary w-full justify-center"
              >
                {tBusy?<Loader2 className="w-4 h-4 animate-spin"/>:<Plus className="w-4 h-4"/>}
                Assign Teacher
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════ SCHEDULE + EMAIL REMINDERS
// ── Schedule view helpers (top-level to avoid JSX nesting errors) ──

function renderWeekView(p:any){
  const {visible,WORKING_DAYS,SLOT_TIMES,isBlocked,toggleBlock,isTeacher,
         setReminderCls,setReminderOpen,setSentResult,subById,profiles,centerHours} = p
  const todayAbbr = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()]
  function isWithinHours(day:string,time:string){
    const h=(centerHours||[]).find((c:any)=>c.day_of_week===day)
    if(!h||h.is_closed) return false
    return time>=h.open_time?.slice(0,5) && time<h.close_time?.slice(0,5)
  }
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{minWidth:700}}>
          <thead>
            <tr>
              <th className="bg-gray-50 border-b border-r border-gray-100 px-2 py-2 text-gray-400 font-mono w-14 text-center">Time</th>
              {WORKING_DAYS.map((d:string)=>(
                <th key={d} className={clsx('bg-gray-50 border-b border-gray-100 px-2 py-2 text-center font-semibold text-xs',
                  d===todayAbbr?'text-brand-600 bg-brand-50/50':'text-gray-500')}>
                  <div>{d}</div>
                  {d===todayAbbr&&<div className="text-xs text-brand-400 font-normal">Today</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOT_TIMES.map((time:string)=>{
              const hasAny=WORKING_DAYS.some((d:string)=>visible.some((sc:any)=>sc.day_of_week===d&&sc.start_time?.slice(0,5)===time))
              const isHour=time.endsWith(':00')
              if(!isHour&&!hasAny) return null
              return (
                <tr key={time} className={isHour?'border-t border-gray-100':''}>
                  <td className={clsx('border-r border-gray-100 px-2 text-center font-mono',isHour?'py-1.5 text-gray-400':'py-0.5 text-gray-300 text-xs')}>
                    {isHour?time:<span className="opacity-50">{time.slice(3)}</span>}
                  </td>
                  {WORKING_DAYS.map((day:string)=>{
                    const cls=visible.filter((sc:any)=>sc.day_of_week===day&&sc.start_time?.slice(0,5)===time)
                    const blocked=isBlocked(day,time)
                    const open=isWithinHours(day,time)
                    if(!open&&!cls.length){
                      return <td key={day} className="px-1 py-0.5 align-top bg-gray-50/60" style={{minHeight:28}}/>
                    }
                    return (
                      <td key={day}
                        className={clsx('px-1 py-0.5 align-top transition-colors group',
                          blocked?'bg-red-50':(!cls.length&&!isTeacher)?'hover:bg-gray-50/80 cursor-pointer':'')}
                        style={{minHeight:28}}
                        onClick={()=>{ if(!cls.length&&!isTeacher&&open) toggleBlock(day,time) }}
                        title={(!cls.length&&!isTeacher&&open)?(blocked?'Click to unblock':'Click to block slot'):''}
                      >
                        {blocked&&!cls.length&&(
                          <div className="rounded-lg px-2 py-1.5 mb-0.5 text-xs bg-red-100 text-red-400 border border-red-200 flex items-center gap-1">
                            <span>🚫</span>
                            <span className="font-medium">Blocked</span>
                            {!isTeacher&&(
                              <button
                                onClick={e=>{e.stopPropagation();toggleBlock(day,time)}}
                                className="ml-auto text-red-300 hover:text-red-500 text-xs">✕</button>
                            )}
                          </div>
                        )}
                        {!blocked&&!cls.length&&!isTeacher&&(
                          <div className="rounded px-1 py-1 text-xs text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity text-center">+ block</div>
                        )}
                        {cls.map((c:any)=>{
                          const sub=subById(c.subject_id)
                          const stuCount=(c.schedule_students||[]).length
                          const teacher=profiles.find((pr:any)=>pr.id===sub?.teacher_id)
                          if(!sub) return null
                          return (
                            <div key={c.id}
                              className={clsx('rounded-lg px-2 py-1.5 mb-0.5 text-xs font-medium cursor-pointer hover:opacity-80 border',colorCell[sub.color]||colorCell.violet)}
                              onClick={e=>{e.stopPropagation();setReminderCls(c);setReminderOpen(true);setSentResult('')}}>
                              <div className="font-semibold truncate">{sub.name}</div>
                              <div className="opacity-70">{c.duration_minutes}m · {stuCount} stu</div>
                              {teacher&&<div className="opacity-60 truncate">{teacher.full_name.split(' ')[0]}</div>}
                            </div>
                          )
                        })}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function renderDayView(p:any){
  const {visible,selectedDate,setSelectedDate,isTeacher,subById,profiles,
         students,setReminderCls,setReminderOpen,setSentResult,del} = p
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const dayName=dayNames[selectedDate.getDay()]
  const isHoliday=dayName==='Mon'
  const dayClasses=[...visible].filter((sc:any)=>sc.day_of_week===dayName)
    .sort((a:any,b:any)=>a.start_time?.localeCompare(b.start_time))
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={()=>{const d=new Date(selectedDate);d.setDate(d.getDate()-1);setSelectedDate(d)}} className="btn btn-sm">← Prev</button>
        <div className="text-center">
          <div className="font-semibold text-gray-900">{selectedDate.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}</div>
          {isHoliday&&<div className="text-xs text-red-500 mt-0.5">🚫 Monday — Holiday</div>}
        </div>
        <button onClick={()=>{const d=new Date(selectedDate);d.setDate(d.getDate()+1);setSelectedDate(d)}} className="btn btn-sm">Next →</button>
      </div>
      {isHoliday?(
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <h3 className="font-semibold text-gray-900 mb-1">Monday — Holiday</h3>
          <p className="text-sm text-gray-400">No classes on Mondays.</p>
        </div>
      ):dayClasses.length===0?(
        <div className="card p-12 text-center text-gray-300">
          <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30"/>
          <p>No classes on {dayName}</p>
        </div>
      ):(
        <div className="space-y-2">
          {dayClasses.map((c:any)=>{
            const sub=subById(c.subject_id)
            const teacher=profiles.find((pr:any)=>pr.id===sub?.teacher_id)
            const stuNames=(c.schedule_students||[])
              .map((ss:any)=>students.find((st:any)=>st.id===ss.student_id))
              .filter(Boolean)
            return (
              <div key={c.id} className="card p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',colorBadge[sub?.color]||colorBadge.violet)}>
                      <span className="font-bold text-sm">{sub?.code}</span>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{sub?.name}</div>
                      <div className="text-xs text-gray-400">{c.start_time?.slice(0,5)} · {c.duration_minutes} min</div>
                      {teacher&&<div className="text-xs text-gray-400 mt-0.5">👤 {teacher.full_name}</div>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={()=>{setReminderCls(c);setReminderOpen(true);setSentResult('')}} className="btn btn-sm text-brand-600 border-brand-200">
                      <Mail className="w-3 h-3"/>
                    </button>
                    {!isTeacher&&<button onClick={()=>del(c.id)} className="btn btn-sm btn-danger"><Trash2 className="w-3 h-3"/></button>}
                  </div>
                </div>
                <div className="border-t border-gray-100 pt-2">
                  <div className="text-xs text-gray-400 mb-1.5">Students ({stuNames.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {stuNames.map((s:any)=>(
                      <span key={s.id} className="badge bg-gray-100 text-gray-600 text-xs">{s.full_name}</span>
                    ))}
                    {!stuNames.length&&<span className="text-xs text-gray-300">No students assigned</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function renderMonthView(p:any){
  const {visible,selectedDate,setSelectedDate,setViewMode,subById}=p
  const year=selectedDate.getFullYear()
  const month=selectedDate.getMonth()
  const firstDay=new Date(year,month,1).getDay()
  const daysInMonth=new Date(year,month+1,0).getDate()
  const today=new Date()
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const cells:Array<number|null>=[
    ...Array(firstDay).fill(null),
    ...Array.from({length:daysInMonth},(_,i)=>i+1)
  ]
  while(cells.length%7!==0) cells.push(null)

  function classesOnDay(dayNum:number){
    const dn=dayNames[new Date(year,month,dayNum).getDay()]
    return visible.filter((sc:any)=>sc.day_of_week===dn)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={()=>{const d=new Date(selectedDate);d.setMonth(d.getMonth()-1);setSelectedDate(d)}} className="btn btn-sm">← Prev</button>
        <div className="font-semibold text-gray-900">{selectedDate.toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</div>
        <button onClick={()=>{const d=new Date(selectedDate);d.setMonth(d.getMonth()+1);setSelectedDate(d)}} className="btn btn-sm">Next →</button>
      </div>
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100">
          {dayNames.map(d=>(
            <div key={d} className={clsx('px-2 py-2 text-xs font-semibold text-center',d==='Mon'?'text-red-400 bg-red-50/50':'text-gray-400 bg-gray-50')}>
              {d}
              {d==='Mon'&&<span className="block text-xs font-normal text-red-300">Holiday</span>}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day,i)=>{
            if(!day) return <div key={i} className="border-b border-r border-gray-50 min-h-[80px] bg-gray-50/30"/>
            const isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear()
            const dn=dayNames[new Date(year,month,day).getDay()]
            const isHoliday=dn==='Mon'
            const dayCls=classesOnDay(day)
            return (
              <div key={i}
                className={clsx('border-b border-r border-gray-100 min-h-[80px] p-1.5 cursor-pointer transition-colors',
                  isHoliday?'bg-red-50/30':isToday?'bg-brand-50/30':'hover:bg-gray-50/50',
                  (i+1)%7===0?'border-r-0':'')}
                onClick={()=>{ if(!isHoliday){setSelectedDate(new Date(year,month,day));setViewMode('day')} }}>
                <div className={clsx('text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                  isToday?'bg-brand-500 text-white':isHoliday?'text-red-300':'text-gray-600')}>
                  {day}
                </div>
                {isHoliday&&<div className="text-xs text-red-300">Closed</div>}
                {dayCls.slice(0,3).map((c:any)=>{
                  const sub=subById(c.subject_id)
                  if(!sub) return null
                  return (
                    <div key={c.id} className={clsx('text-xs px-1 py-0.5 rounded mb-0.5 truncate',colorCell[sub.color]||colorCell.violet)}>
                      {c.start_time?.slice(0,5)} {sub.code}
                    </div>
                  )
                })}
                {dayCls.length>3&&<div className="text-xs text-gray-400">+{String(dayCls.length-3)} more</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


function ScheduleTab({schedules,subjects,students,profiles,profile,perms,reload}:any){
  const supabase=sb()
  const isTeacher=profile.role==='teacher'

  // View mode
  const [viewMode,setViewMode]=useState<'week'|'day'|'month'>('week')
  const [selectedDate,setSelectedDate]=useState(new Date())
  const [filterTeacher,setFilterTeacher]=useState<string>('all')
  const [filterSubject,setFilterSubject]=useState<string>('all')

  // Add class modal
  const [open,setOpen]=useState(false)
  const [reminderOpen,setReminderOpen]=useState(false)
  const [reminderCls,setReminderCls]=useState<any>(null)
  const [form,setForm]=useState({subject_id:'',day_of_week:'Sun',start_time:'10:00',duration_minutes:60,student_ids:[] as string[],studentSearch:''})
  const [busy,setBusy]=useState(false)
  const [reminderMsg,setReminderMsg]=useState('')
  const [sending,setSending]=useState(false)
  const [sentResult,setSentResult]=useState('')

  // Blocked slots
  const [blockedSlots,setBlockedSlots]=useState<any[]>([])
  const [rescheduleRequests,setRescheduleRequests]=useState<any[]>([])
  const [reviewModal,setReviewModal]=useState<any>(null)
  const [reviewBusy,setReviewBusy]=useState(false)
  const [reviewNote,setReviewNote]=useState('')

  // Center hours
  const [centerHours,setCenterHours]=useState<any[]>([])
  useEffect(()=>{ loadCenterHours() },[])
  async function loadCenterHours(){
    const r=await fetch('/api/center-hours')
    const d=await r.json()
    setCenterHours(d.hours||[])
  }

  useEffect(()=>{ loadRescheduleRequests() },[])
  async function loadRescheduleRequests(){
    const r=await fetch('/api/reschedule')
    const d=await r.json()
    setRescheduleRequests(d.requests||[])
  }
  async function reviewRequest(action:'approve'|'reject'){
    if(!reviewModal)return
    setReviewBusy(true)
    const r=await fetch('/api/reschedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:reviewModal.id,action,review_note:reviewNote})})
    const d=await r.json()
    setReviewBusy(false)
    if(r.ok){ setReviewModal(null);setReviewNote('');loadRescheduleRequests();reload() }
    else alert(d.error||'Error reviewing request')
  }
  const [blockModal,setBlockModal]=useState<{day:string,time:string}|null>(null)
  const [blockReason,setBlockReason]=useState('')
  const [blockBusy,setBlockBusy]=useState(false)

  useEffect(()=>{ loadBlocked() },[])
  async function loadBlocked(){
    const{data}=await supabase.from('blocked_slots').select('*')
    setBlockedSlots(data||[])
  }
  function isBlocked(day:string,time:string){
    return blockedSlots.some(b=>b.day_of_week===day&&b.start_time?.slice(0,5)===time)
  }
  async function toggleBlock(day:string,time:string){
    const existing=blockedSlots.find(b=>b.day_of_week===day&&b.start_time?.slice(0,5)===time)
    if(existing){
      await supabase.from('blocked_slots').delete().eq('id',existing.id)
    } else {
      setBlockModal({day,time});setBlockReason('')
    }
    loadBlocked()
  }
  async function confirmBlock(){
    if(!blockModal)return
    setBlockBusy(true)
    await supabase.from('blocked_slots').upsert({day_of_week:blockModal.day,start_time:blockModal.time,reason:blockReason||null,created_by:profile.id},{onConflict:'day_of_week,start_time'})
    setBlockBusy(false);setBlockModal(null);loadBlocked()
  }

  const DAY_LABELS: Record<string,string> = { Sun:'Sunday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday', Mon:'Monday' }
  const WORKING_DAYS = centerHours.length
    ? centerHours.filter((h:any)=>!h.is_closed).map((h:any)=>h.day_of_week).sort((a:string,b:string)=>['Sun','Tue','Wed','Thu','Fri','Sat'].indexOf(a)-['Sun','Tue','Wed','Thu','Fri','Sat'].indexOf(b))
    : ['Sun','Tue','Wed','Thu','Fri','Sat'] // fallback while loading

  // 60-minute slots, computed per-day from open/close time (union across all working days for the grid)
  function hourSlotsForDay(day:string):string[] {
    const h = centerHours.find((c:any)=>c.day_of_week===day)
    if (!h || h.is_closed) return []
    const slots:string[] = []
    let [oh] = h.open_time.split(':').map(Number)
    let [ch] = h.close_time.split(':').map(Number)
    for (let hr=oh; hr<ch; hr++) slots.push(`${String(hr).padStart(2,'0')}:00`)
    return slots
  }
  // Union of all hour slots across working days — used for the weekly grid's row labels
  const SLOT_TIMES = Array.from(new Set(WORKING_DAYS.flatMap((d:string)=>hourSlotsForDay(d)))).sort()

  // Computed visible schedules
  const teachers = profiles.filter((p:any)=>['teacher','center_manager','superadmin'].includes(p.role))

  const visible = schedules.filter((sc:any)=>{
    const sub = subjects.find((s:any)=>s.id===sc.subject_id)
    if (!sub) return false
    if (isTeacher && sub.teacher_id !== profile.id) return false
    if (filterTeacher !== 'all' && sub.teacher_id !== filterTeacher) return false
    if (filterSubject !== 'all' && sc.subject_id !== filterSubject) return false
    return true
  })

  const subById=(id:string)=>subjects.find((s:any)=>s.id===id)

  async function save(){
    if(!form.subject_id)return;setBusy(true)
    const{data:cls}=await supabase.from('class_schedules').insert({subject_id:form.subject_id,day_of_week:form.day_of_week,start_time:form.start_time,duration_minutes:form.duration_minutes}).select().single()
    if(cls&&form.student_ids.length)await supabase.from('schedule_students').insert(form.student_ids.map(sid=>({schedule_id:cls.id,student_id:sid})))
    setBusy(false);setOpen(false);reload()
  }
  async function del(id:string){if(!confirm('Remove class?'))return;await supabase.from('class_schedules').delete().eq('id',id);reload()}
  async function sendReminders(){
    if(!reminderCls)return;setSending(true);setSentResult('')
    const schedStudentIds=(reminderCls.schedule_students||[]).map((ss:any)=>ss.student_id)
    const sub=subjects.find((s:any)=>s.id===reminderCls.subject_id)
    const r=await fetch('/api/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'class_reminder',scheduleId:reminderCls.id,studentIds:schedStudentIds,teacherIds:sub?.teacher_id?[sub.teacher_id]:[],customMessage:reminderMsg})})
    const d=await r.json()
    setSending(false);setSentResult(d.ok?`✓ Sent ${d.sent} emails`:`Error: ${d.error}`)
  }

  // ── View rendering (inline in JSX below) ──────────────────

  return(
    <div className="animate-fu">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{isTeacher?'My Schedule':'Class Schedule'}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">Mon = Holiday · Sun = Working Day</span>
          </div>
        </div>
        {!isTeacher&&<button onClick={()=>setOpen(true)} className="btn-primary"><Plus className="w-4 h-4"/> Add Class</button>}
      </div>

      {/* Pending reschedule requests banner */}
      {!isTeacher&&rescheduleRequests.filter((r:any)=>r.status==='pending').length>0&&(
        <div className="card mb-4 border-amber-200 overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600"/>
            <span className="text-sm font-semibold text-amber-800">{rescheduleRequests.filter((r:any)=>r.status==='pending').length} reschedule request{rescheduleRequests.filter((r:any)=>r.status==='pending').length!==1?'s':''} awaiting review</span>
          </div>
          {rescheduleRequests.filter((r:any)=>r.status==='pending').map((r:any)=>(
            <div key={r.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-3">
                <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0',ac(0))}>{ini(r.students?.full_name||'?')}</div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{r.students?.full_name}</div>
                  <div className="text-xs text-gray-400">
                    {r.subjects?.name} · {r.current_day||'—'} {r.current_slot_time?.slice(0,5)||''} → <strong className="text-brand-600">{r.requested_day} {r.requested_time?.slice(0,5)}</strong>
                  </div>
                  {r.reason&&<div className="text-xs text-gray-400 italic mt-0.5">"{r.reason}"</div>}
                </div>
              </div>
              <button onClick={()=>{setReviewModal(r);setReviewNote('')}} className="btn btn-sm text-brand-600 border-brand-200 hover:bg-brand-50">Review</button>
            </div>
          ))}
        </div>
      )}

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* View toggle */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          {(['week','day','month'] as const).map(v=>(
            <button key={v} onClick={()=>setViewMode(v)}
              className={clsx('px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                viewMode===v?'bg-brand-500 text-white':'text-gray-500 hover:bg-gray-50'
              )}>{v}</button>
          ))}
        </div>

        {/* Date nav for day/month */}
        {viewMode==='day'&&(
          <div className="flex items-center gap-2">
            <button onClick={()=>{const d=new Date(selectedDate);d.setDate(d.getDate()-1);setSelectedDate(d)}} className="btn btn-sm">←</button>
            <span className="text-sm font-medium text-gray-700">{selectedDate.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}</span>
            <button onClick={()=>{const d=new Date(selectedDate);d.setDate(d.getDate()+1);setSelectedDate(d)}} className="btn btn-sm">→</button>
            <button onClick={()=>setSelectedDate(new Date())} className="btn btn-sm text-brand-500">Today</button>
          </div>
        )}

        {/* Filters */}
        {!isTeacher&&(
          <>
            <select className="input py-1.5 text-sm" value={filterTeacher} onChange={e=>setFilterTeacher(e.target.value)}>
              <option value="all">All Teachers</option>
              {teachers.map((t:any)=><option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
            <select className="input py-1.5 text-sm" value={filterSubject} onChange={e=>setFilterSubject(e.target.value)}>
              <option value="all">All Instruments</option>
              {subjects.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </>
        )}

        <div className="ml-auto text-xs text-gray-400">{visible.length} classes</div>
      </div>

      {/* View content */}
      {viewMode==='week'&&renderWeekView({visible,WORKING_DAYS,SLOT_TIMES,isBlocked,toggleBlock,isTeacher,setReminderCls,setReminderOpen,setSentResult,subById,profiles,blockedSlots,centerHours})}
      {viewMode==='day'&&renderDayView({visible,selectedDate,setSelectedDate,WORKING_DAYS,DAY_LABELS,isTeacher,subById,profiles,students,setReminderCls,setReminderOpen,setSentResult,del})}
      {viewMode==='month'&&renderMonthView({visible,selectedDate,setSelectedDate,setViewMode,subById})}

      {/* List view below week */}
      {viewMode==='week'&&(
        <div className="card mt-4">
          <div className="px-5 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">All Scheduled Classes</div>
          <table className="w-full">
            <thead><tr>
              <th className="th">Subject</th>
              <th className="th">Day</th>
              <th className="th">Time</th>
              <th className="th">Duration</th>
              <th className="th">Teacher</th>
              <th className="th">Students</th>
              <th className="th w-24">Actions</th>
            </tr></thead>
            <tbody>
              {[...visible].sort((a:any,b:any)=>{
                const di=WORKING_DAYS.indexOf(a.day_of_week)-WORKING_DAYS.indexOf(b.day_of_week)
                return di||a.start_time?.localeCompare(b.start_time)
              }).map((c:any)=>{
                const sub=subById(c.subject_id)
                const teacher=profiles.find((p:any)=>p.id===sub?.teacher_id)
                const stuNames=(c.schedule_students||[]).map((ss:any)=>students.find((st:any)=>st.id===ss.student_id)).filter(Boolean)
                return(
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="td">{sub&&<span className={clsx('badge',colorBadge[sub.color]||colorBadge.violet)}>{sub.name}</span>}</td>
                    <td className="td font-medium">{c.day_of_week}</td>
                    <td className="td font-mono text-sm">{c.start_time?.slice(0,5)}</td>
                    <td className="td text-gray-400">{c.duration_minutes}m</td>
                    <td className="td text-sm text-gray-500">{teacher?.full_name||'—'}</td>
                    <td className="td"><div className="flex flex-wrap gap-1">{stuNames.slice(0,3).map((s:any)=><span key={s.id} className="badge bg-gray-100 text-gray-600 text-xs">{s.full_name.split(' ')[0]}</span>)}{stuNames.length>3&&<span className="badge bg-gray-100 text-gray-400">+{stuNames.length-3}</span>}</div></td>
                    <td className="td"><div className="flex gap-1">
                      <button onClick={()=>{setReminderCls(c);setReminderOpen(true);setSentResult('')}} className="btn btn-sm text-brand-600 border-brand-200 hover:bg-brand-50" title="Send reminders"><Mail className="w-3 h-3"/></button>
                      {!isTeacher&&<button onClick={()=>del(c.id)} className="btn btn-sm btn-danger"><Trash2 className="w-3 h-3"/></button>}
                    </div></td>
                  </tr>
                )
              })}
              {!visible.length&&<tr><td colSpan={7} className="td text-center text-gray-300 py-8">No classes scheduled</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Reminder modal */}
      <Modal open={reminderOpen} onClose={()=>setReminderOpen(false)} title="Send Class Reminders" wide>
        {reminderCls&&(()=>{
          const sub=subById(reminderCls.subject_id)
          const schedStudents=(reminderCls.schedule_students||[]).map((ss:any)=>students.find((st:any)=>st.id===ss.student_id)).filter(Boolean)
          return(
            <div className="space-y-4">
              <div className="bg-brand-50 rounded-xl p-4 text-sm">
                <div className="font-semibold text-brand-700 mb-2">📧 {sub?.name} — {reminderCls.day_of_week} at {reminderCls.start_time?.slice(0,5)}</div>
                <div className="text-xs text-brand-600">{reminderCls.duration_minutes} min · {schedStudents.length} students</div>
              </div>
              <div>
                <div className="label mb-2">Recipients</div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {schedStudents.map((s:any)=><div key={s.id} className="flex items-center justify-between text-sm px-3 py-1.5 bg-gray-50 rounded-lg">
                    <span>{s.full_name}</span>
                    <span className={clsx('text-xs',s.email?'text-gray-400':'text-red-400')}>{s.email||'No email'}</span>
                  </div>)}
                  {!schedStudents.length&&<div className="text-sm text-gray-400 px-3">No students assigned</div>}
                </div>
              </div>
              <div>
                <label className="label">Custom Note (optional)</label>
                <textarea className="input" rows={2} placeholder="e.g. Please bring your instrument" value={reminderMsg} onChange={e=>setReminderMsg(e.target.value)}/>
              </div>
              {sentResult&&<div className={clsx('px-3 py-2 rounded-lg text-sm',sentResult.startsWith('✓')?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-600')}>{sentResult}</div>}
              <div className="flex justify-end gap-2">
                <button className="btn" onClick={()=>setReminderOpen(false)}>Close</button>
                <button className="btn-primary" onClick={sendReminders} disabled={sending||!schedStudents.filter((s:any)=>s.email).length}>
                  {sending?<Loader2 className="w-4 h-4 animate-spin"/>:<Send className="w-4 h-4"/>}
                  {sending?'Sending…':`Send to ${schedStudents.filter((s:any)=>s.email).length} recipients`}
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Block slot reason modal */}
      <Modal open={!!blockModal} onClose={()=>setBlockModal(null)} title={`Block Slot — ${blockModal?.day} at ${blockModal?.time}`}>
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">
            This will prevent this time slot from being used for any class bookings.
          </div>
          <div>
            <label className="label">Reason (optional)</label>
            <input className="input" value={blockReason} onChange={e=>setBlockReason(e.target.value)} placeholder="e.g. Faculty unavailable, maintenance, holiday…" autoFocus/>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={()=>setBlockModal(null)}>Cancel</button>
            <button className="btn-primary bg-red-500 hover:bg-red-600 border-red-500" onClick={confirmBlock} disabled={blockBusy}>
              {blockBusy?<Loader2 className="w-4 h-4 animate-spin"/>:null}🚫 Block this slot
            </button>
          </div>
        </div>
      </Modal>

      {/* Add class modal */}
      {!isTeacher&&<Modal open={open} onClose={()=>setOpen(false)} title="Schedule Class" wide>
        <div className="space-y-4">
          <div>
            <label className="label">Instrument *</label>
            <select className="input" value={form.subject_id} onChange={e=>setForm((f:any)=>({...f,subject_id:e.target.value}))}>
              <option value="">— Select instrument —</option>
              {subjects.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Day</label>
              <select className="input" value={form.day_of_week} onChange={e=>setForm((f:any)=>({...f,day_of_week:e.target.value}))}>
                {WORKING_DAYS.map(d=><option key={d} value={d}>{DAY_LABELS[d]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Start Time</label>
              <select className="input" value={form.start_time} onChange={e=>setForm((f:any)=>({...f,start_time:e.target.value}))}>
                {hourSlotsForDay(form.day_of_week).map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Duration</label>
              <div className="input bg-gray-50 text-gray-500 flex items-center">60 min (fixed)</div>
            </div>
          </div>

          {/* Free slots preview */}
          {form.subject_id&&(()=>{
            const daySlots=hourSlotsForDay(form.day_of_week)
            const bookedSlots=schedules.filter((sc:any)=>sc.subject_id===form.subject_id&&sc.day_of_week===form.day_of_week).map((sc:any)=>sc.start_time?.slice(0,5))
            const conflictSlots=schedules.filter((sc:any)=>sc.day_of_week===form.day_of_week).map((sc:any)=>sc.start_time?.slice(0,5))
            const blockedForDay=blockedSlots.filter((b:any)=>b.day_of_week===form.day_of_week).map((b:any)=>b.start_time?.slice(0,5))
            return(
              <div>
                <div className="label mb-2">Slot availability for {form.day_of_week} ({daySlots[0]||'—'}–{daySlots.length?daySlots[daySlots.length-1]:'—'})</div>
                <div className="flex flex-wrap gap-1.5">
                  {daySlots.map(t=>{
                    const isBooked=bookedSlots.includes(t)
                    const hasConflict=conflictSlots.includes(t)
                    const isBlockedSlot=blockedForDay.includes(t)
                    const isSelected=form.start_time===t
                    const disabled=isBooked||isBlockedSlot
                    const blockedInfo=blockedSlots.find((b:any)=>b.day_of_week===form.day_of_week&&b.start_time?.slice(0,5)===t)
                    return(
                      <button key={t} type="button"
                        onClick={()=>!disabled&&setForm((f:any)=>({...f,start_time:t}))}
                        title={isBlockedSlot?`Blocked${blockedInfo?.reason?': '+blockedInfo.reason:''}`:isBooked?'Already booked':''}
                        className={clsx('px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition-all',
                          isBlockedSlot?'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed':
                          isBooked?'bg-red-50 text-red-400 border-red-100 cursor-not-allowed line-through':
                          isSelected?'bg-brand-500 text-white border-brand-500':
                          hasConflict?'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100 cursor-pointer':
                          'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100 cursor-pointer'
                        )}>
                        {isBlockedSlot?'🚫 ':''}{t}
                      </button>
                    )
                  })}
                </div>
                <div className="flex gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-100 inline-block"/>Free</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-100 inline-block"/>Other class</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-100 inline-block"/>Booked for subject</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gray-100 inline-block"/>🚫 Blocked</span>
                </div>
              </div>
            )
          })()}

          <div>
            <label className="label">Assign Students</label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
              <input
                className="input pl-8 py-1.5 text-sm"
                placeholder="Search student by name…"
                value={form.studentSearch||''}
                onChange={e=>setForm((f:any)=>({...f,studentSearch:e.target.value}))}
              />
            </div>
            <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto border border-gray-100 rounded-xl p-1">
              {students
                .filter((s:any)=>s.status!=='Blocked')
                .filter((s:any)=>!form.studentSearch||(s.full_name||'').toLowerCase().includes((form.studentSearch||'').toLowerCase()))
                .map((s:any)=>{
                  const st=studentStatusStyle(s.status||'Active')
                  return(
                    <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded-lg hover:bg-gray-50">
                      <input type="checkbox" checked={form.student_ids.includes(s.id)}
                        onChange={()=>setForm((f:any)=>({...f,student_ids:f.student_ids.includes(s.id)?f.student_ids.filter((x:string)=>x!==s.id):[...f.student_ids,s.id]}))}
                        className="rounded border-gray-300"/>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{s.full_name}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0',st.dot)}/>
                          <span className="text-xs text-gray-400">{s.status||'Active'}</span>
                        </div>
                      </div>
                    </label>
                  )
                })
              }
              {students.filter((s:any)=>s.status!=='Blocked').filter((s:any)=>!form.studentSearch||(s.full_name||'').toLowerCase().includes((form.studentSearch||'').toLowerCase())).length===0&&(
                <div className="col-span-2 py-4 text-center text-xs text-gray-400">No students found</div>
              )}
            </div>
            {form.student_ids.length>0&&<div className="text-xs text-brand-600 mt-1">{form.student_ids.length} student{form.student_ids.length!==1?'s':''} selected</div>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn" onClick={()=>setOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={busy}>
              {busy?<Loader2 className="w-4 h-4 animate-spin"/>:null}Schedule Class
            </button>
          </div>
        </div>
      </Modal>}

      {/* Reschedule review modal */}
      <Modal open={!!reviewModal} onClose={()=>setReviewModal(null)} title="Review Reschedule Request">
        {reviewModal&&(
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
              <div className="flex justify-between"><span className="text-gray-400">Student</span><span className="font-medium">{reviewModal.students?.full_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Subject</span><span className="font-medium">{reviewModal.subjects?.name}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Current slot</span><span className="font-medium">{reviewModal.current_day||'—'} {reviewModal.current_slot_time?.slice(0,5)||''}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Requested slot</span><span className="font-semibold text-brand-600">{reviewModal.requested_day} {reviewModal.requested_time?.slice(0,5)}</span></div>
              {reviewModal.reason&&<div className="pt-2 border-t border-gray-100"><span className="text-gray-400">Reason: </span><span className="italic">{reviewModal.reason}</span></div>}
            </div>
            <div>
              <label className="label">Note to student (optional)</label>
              <textarea className="input" rows={2} value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="e.g. Confirmed, see you then!"/>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>reviewRequest('reject')} disabled={reviewBusy} className="btn btn-danger flex-1 justify-center">
                {reviewBusy?<Loader2 className="w-4 h-4 animate-spin"/>:null}✕ Reject
              </button>
              <button onClick={()=>reviewRequest('approve')} disabled={reviewBusy} className="btn-primary flex-1 justify-center bg-emerald-500 hover:bg-emerald-600 border-emerald-500">
                {reviewBusy?<Loader2 className="w-4 h-4 animate-spin"/>:null}✓ Approve
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════ FEES
function FeesTab({subjects,fees,reload}:any){
  const supabase=sb()
  const [open,setOpen]=useState(false);const [editSub,setEditSub]=useState<any>(null)
  const [form,setForm]=useState({amount:'',frequency:'Monthly',due_day:'5'});const [busy,setBusy]=useState(false);const [err,setErr]=useState('')
  const feeFor=(id:string)=>fees.find((f:any)=>f.subject_id===id)
  const openEdit=(sub:any)=>{const f=feeFor(sub.id);setEditSub(sub);setForm({amount:f?String(f.amount):'',frequency:f?.frequency||'Monthly',due_day:f?String(f.due_day):'5'});setErr('');setOpen(true)}
  async function save(){
    if(!form.amount||!editSub){setErr('Enter fee amount');return}
    const amt=parseInt(form.amount);if(isNaN(amt)||amt<=0){setErr('Enter valid amount >0');return}
    setBusy(true);setErr('')
    const payload={subject_id:editSub.id,amount:amt,frequency:form.frequency,due_day:parseInt(form.due_day)||5}
    const existing=feeFor(editSub.id)
    if(existing)await supabase.from('fee_structures').update({amount:payload.amount,frequency:payload.frequency,due_day:payload.due_day}).eq('id',existing.id)
    else await supabase.from('fee_structures').insert(payload)
    setBusy(false);setOpen(false);reload()
  }
  return(
    <div className="animate-fu">
      <div className="mb-5"><h1 className="text-xl font-semibold text-gray-900">Fee Structure</h1><p className="text-sm text-gray-400 mt-0.5">Configure fees per subject</p></div>
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead><tr><th className="th">Subject</th><th className="th">Monthly Fee</th><th className="th">Frequency</th><th className="th">Due Day</th><th className="th w-28"></th></tr></thead>
          <tbody>{subjects.map((s:any)=>{const f=feeFor(s.id);return(
            <tr key={s.id} className="hover:bg-gray-50/50">
              <td className="td"><span className={clsx('badge',colorBadge[s.color]||colorBadge.violet)}>{s.name}</span></td>
              <td className="td"><span className={f?'font-semibold text-gray-900':'text-gray-300'}>{f?fmt(f.amount):'Not set'}</span></td>
              <td className="td text-gray-400">{f?.frequency||'—'}</td>
              <td className="td text-gray-400">{f?`Day ${f.due_day}`:'—'}</td>
              <td className="td"><button onClick={()=>openEdit(s)} className="btn btn-sm"><Edit className="w-3 h-3"/> {f?'Edit':'Set Fee'}</button></td>
            </tr>
          )})}
          </tbody>
        </table>
      </div>
      <Modal open={open} onClose={()=>{setOpen(false);setErr('')}} title={`Set Fee — ${editSub?.name||''}`}>
        <div className="space-y-4">
          {err&&<div className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100">{err}</div>}
          <div><label className="label">Monthly Fee Amount (₹) *</label><input className="input text-lg font-semibold" type="number" min="1" step="100" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="e.g. 2500" autoFocus/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Frequency</label><select className="input" value={form.frequency} onChange={e=>setForm(f=>({...f,frequency:e.target.value}))}><option>Monthly</option><option>Quarterly</option><option>Annual</option></select></div>
            <div><label className="label">Due Day</label><input className="input" type="number" min={1} max={28} value={form.due_day} onChange={e=>setForm(f=>({...f,due_day:e.target.value}))}/></div>
          </div>
          <div className="flex justify-end gap-2 pt-2"><button className="btn" onClick={()=>{setOpen(false);setErr('')}}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy?<Loader2 className="w-4 h-4 animate-spin"/>:null}Save Fee</button></div>
        </div>
      </Modal>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════ PAYMENTS
// ══════════════════════════════════════════════════════════════
// PENDING BY MONTH — grouped overdue/pending payments with fines
// ══════════════════════════════════════════════════════════════
function PendingByMonthView({ payments, reload, supabase, sendFineReminder, sendingFine }: any) {
  const pending = payments.filter((p: any) => p.status === 'pending' || p.status === 'overdue')

  // Group by month_label, fall back to due_date month, fall back to "No Date"
  const byMonth: Record<string, any[]> = {}
  pending.forEach((p: any) => {
    const key = p.month_label || (p.due_date ? new Date(p.due_date+'T00:00:00').toLocaleString('en-IN',{month:'long',year:'numeric'}) : 'No Date Set')
    if (!byMonth[key]) byMonth[key] = []
    byMonth[key].push(p)
  })

  // Sort months: newest due_date first within each group already; sort group keys by most-recent activity
  const monthKeys = Object.keys(byMonth).sort((a, b) => {
    const da = byMonth[a][0]?.due_date || byMonth[a][0]?.created_at || ''
    const db = byMonth[b][0]?.due_date || byMonth[b][0]?.created_at || ''
    return db.localeCompare(da)
  })

  async function toggleFineEnabled(payment: any, enabled: boolean) {
    await supabase.from('payments').update({ fine_enabled: enabled }).eq('id', payment.id)
    reload()
  }

  if (!pending.length) {
    return (
      <div className="card p-12 text-center text-gray-300">
        <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30"/>
        <p>No pending payments — all caught up! 🎉</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {monthKeys.map(month => {
        const monthPayments = byMonth[month]
        const monthTotal = monthPayments.reduce((a: number, p: any) => a + p.amount, 0)
        const monthFines = monthPayments.reduce((a: number, p: any) => a + calcLateFine(p).fineAmount, 0)
        const overdueCount = monthPayments.filter((p: any) => calcLateFine(p).daysOverdue > 0).length

        return (
          <div key={month} className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-amber-50/60 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 text-sm">{month}</span>
                <span className="badge bg-amber-100 text-amber-700 text-xs">{monthPayments.length} pending</span>
                {overdueCount > 0 && <span className="badge bg-red-100 text-red-700 text-xs">{overdueCount} overdue</span>}
              </div>
              <div className="flex items-center gap-4 text-xs">
                {monthFines > 0 && <span className="text-rose-600 font-semibold">+{fmt(monthFines)} fines</span>}
                <span className="font-bold text-amber-700 text-sm">{fmt(monthTotal + monthFines)}</span>
              </div>
            </div>

            <div>
              {monthPayments.map((p: any) => {
                const fine = calcLateFine(p)
                const fineEnabled = p.fine_enabled !== false
                return (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/40">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900">{p.students?.full_name || p.student_name || 'Unknown'}</div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {p.subjects && <span className={clsx('badge text-xs', colorBadge[p.subjects.color] || colorBadge.violet)}>{p.subjects.name}</span>}
                        {p.due_date && <span className={clsx('text-xs', fine.daysOverdue > 0 ? 'text-red-500 font-medium' : 'text-gray-400')}>
                          Due {p.due_date} {fine.daysOverdue > 0 && `· ${fine.daysOverdue} day${fine.daysOverdue !== 1 ? 's' : ''} overdue`}
                        </span>}
                        {p.invoice_number && <span className="text-xs text-gray-400">Inv #{p.invoice_number}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Fine toggle + display */}
                      <label className="flex items-center gap-1.5 cursor-pointer" title="Enable/disable 5% per 15-day late fine">
                        <input type="checkbox" checked={fineEnabled} onChange={e => toggleFineEnabled(p, e.target.checked)} className="rounded border-gray-300 text-rose-500 w-3.5 h-3.5"/>
                        <span className="text-xs text-gray-400">Fine</span>
                      </label>

                      {fineEnabled && fine.fineAmount > 0 && (
                        <div className="text-right">
                          <div className="text-xs text-rose-600 font-semibold">+{fmt(fine.fineAmount)} ({fine.finePct}%)</div>
                          <div className="text-xs text-gray-400">{fine.periods} period{fine.periods !== 1 ? 's' : ''} × 15d</div>
                        </div>
                      )}

                      <div className="text-right">
                        <div className="text-sm font-bold text-gray-900">{fmt(p.amount + (fineEnabled ? fine.fineAmount : 0))}</div>
                        <div className="text-xs text-gray-400">base {fmt(p.amount)}</div>
                      </div>

                      <button
                        onClick={() => sendFineReminder(p)}
                        disabled={sendingFine[p.id] || (!p.students?.email && !p.student_email)}
                        title={(!p.students?.email && !p.student_email) ? 'No email on file' : 'Send reminder with updated invoice'}
                        className="btn btn-sm text-brand-600 border-brand-200 hover:bg-brand-50"
                      >
                        {sendingFine[p.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Mail className="w-3.5 h-3.5"/>}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <p className="text-xs text-gray-500">
          <strong>Auto-fine policy:</strong> 5% of the outstanding amount is added for every 15 days a payment remains overdue past its due date.
          Reminder emails with the updated invoice (including fines) are sent automatically every 15 days via the scheduled job — toggle the <strong>Fine</strong> checkbox per payment to exempt a student.
        </p>
      </div>
    </div>
  )
}


function PaymentsTab({payments,students,subjects,fees,perms,reload}:any){
  const supabase=sb()
  const [tab,setTab]=useState('all');const [open,setOpen]=useState(false);const [importOpen,setImportOpen]=useState(false)
  const [viewMode,setViewMode]=useState<'list'|'pending_by_month'>('list')
  const [invoice,setInvoice]=useState<any>(null);const [reminder,setReminder]=useState<any>(null)
  const emptyForm = {student_id:'',subject_id:'',month_label:'',amount:'',payment_date:'',due_date:'',mode_of_payment:'UPI',receipt_number:'',invoice_number:'',description:'',notes:'',status:'paid',discount:''}
  const [form,setForm]=useState<any>(emptyForm)
  const [editing,setEditing]=useState<any>(null)
  const [busy,setBusy]=useState(false);const [importResult,setImportResult]=useState('');const [q,setQ]=useState('')
  const months=Array.from({length:12},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-i);return d.toLocaleString('en-IN',{month:'long',year:'numeric'})})
  const filtered=(tab==='all'?payments:payments.filter((p:any)=>p.status===tab)).filter((p:any)=>{const name=(p.students?.full_name||p.student_name||'').toLowerCase();return name.includes(q.toLowerCase())||p.receipt_number?.includes(q)||p.invoice_number?.includes(q)})
  const paid=payments.filter((p:any)=>p.status==='paid').reduce((a:number,p:any)=>a+p.amount,0)
  const pending=payments.filter((p:any)=>p.status==='pending').reduce((a:number,p:any)=>a+p.amount,0)
  const failed=payments.filter((p:any)=>p.status==='failed').length

  // Pending/overdue payments with computed fines
  const pendingPayments = payments.filter((p:any)=>p.status==='pending'||p.status==='overdue')
  const totalFinesOutstanding = pendingPayments.reduce((sum:number,p:any)=>sum+calcLateFine(p).fineAmount,0)

  const [sendingFine,setSendingFine]=useState<Record<string,boolean>>({})
  async function sendFineReminder(payment:any){
    if(!payment.student_email&&!payment.students?.email)return
    const email=payment.students?.email||payment.student_email
    const name=payment.students?.full_name||payment.student_name
    setSendingFine(s=>({...s,[payment.id]:true}))
    const fine=calcLateFine(payment)
    await fetch('/api/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      type:'fine_reminder',
      studentEmail:email,
      studentName:name,
      invoiceData:{
        invoiceNo:payment.invoice_number||payment.id.slice(0,6),
        subjectName:payment.subjects?.name||payment.description||'Tuition',
        monthLabel:payment.month_label||'',
        rawAmount:payment.amount,
        fineAmount:fine.fineAmount,
        finePct:fine.finePct,
        daysOverdue:fine.daysOverdue,
        dueDate:payment.due_date,
        finalAmount:payment.amount+fine.fineAmount,
      }
    })})
    await supabase.from('payments').update({fine_amount:fine.fineAmount,last_fine_reminder_at:new Date().toISOString()}).eq('id',payment.id)
    setSendingFine(s=>({...s,[payment.id]:false}))
    reload()
  }

  function openAdd(){setEditing(null);setForm(emptyForm);setOpen(true)}
  function openEdit(p:any){
    setEditing(p)
    setForm({
      student_id: p.student_id||'',
      subject_id: p.subject_id||'',
      month_label: p.month_label||months[0],
      amount: String(p.amount||''),
      payment_date: p.payment_date||'',
      due_date: p.due_date||'',
      mode_of_payment: p.mode_of_payment||'UPI',
      receipt_number: p.receipt_number||'',
      invoice_number: p.invoice_number||'',
      description: p.description||'',
      notes: p.notes||'',
      status: p.status||'paid',
      discount: String(p.discount||''),
    })
    setOpen(true)
  }

  async function markPaid(id:string){await supabase.from('payments').update({status:'paid',payment_date:new Date().toISOString().slice(0,10)}).eq('id',id);reload()}

  async function deletePayment(id:string){
    if(!confirm('Delete this payment record? This cannot be undone.'))return
    await supabase.from('payments').delete().eq('id',id)
    reload()
  }

  async function save(){
    if(!form.amount)return;setBusy(true)
    const payload:any={
      amount:+form.amount,
      payment_date:form.payment_date||new Date().toISOString().slice(0,10),
      due_date:form.due_date||null,
      status:form.status||'paid',
      month_label:form.month_label||months[0],
      mode_of_payment:form.mode_of_payment,
      receipt_number:form.receipt_number||null,
      invoice_number:form.invoice_number||null,
      description:form.description||null,
      notes:form.notes||null,
      discount:form.discount?+form.discount:null,
    }
    if(form.subject_id) payload.subject_id=form.subject_id
    if(editing){
      await supabase.from('payments').update(payload).eq('id',editing.id)
    } else {
      if(!form.student_id){setBusy(false);return}
      payload.student_id=form.student_id
      await supabase.from('payments').insert(payload)
    }
    setBusy(false);setOpen(false);reload()
  }

  async function handleImport(_rows:any[], rawText?:string){
    if(!rawText){setImportResult('Error: could not read file text');return}
    setBusy(true)
    setImportResult('⏳ Uploading and extracting subjects… please wait')
    try{
      const r=await fetch('/api/import',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({csvText:rawText})
      })
      const d=await r.json()
      if(!r.ok){setImportResult(`Error: ${d.error||'Server error'}`);setBusy(false);return}
      let msg=`✓ ${d.inserted} payments imported`
      if(d.linked>0) msg+=` · ${d.linked} student-subject links created`
      if(d.failed>0) msg+=` · ${d.failed} failed`
      if(d.skipped>0) msg+=` · ${d.skipped} skipped (₹0)`
      if(d.subjects_missing?.length) msg+=` · Subjects not found: ${d.subjects_missing.join(', ')}`
      if(d.students_missing?.length) msg+=` · ${d.students_missing.length} students not matched (saved anyway)`
      if(d.firstError) msg+=` — First error: "${d.firstError}"`
      setImportResult(msg)
      setImportOpen(false)
      reload()
    }catch(e:any){
      setImportResult(`Network error: ${e.message}`)
    }
    setBusy(false)
  }

  async function sendPaymentReminder(p:any){
    if(!p.students?.email&&!p.student_email){alert('No email address for this student');return}
    const r=await fetch('/api/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'payment_reminder',studentEmail:p.students?.email||p.student_email,studentName:p.students?.full_name||p.student_name,amount:p.amount,subjectName:p.subjects?.name||'your course',month:p.month_label})})
    const d=await r.json()
    alert(d.ok?`✓ Reminder sent${d.dev?' (console mode)':''}!`:`Error: ${d.error}`)
    setReminder(null)
  }

  return(
    <div className="animate-fu">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-xl font-semibold text-gray-900">Payments</h1><p className="text-sm text-gray-400 mt-0.5">Track fees, import history & send reminders</p></div>
        <div className="flex gap-2">
          <button onClick={()=>setImportOpen(true)} className="btn"><Upload className="w-4 h-4"/> Import CSV</button>
          {perms.managePayments&&<button onClick={openAdd} className="btn-primary"><Plus className="w-4 h-4"/> Record</button>}
        </div>
      </div>
      {importResult&&<div className={clsx('mb-4 px-4 py-2.5 rounded-lg text-sm border flex items-center gap-2',
        importResult.startsWith('⏳')?'bg-brand-50 text-brand-700 border-brand-100':
        importResult.startsWith('Error')||importResult.includes('failed')?'bg-red-50 text-red-700 border-red-100':
        'bg-emerald-50 text-emerald-700 border-emerald-100'
      )}>
        {importResult.startsWith('⏳')&&<Loader2 className="w-4 h-4 animate-spin flex-shrink-0"/>}
        {importResult}
      </div>}
      <div className="grid grid-cols-5 gap-4 mb-5">
        <div className="card p-4 bg-emerald-50 border-emerald-100"><div className="text-xs text-emerald-600 mb-1">Collected</div><div className="text-xl font-semibold text-emerald-700">{fmt(paid)}</div></div>
        <div className="card p-4 bg-amber-50 border-amber-100"><div className="text-xs text-amber-600 mb-1">Pending</div><div className="text-xl font-semibold text-amber-700">{fmt(pending)}</div></div>
        <div className="card p-4 bg-rose-50 border-rose-100"><div className="text-xs text-rose-600 mb-1">Fines Outstanding</div><div className="text-xl font-semibold text-rose-700">{fmt(totalFinesOutstanding)}</div></div>
        <div className="card p-4 bg-red-50 border-red-100"><div className="text-xs text-red-500 mb-1">Failed Txns</div><div className="text-xl font-semibold text-red-600">{failed}</div></div>
        <div className="card p-4 bg-blue-50 border-blue-100"><div className="text-xs text-blue-600 mb-1">Total Records</div><div className="text-xl font-semibold text-blue-700">{payments.length}</div></div>
      </div>

      <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit mb-4">
        <button onClick={()=>setViewMode('list')} className={clsx('px-4 py-2 text-sm font-medium transition-colors',viewMode==='list'?'bg-brand-500 text-white':'text-gray-500 hover:bg-gray-50')}>All Payments</button>
        <button onClick={()=>setViewMode('pending_by_month')} className={clsx('px-4 py-2 text-sm font-medium transition-colors',viewMode==='pending_by_month'?'bg-amber-500 text-white':'text-gray-500 hover:bg-gray-50')}>
          Pending by Month {pendingPayments.length>0 && <span className="ml-1 opacity-80">({pendingPayments.length})</span>}
        </button>
      </div>

      {viewMode==='pending_by_month' ? (
        <PendingByMonthView payments={payments} reload={reload} supabase={supabase} sendFineReminder={sendFineReminder} sendingFine={sendingFine}/>
      ) : (
      <div className="card">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 pt-2 pb-0">
          <div className="flex">{['all','paid','pending','overdue','failed'].map(t=><button key={t} onClick={()=>setTab(t)} className={clsx('px-3 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize',tab===t?'border-brand-500 text-brand-600':'border-transparent text-gray-400 hover:text-gray-600')}>{t}<span className={clsx('ml-1 text-xs px-1.5 py-0.5 rounded-full',tab===t?'bg-brand-50 text-brand-600':'bg-gray-100 text-gray-400')}>{t==='all'?payments.length:payments.filter((p:any)=>p.status===t).length}</span></button>)}</div>
          <div className="relative pb-2"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/><input className="input pl-8 text-xs py-1.5 w-48" placeholder="Search student, receipt…" value={q} onChange={e=>setQ(e.target.value)}/></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">Student</th><th className="th">Amount</th><th className="th">Date</th><th className="th">Mode</th><th className="th">Receipt #</th><th className="th">Invoice #</th><th className="th">By</th><th className="th">Status</th><th className="th w-28">Actions</th></tr></thead>
            <tbody>
              {filtered.map((p:any)=>(
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="td"><div className="font-medium text-gray-900">{p.students?.full_name||p.student_name||'—'}</div><div className="text-xs text-gray-400">{p.students?.email||p.student_email}</div></td>
                  <td className="td font-semibold">{fmt(p.amount)}</td>
                  <td className="td text-gray-400">{p.payment_date||'—'}</td>
                  <td className="td text-gray-500">{p.mode_of_payment||'—'}</td>
                  <td className="td text-gray-400">#{p.receipt_number||'—'}</td>
                  <td className="td text-gray-400">#{p.invoice_number||'—'}</td>
                  <td className="td text-gray-400 text-xs">{p.recorded_by||p.students?.full_name||'—'}</td>
                  <td className="td"><span className={clsx('badge',p.status==='paid'?'bg-emerald-50 text-emerald-700':p.status==='failed'?'bg-red-50 text-red-600':p.status==='overdue'?'bg-orange-50 text-orange-700':'bg-amber-50 text-amber-700')}>{p.status}</span></td>
                  <td className="td"><div className="flex gap-1">
                    {p.status!=='paid'&&p.status!=='failed'&&perms.managePayments&&<button onClick={()=>markPaid(p.id)} className="btn btn-sm" title="Mark paid"><CheckCircle className="w-3.5 h-3.5 text-emerald-500"/></button>}
                    {(p.status==='pending'||p.status==='overdue')&&<button onClick={()=>setReminder(p)} className="btn btn-sm" title="Send reminder"><Mail className="w-3.5 h-3.5 text-amber-500"/></button>}
                    {p.status==='paid'&&<button onClick={()=>setInvoice(p)} className="btn btn-sm" title="View receipt"><FileText className="w-3.5 h-3.5 text-gray-400"/></button>}
                    {perms.managePayments&&<button onClick={()=>openEdit(p)} className="btn btn-sm" title="Edit payment"><Edit className="w-3.5 h-3.5 text-blue-400"/></button>}
                    {perms.managePayments&&<button onClick={()=>deletePayment(p.id)} className="btn btn-sm" title="Delete"><Trash2 className="w-3.5 h-3.5 text-red-300 hover:text-red-500"/></button>}
                  </div></td>
                </tr>
              ))}
              {!filtered.length&&<tr><td colSpan={9} className="td text-center text-gray-300 py-8">No payments</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Record / Edit payment */}
      <Modal open={open} onClose={()=>setOpen(false)} title={editing?'Edit Payment':'Record Payment'} wide>
        {editing&&(
          <div className="mb-4 flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm">
            <Edit className="w-4 h-4 text-blue-500 flex-shrink-0"/>
            <div>
              <div className="font-medium text-blue-800">{editing.students?.full_name||editing.student_name||'Unknown student'}</div>
              <div className="text-xs text-blue-600">Editing payment · Invoice #{editing.invoice_number||'—'} · Original: {fmt(editing.amount)}</div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {!editing&&<div className="col-span-2"><label className="label">Student *</label><select className="input" value={form.student_id} onChange={e=>setForm((f:any)=>({...f,student_id:e.target.value}))}><option value="">— Select student —</option>{students.map((s:any)=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>}
          <div><label className="label">Subject</label><select className="input" value={form.subject_id} onChange={e=>{const fee=fees.find((f:any)=>f.subject_id===e.target.value);setForm((f:any)=>({...f,subject_id:e.target.value,amount:fee?String(fee.amount):f.amount}))}}><option value="">— Select —</option>{subjects.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="label">Status</label><select className="input" value={form.status} onChange={e=>setForm((f:any)=>({...f,status:e.target.value}))}>{PAY_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
          <div><label className="label">Amount (₹) *</label><input className="input" type="number" value={form.amount} onChange={e=>setForm((f:any)=>({...f,amount:e.target.value}))} placeholder="e.g. 2200"/></div>
          <div><label className="label">Discount (₹)</label><input className="input" type="number" value={form.discount} onChange={e=>setForm((f:any)=>({...f,discount:e.target.value}))} placeholder="0"/></div>
          <div><label className="label">Month</label><select className="input" value={form.month_label} onChange={e=>setForm((f:any)=>({...f,month_label:e.target.value}))}>{months.map(m=><option key={m}>{m}</option>)}</select></div>
          <div><label className="label">Payment Date</label><input className="input" type="date" value={form.payment_date} onChange={e=>setForm((f:any)=>({...f,payment_date:e.target.value}))}/></div>
          <div><label className="label">Due Date</label><input className="input" type="date" value={form.due_date} onChange={e=>setForm((f:any)=>({...f,due_date:e.target.value}))}/></div>
          <div><label className="label">Mode of Payment</label><select className="input" value={form.mode_of_payment} onChange={e=>setForm((f:any)=>({...f,mode_of_payment:e.target.value}))}>{PAY_MODES.map(m=><option key={m}>{m}</option>)}</select></div>
          <div><label className="label">Receipt #</label><input className="input" value={form.receipt_number} onChange={e=>setForm((f:any)=>({...f,receipt_number:e.target.value}))}/></div>
          <div><label className="label">Invoice #</label><input className="input" value={form.invoice_number} onChange={e=>setForm((f:any)=>({...f,invoice_number:e.target.value}))}/></div>
          <div className="col-span-2"><label className="label">Description / Notes</label><input className="input" value={form.description} onChange={e=>setForm((f:any)=>({...f,description:e.target.value}))} placeholder="Optional"/></div>
        </div>
        {form.amount&&form.discount&&+form.discount>0&&(
          <div className="mt-3 flex justify-between items-center px-3 py-2 bg-blue-50 rounded-lg text-sm">
            <span className="text-blue-700">{fmt(+form.amount)} - {fmt(+form.discount)} discount</span>
            <span className="font-semibold text-emerald-700">= {fmt(Math.max(0,+form.amount-+form.discount))}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-4">
          <div>
            {editing&&<button onClick={()=>deletePayment(editing.id)} className="btn btn-sm btn-danger flex items-center gap-1"><Trash2 className="w-3.5 h-3.5"/> Delete</button>}
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={()=>setOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={busy}>
              {busy?<Loader2 className="w-4 h-4 animate-spin"/>:<CheckCircle className="w-4 h-4"/>}
              {editing?'Save Changes':'Record Payment'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Import payments */}
      <Modal open={importOpen} onClose={()=>setImportOpen(false)} title="Import Payments" wide>
        <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 space-y-1">
          <div className="font-semibold text-blue-800">✓ Supports two formats:</div>
          <div><strong>Invoice Items CSV</strong> (invoices_items-*.csv) — extracts subject from Item Name automatically, links students</div>
          <div><strong>Payments CSV</strong> (payments-*.csv) — imports payment records with receipt/mode details</div>
          <div className="text-blue-500 mt-1">Upload either file — the format is auto-detected.</div>
        </div>
        <ImportPanel type="payments" onImport={handleImport}/>
      </Modal>

      {/* Invoice */}
      {invoice&&<Modal open={!!invoice} onClose={()=>setInvoice(null)} title="Invoice">
        <div className="border border-gray-100 rounded-xl p-5 space-y-4">
          <div className="flex justify-between"><div><div className="text-lg font-bold text-brand-500">Hum & Strum Academy</div><div className="text-xs text-gray-400">Payment Receipt · Hoodi, Bengaluru</div></div><div className="text-right"><div className="font-mono text-sm font-semibold">Receipt #{invoice.receipt_number||invoice.id.slice(0,6).toUpperCase()}</div><div className="text-xs text-gray-400">{invoice.payment_date}</div></div></div>
          <div className="bg-gray-50 rounded-lg p-3 text-sm"><div className="font-medium">{invoice.students?.full_name||invoice.student_name}</div><div className="text-xs text-gray-400">{invoice.students?.email||invoice.student_email} · {invoice.students?.phone||invoice.student_phone}</div></div>
          <table className="w-full text-sm"><thead><tr className="border-b border-gray-100"><th className="text-left text-xs text-gray-400 pb-2 font-normal">Description</th><th className="text-left text-xs text-gray-400 pb-2 font-normal">Period</th><th className="text-left text-xs text-gray-400 pb-2 font-normal">Mode</th><th className="text-right text-xs text-gray-400 pb-2 font-normal">Amount</th></tr></thead><tbody><tr><td className="py-3">{invoice.subjects?.name||invoice.description||'Tuition Fee'}</td><td className="py-3 text-gray-400">{invoice.month_label}</td><td className="py-3 text-gray-400">{invoice.mode_of_payment}</td><td className="py-3 text-right font-semibold">{fmt(invoice.amount)}</td></tr></tbody></table>
          <div className="flex justify-between items-center pt-2 border-t border-gray-100"><span className="badge bg-emerald-50 text-emerald-700">PAID ✓</span><div className="text-right"><div className="text-xs text-gray-400">Total</div><div className="text-xl font-bold text-brand-500">{fmt(invoice.amount)}</div></div></div>
          {invoice.recorded_by&&<div className="text-xs text-gray-400">Recorded by: {invoice.recorded_by}</div>}
          <div className="text-xs text-center text-gray-400 pt-2 border-t border-gray-100">Thank you for your payment! · humandstrumhoodi@gmail.com</div>
        </div>
        <div className="flex justify-end gap-2 mt-4"><button className="btn" onClick={()=>setInvoice(null)}>Close</button><button className="btn-primary" onClick={()=>window.print()}>Print</button></div>
      </Modal>}

      {/* Email payment reminder */}
      {reminder&&<Modal open={!!reminder} onClose={()=>setReminder(null)} title="Send Payment Reminder">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm leading-relaxed">
            <div className="text-xs font-semibold text-amber-700 mb-2">📧 Email Preview</div>
            <p>Dear <strong>{reminder.students?.full_name?.split(' ')[0]||reminder.student_name}</strong>,</p>
            <p className="mt-2">Your fee of <strong>{fmt(reminder.amount)}</strong> for <strong>{reminder.subjects?.name||'your course'}</strong> ({reminder.month_label}) is <strong className="text-amber-700">{reminder.status}</strong>.</p>
            <p className="mt-2">Please pay at the earliest to avoid disruption.</p>
          </div>
          <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3"><strong>To:</strong> {reminder.students?.email||reminder.student_email||'No email on file'}</div>
          <div className="flex justify-end gap-2"><button className="btn" onClick={()=>setReminder(null)}>Cancel</button><button className="btn-primary" onClick={()=>sendPaymentReminder(reminder)} disabled={!reminder.students?.email&&!reminder.student_email}><Mail className="w-4 h-4"/> Send Reminder</button></div>
        </div>
      </Modal>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════ USERS
function UsersTab({profiles,profile:self,reload}:any){
  const [open,setOpen]=useState(false);const [form,setForm]=useState({full_name:'',email:'',phone:'',password:'',role:'center_manager' as Role});const [busy,setBusy]=useState(false);const [err,setErr]=useState('')
  async function save(){if(!form.full_name||!form.email||!form.password)return setErr('Fill all required');setBusy(true);setErr('');const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});const d=await r.json();if(!r.ok){setErr(d.error||'Error');setBusy(false);return}setBusy(false);setOpen(false);setForm({full_name:'',email:'',phone:'',password:'',role:'center_manager'});reload()}
  async function del(id:string){if(id===self.id)return alert("Can't delete yourself");if(!confirm('Delete?'))return;await fetch(`/api/admin?id=${id}`,{method:'DELETE'});reload()}
  async function changeRole(id:string,role:string){if(id===self.id)return alert("Can't change own role");await fetch('/api/admin',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,role})});reload()}
  return(
    <div className="animate-fu">
      <div className="flex items-center justify-between mb-5"><div><h1 className="text-xl font-semibold text-gray-900">Users & Roles</h1><p className="text-sm text-gray-400 mt-0.5">Manage system access</p></div><button onClick={()=>setOpen(true)} className="btn-primary"><Plus className="w-4 h-4"/> Add User</button></div>
      <div className="grid grid-cols-3 gap-4 mb-6">{(['superadmin','center_manager','teacher'] as Role[]).map(r=>{const count=profiles.filter((p:any)=>p.role===r).length;return<div key={r} className="card p-4"><span className={clsx('badge mb-2',ROLE_COLOR[r])}>{ROLE_LABEL[r]}</span><div className="text-2xl font-semibold mb-0.5">{count}</div><div className="text-xs text-gray-400">{{superadmin:'All modules',center_manager:'Operations',teacher:'Schedule only'}[r]}</div></div>})}</div>
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead><tr><th className="th">User</th><th className="th">Role</th><th className="th">Change Role</th><th className="th">Phone</th><th className="th">Since</th><th className="th w-16"></th></tr></thead>
          <tbody>{profiles.map((u:any,i:number)=>(
            <tr key={u.id} className={clsx('hover:bg-gray-50/50',u.id===self.id&&'bg-brand-50/20')}>
              <td className="td"><div className="flex items-center gap-3"><Avatar name={u.full_name} i={i}/><div><div className="font-medium text-gray-900">{u.full_name}{u.id===self.id&&<span className="ml-1 text-xs text-brand-400">(you)</span>}</div><div className="text-xs text-gray-400">{u.email}</div></div></div></td>
              <td className="td"><span className={clsx('badge',ROLE_COLOR[u.role as Role])}>{ROLE_LABEL[u.role as Role]}</span></td>
              <td className="td">{u.id!==self.id?<select className="input text-xs py-1 w-40" value={u.role} onChange={e=>changeRole(u.id,e.target.value)}><option value="superadmin">Super Admin</option><option value="center_manager">Center Manager</option><option value="teacher">Teacher</option></select>:<span className="text-xs text-gray-300">Own account</span>}</td>
              <td className="td text-gray-400">{u.phone||'—'}</td>
              <td className="td text-gray-400 text-xs">{u.created_at?.slice(0,10)}</td>
              <td className="td">{u.id!==self.id&&<button onClick={()=>del(u.id)} className="btn btn-sm btn-danger"><Trash2 className="w-3 h-3"/></button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Modal open={open} onClose={()=>setOpen(false)} title="Add User">
        <div className="space-y-3">
          {err&&<div className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm">{err}</div>}
          <div><label className="label">Full Name *</label><input className="input" value={form.full_name} onChange={e=>setForm(f=>({...f,full_name:e.target.value}))}/></div>
          <div><label className="label">Email *</label><input className="input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
          <div><label className="label">Role *</label><select className="input" value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value as Role}))}><option value="superadmin">Super Admin</option><option value="center_manager">Center Manager</option><option value="teacher">Teacher</option></select></div>
          <div><label className="label">Password *</label><input className="input" type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Min 8 chars"/></div>
          <div className="flex justify-end gap-2 pt-2"><button className="btn" onClick={()=>setOpen(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy?<Loader2 className="w-4 h-4 animate-spin"/>:null}Create User</button></div>
        </div>
      </Modal>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// CENTER HOURS TAB (superadmin only)
// ══════════════════════════════════════════════════════════════
const CH_DAYS = ['Sun','Tue','Wed','Thu','Fri','Sat'] // Mon excluded — permanent holiday
const CH_DAY_LABELS:Record<string,string> = { Sun:'Sunday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday' }
const CH_HOUR_OPTIONS = Array.from({length:15},(_,i)=>String(i+7).padStart(2,'0')+':00') // 07:00–21:00

function CenterHoursTab({profile}:any){
  const [hours,setHours]=useState<any[]>([])
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [saved,setSaved]=useState(false)

  useEffect(()=>{ load() },[])
  async function load(){
    setLoading(true)
    const r=await fetch('/api/center-hours')
    const d=await r.json()
    const existing=d.hours||[]
    // Ensure all 6 working days have a row, default sensible hours if missing
    const merged=CH_DAYS.map(day=>{
      const found=existing.find((h:any)=>h.day_of_week===day)
      if(found) return found
      const isWeekend=day==='Sun'||day==='Sat'
      return { day_of_week:day, open_time:isWeekend?'10:00':'15:00', close_time:'20:00', is_closed:false }
    })
    setHours(merged)
    setLoading(false)
  }

  function updateDay(day:string,field:string,value:any){
    setHours(hs=>hs.map(h=>h.day_of_week===day?{...h,[field]:value}:h))
    setSaved(false)
  }

  async function save(){
    setSaving(true)
    const r=await fetch('/api/center-hours',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hours})})
    setSaving(false)
    if(r.ok){ setSaved(true); setTimeout(()=>setSaved(false),3000) }
  }

  function applyToAll(template:any){
    setHours(hs=>hs.map(h=>({...h,open_time:template.open_time,close_time:template.close_time,is_closed:template.is_closed})))
    setSaved(false)
  }

  if(loading) return <div className="animate-fu p-10 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2"/>Loading center hours…</div>

  return(
    <div className="animate-fu max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Center Hours</h1>
          <p className="text-sm text-gray-400 mt-0.5">Set opening hours per day — controls what slots appear in the calendar</p>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving?<Loader2 className="w-4 h-4 animate-spin"/>:saved?<CheckCircle className="w-4 h-4"/>:null}
          {saving?'Saving…':saved?'Saved!':'Save Changes'}
        </button>
      </div>

      {/* Monday holiday notice */}
      <div className="mt-5 mb-4 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
        <span className="text-xl">🚫</span>
        <div>
          <div className="text-sm font-semibold text-red-700">Monday — Permanently Closed</div>
          <div className="text-xs text-red-500">The academy is closed every Monday. This cannot be changed here.</div>
        </div>
      </div>

      {/* Quick templates */}
      <div className="card p-4 mb-4">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Quick Apply</div>
        <div className="flex flex-wrap gap-2">
          <button onClick={()=>applyToAll({open_time:'15:00',close_time:'20:00',is_closed:false})} className="btn btn-sm">3:00 PM – 8:00 PM (all days)</button>
          <button onClick={()=>applyToAll({open_time:'10:00',close_time:'20:00',is_closed:false})} className="btn btn-sm">10:00 AM – 8:00 PM (all days)</button>
          <button onClick={()=>applyToAll({open_time:'09:00',close_time:'18:00',is_closed:false})} className="btn btn-sm">9:00 AM – 6:00 PM (all days)</button>
        </div>
      </div>

      {/* Per-day editor */}
      <div className="card overflow-hidden">
        {CH_DAYS.map((day,i)=>{
          const h=hours.find(x=>x.day_of_week===day)
          if(!h) return null
          const oh=parseInt(h.open_time.split(':')[0])
          const ch=parseInt(h.close_time.split(':')[0])
          const hourCount=Math.max(0,ch-oh)
          return(
            <div key={day} className={clsx('flex items-center gap-4 px-5 py-4',i>0&&'border-t border-gray-100',h.is_closed&&'bg-gray-50/60')}>
              <div className="w-28 flex-shrink-0">
                <div className="font-semibold text-gray-900 text-sm">{CH_DAY_LABELS[day]}</div>
                <div className="text-xs text-gray-400">{day==='Sun'||day==='Sat'?'Weekend':'Weekday'}</div>
              </div>

              <label className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer">
                <input type="checkbox" checked={!h.is_closed} onChange={e=>updateDay(day,'is_closed',!e.target.checked)} className="rounded border-gray-300 text-brand-500"/>
                <span className="text-xs text-gray-500">Open</span>
              </label>

              {h.is_closed ? (
                <div className="flex-1 text-sm text-gray-400 italic">Closed</div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <select className="input py-1.5 text-sm w-28" value={h.open_time.slice(0,5)} onChange={e=>updateDay(day,'open_time',e.target.value)}>
                      {CH_HOUR_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="text-gray-300 text-sm">to</span>
                    <select className="input py-1.5 text-sm w-28" value={h.close_time.slice(0,5)} onChange={e=>updateDay(day,'close_time',e.target.value)}>
                      {CH_HOUR_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="ml-auto flex-shrink-0 text-right">
                    <div className="text-sm font-semibold text-brand-600">{hourCount>0?hourCount:0} slot{hourCount!==1?'s':''}</div>
                    <div className="text-xs text-gray-400">1-hour classes</div>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 mt-3">Changes apply immediately to the calendar's Week/Day/Month views and the slot pickers in Add Class, Enrollment, and the Student Portal reschedule flow. All classes are fixed at 60 minutes — no 30-minute slots are shown.</p>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════
const GRADE_LEVELS = ['Beginner–Grade 2', 'Grade 3–5', 'Grade 6–8']
const CLASSES_PM_OPTIONS = [4, 8, 12]

function PackagesTab({ packages, subjects, reload }: any) {
  const supabase = sb()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [filterSubject, setFilterSubject] = useState('all')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    subject_id: '', name: '', classes_pm: 4, grade_level: 'Beginner–Grade 2',
    price: '', duration_min: 45, description: '', is_active: true, months: 1
  })

  const openAdd = (subjectId?: string, grade?: string) => {
    setEditing(null)
    setForm({ subject_id: subjectId||'', name: '4 Classes / Month', classes_pm: 4, grade_level: grade||'Beginner–Grade 2', price: '', duration_min: 45, description: '', is_active: true, months: 1 })
    setOpen(true)
  }

  const openEdit = (pkg: any) => {
    setEditing(pkg)
    setForm({ subject_id: pkg.subject_id, name: pkg.name, classes_pm: pkg.classes_pm, grade_level: pkg.grade_level, price: String(pkg.price), duration_min: pkg.duration_min, description: pkg.description||'', is_active: pkg.is_active, months: pkg.months||1 })
    setOpen(true)
  }

  async function save() {
    if (!form.subject_id || !form.price) return
    setBusy(true)
    const payload = {
      subject_id: form.subject_id, name: form.name, classes_pm: form.classes_pm,
      grade_level: form.grade_level, price: parseInt(form.price), duration_min: form.duration_min,
      description: form.description || null, is_active: form.is_active, months: form.months || 1
    }
    if (editing) await supabase.from('subject_packages').update(payload).eq('id', editing.id)
    else await supabase.from('subject_packages').insert(payload)
    setBusy(false); setOpen(false); reload()
  }

  async function toggleActive(pkg: any) {
    await supabase.from('subject_packages').update({ is_active: !pkg.is_active }).eq('id', pkg.id)
    reload()
  }

  async function del(id: string) {
    if (!confirm('Delete this package?')) return
    await supabase.from('subject_packages').delete().eq('id', id)
    reload()
  }

  const filtered = filterSubject === 'all' ? packages : packages.filter((p: any) => p.subject_id === filterSubject)

  // Group by subject → grade level
  const grouped: Record<string, Record<string, any[]>> = {}
  filtered.forEach((pkg: any) => {
    const subName = pkg.subjects?.name || pkg.subject_id
    if (!grouped[subName]) grouped[subName] = {}
    if (!grouped[subName][pkg.grade_level]) grouped[subName][pkg.grade_level] = []
    grouped[subName][pkg.grade_level].push(pkg)
  })

  const gradeColor: Record<string, string> = {
    'Beginner–Grade 2': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Grade 3–5':        'bg-blue-50 text-blue-700 border-blue-200',
    'Grade 6–8':        'bg-purple-50 text-purple-700 border-purple-200',
  }

  const classesColor: Record<number, string> = {
    4:  'bg-amber-50 text-amber-700',
    8:  'bg-brand-50 text-brand-700',
    12: 'bg-rose-50 text-rose-700',
  }

  return (
    <div className="animate-fu">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Packages</h1>
          <p className="text-sm text-gray-400 mt-0.5">{packages.length} packages across {subjects.length} subjects</p>
        </div>
        <button onClick={() => openAdd()} className="btn-primary"><Plus className="w-4 h-4"/> Add Package</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {GRADE_LEVELS.map(gl => {
          const glPkgs = packages.filter((p: any) => p.grade_level === gl && p.is_active)
          const minPrice = glPkgs.length ? Math.min(...glPkgs.map((p: any) => p.price)) : 0
          const maxPrice = glPkgs.length ? Math.max(...glPkgs.map((p: any) => p.price)) : 0
          return (
            <div key={gl} className={clsx('card p-4 border', gradeColor[gl])}>
              <div className="text-xs font-semibold mb-2">{gl}</div>
              <div className="text-2xl font-bold">{glPkgs.length}</div>
              <div className="text-xs opacity-70 mt-0.5">active packages</div>
              {minPrice > 0 && <div className="text-xs mt-2 font-medium">{fmt(minPrice)} – {fmt(maxPrice)}/mo</div>}
            </div>
          )
        })}
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setFilterSubject('all')} className={clsx('btn btn-sm', filterSubject==='all'&&'btn-primary')}>All Subjects</button>
        {subjects.map((s: any) => (
          <button key={s.id} onClick={() => setFilterSubject(s.id)} className={clsx('btn btn-sm', filterSubject===s.id&&'btn-primary')}>
            {s.name}
          </button>
        ))}
      </div>

      {/* Grouped view: Subject → Grade Level → Packages */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([subName, grades]) => {
          const sub = subjects.find((s: any) => s.name === subName)
          return (
            <div key={subName} className="card overflow-hidden">
              {/* Subject header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                <div className="flex items-center gap-3">
                  <span className={clsx('badge text-sm font-semibold', colorBadge[sub?.color]||colorBadge.violet)}>
                    {sub?.code || subName.slice(0,3).toUpperCase()}
                  </span>
                  <span className="font-semibold text-gray-900">{subName}</span>
                </div>
                <button onClick={() => openAdd(sub?.id)} className="btn btn-sm">
                  <Plus className="w-3 h-3"/> Add Package
                </button>
              </div>

              {/* Grade level sections */}
              {GRADE_LEVELS.map(grade => {
                const gradePkgs = (grades[grade] || []).sort((a: any, b: any) => a.classes_pm - b.classes_pm)
                if (!gradePkgs.length && filterSubject !== 'all') return null
                return (
                  <div key={grade} className="border-b border-gray-100 last:border-0">
                    <div className="flex items-center justify-between px-5 py-2.5 bg-white">
                      <span className={clsx('badge border text-xs', gradeColor[grade])}>{grade}</span>
                      <button onClick={() => openAdd(sub?.id, grade)} className="text-xs text-brand-500 hover:text-brand-700 flex items-center gap-1">
                        <Plus className="w-3 h-3"/> Add
                      </button>
                    </div>
                    {gradePkgs.length === 0 ? (
                      <div className="px-5 pb-3 text-xs text-gray-300">No packages — click Add above</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 px-5 pb-4">
                        {gradePkgs.map((pkg: any) => (
                          <div key={pkg.id} className={clsx('rounded-xl border p-4 transition-all', pkg.is_active ? 'border-gray-100 bg-white hover:shadow-md' : 'border-dashed border-gray-200 bg-gray-50 opacity-60')}>
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex flex-wrap gap-1">
                                <span className={clsx('badge text-xs font-semibold', classesColor[pkg.classes_pm]||classesColor[4])}>
                                  {pkg.classes_pm} classes/mo
                                </span>
                                {(pkg.months||1) > 1 && (
                                  <span className={clsx('badge text-xs font-semibold', (pkg.months||1)===6?'bg-rose-50 text-rose-700':'bg-teal-50 text-teal-700')}>
                                    {pkg.months} months
                                  </span>
                                )}
                                {!pkg.is_active && <span className="badge bg-gray-100 text-gray-400 text-xs">Inactive</span>}
                              </div>
                              <div className="flex gap-1">
                                <button onClick={() => openEdit(pkg)} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100"><Edit className="w-3 h-3"/></button>
                                <button onClick={() => del(pkg.id)} className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 className="w-3 h-3"/></button>
                              </div>
                            </div>
                            <div className="text-2xl font-bold text-gray-900 mb-0.5">{fmt(pkg.price)}</div>
                            <div className="text-xs text-gray-400">{(pkg.months||1)>1 ? `total for ${pkg.months} months` : 'per month'}</div>
                            {(pkg.months||1) > 1 && (
                              <div className="mt-1 flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-emerald-600">{fmt(Math.round(pkg.price/(pkg.months||1)))}/mo</span>
                                <span className={clsx('badge text-xs font-bold', (pkg.months||1)===6?'bg-rose-50 text-rose-700':'bg-teal-50 text-teal-700')}>
                                  {(pkg.months||1)===6?'15% off':'10% off'}
                                </span>
                              </div>
                            )}
                            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-xs text-gray-500">
                              <div className="flex justify-between"><span>Duration</span><span className="font-medium">{pkg.duration_min} min/class</span></div>
                              <div className="flex justify-between"><span>Per class</span><span className="font-medium">{fmt(Math.round(pkg.price / (pkg.classes_pm * (pkg.months||1))))}</span></div>
                              {(pkg.months||1)>1 && <div className="flex justify-between"><span>Total classes</span><span className="font-medium">{pkg.classes_pm * (pkg.months||1)}</span></div>}
                            </div>
                            <button onClick={() => toggleActive(pkg)} className={clsx('mt-3 w-full text-xs py-1.5 rounded-lg border transition-colors', pkg.is_active ? 'border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-500 hover:border-red-100' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50')}>
                              {pkg.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
        {Object.keys(grouped).length === 0 && (
          <div className="card p-16 text-center text-gray-300">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30"/>
            <p>No packages yet. Run the SQL migration first, then refresh.</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Package' : 'Add Package'}>
        <div className="space-y-4">
          <div>
            <label className="label">Subject *</label>
            <select className="input" value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))}>
              <option value="">— Select subject —</option>
              {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Grade Level *</label>
            <select className="input" value={form.grade_level} onChange={e => setForm(f => ({ ...f, grade_level: e.target.value }))}>
              {GRADE_LEVELS.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Classes per Month *</label>
              <select className="input" value={form.classes_pm} onChange={e => {
                const n = parseInt(e.target.value)
                setForm(f => ({ ...f, classes_pm: n, name: `${n} Classes / Month` }))
              }}>
                {CLASSES_PM_OPTIONS.map(n => <option key={n} value={n}>{n} classes/month</option>)}
              </select>
            </div>
            <div>
              <label className="label">Duration per Class (min)</label>
              <input className="input" type="number" min={30} step={15} value={form.duration_min} onChange={e => setForm(f => ({ ...f, duration_min: parseInt(e.target.value) }))} />
            </div>
          </div>

          <div>
            <label className="label">Duration (months)</label>
            <div className="flex gap-2">
              {[1,3,6].map(m => (
                <button key={m} type="button"
                  onClick={() => setForm((f:any) => ({
                    ...f,
                    months: m,
                    name: `${f.classes_pm} Classes / Month${m>1?` · ${m} Months`:''}`
                  }))}
                  className={clsx('flex-1 py-2 rounded-lg border text-sm font-medium transition-all',
                    (form.months||1)===m
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  )}>
                  {m} mo{m>1?<span className="ml-1 text-xs opacity-60">{m===3?'10% off':'15% off'}</span>:null}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">{(form.months||1)>1?`Total Price (₹) for ${form.months} months *`:'Monthly Price (₹) *'}</label>
            <input className="input text-lg font-semibold" type="number" min={1} step={100} value={form.price} onChange={e => setForm((f:any) => ({ ...f, price: e.target.value }))} placeholder="e.g. 2200" autoFocus />
            {form.price && form.classes_pm ? (
              <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                <div>= {fmt(Math.round(parseInt(form.price||'0') / form.classes_pm / (form.months||1)))} per class</div>
                {(form.months||1)>1 && <div className="text-emerald-600">= {fmt(Math.round(parseInt(form.price||'0') / (form.months||1)))} per month</div>}
              </div>
            ) : null}
          </div>

          <div>
            <label className="label">Package Name</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. 4 Classes / Month" />
          </div>

          <div>
            <label className="label">Description (optional)</label>
            <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. 1 class/week · 45 min · Includes theory" />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="pkg-active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded border-gray-300" />
            <label htmlFor="pkg-active" className="text-sm text-gray-700 cursor-pointer">Active (visible to students)</label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editing ? 'Save Changes' : 'Add Package'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function DashboardShell({profile}:{profile:Profile}){
  return <ErrorBoundary><DashboardShellInner profile={profile}/></ErrorBoundary>
}

// ══════════════════════════════════════════════════════════════
// STUDENT DETAIL MODAL — month-by-month payment ledger
// ══════════════════════════════════════════════════════════════
function StudentDetailModal({ student, payments, subjects, packages, fees, onClose, reload }: any) {
  const [activeTab, setActiveTab] = useState<'overview'|'monthly'|'invoices'|'raise_invoice'>('overview')
  const supabase = sb()

  const totalPaid    = payments.filter((p:any) => p.status === 'paid').reduce((a:number,p:any) => a + p.amount, 0)
  const totalPending = payments.filter((p:any) => p.status === 'pending' || p.status === 'overdue').reduce((a:number,p:any) => a + p.amount, 0)
  const totalDiscount= payments.reduce((a:number,p:any) => a + (p.discount||0), 0)
  const enrolledSubs = subjects.filter((s:any) =>
    student.student_subjects?.some((ss:any) => ss.subject_id === s.id)
  )

  // Group payments by month
  const byMonth: Record<string, any[]> = {}
  payments.forEach((p:any) => {
    const key = p.month_label || (p.payment_date ? new Date(p.payment_date).toLocaleString('en-IN',{month:'long',year:'numeric'}) : 'Unknown')
    if (!byMonth[key]) byMonth[key] = []
    byMonth[key].push(p)
  })

  // Sort months newest first
  const months = Object.keys(byMonth).sort((a, b) => {
    const da = new Date(byMonth[a][0]?.payment_date || '2000-01-01')
    const db = new Date(byMonth[b][0]?.payment_date || '2000-01-01')
    return db.getTime() - da.getTime()
  })

  const statusBadge = (s:string) => clsx('badge',
    s==='paid'?'bg-emerald-50 text-emerald-700':
    s==='overdue'?'bg-red-50 text-red-600':
    s==='failed'?'bg-red-50 text-red-400':
    'bg-amber-50 text-amber-700'
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col animate-fu">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={clsx('w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold', ac(0))}>
              {ini(student.full_name)}
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">{student.full_name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={clsx('badge text-xs', student.status==='Active'?'bg-emerald-50 text-emerald-700':'bg-gray-100 text-gray-500')}>{student.status||'Active'}</span>
                {student.student_id_ext && <span className="text-xs text-gray-400">ID #{student.student_id_ext}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4"/>
          </button>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-4 gap-0 border-b border-gray-100 flex-shrink-0">
          {[
            { label:'Total Paid',    val:fmt(totalPaid),    color:'text-emerald-700', bg:'bg-emerald-50/60' },
            { label:'Pending',       val:fmt(totalPending), color:'text-amber-700',   bg:'bg-amber-50/60' },
            { label:'Discounts',     val:fmt(totalDiscount),color:'text-blue-700',    bg:'bg-blue-50/60' },
            { label:'Transactions',  val:String(payments.length), color:'text-gray-700', bg:'bg-gray-50/60' },
          ].map(s => (
            <div key={s.label} className={clsx('px-5 py-3', s.bg)}>
              <div className="text-xs text-gray-500 mb-0.5">{s.label}</div>
              <div className={clsx('text-lg font-bold', s.color)}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-2 flex-shrink-0">
          {([
            { id:'overview',       label:'Overview' },
            { id:'monthly',        label:`Monthly (${months.length} months)` },
            { id:'invoices',       label:`All Transactions (${payments.length})` },
            { id:'raise_invoice',  label:'🧾 Raise Invoice' },
          ] as const).map(t => (
            <button key={t.id} onClick={()=>setActiveTab(t.id)}
              className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab===t.id?'border-brand-500 text-brand-600':'border-transparent text-gray-400 hover:text-gray-600'
              )}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* ── OVERVIEW TAB ── */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Profile info */}
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Profile</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Email',       student.email],
                    ['Phone',       student.phone],
                    ['Date of Birth', student.date_of_birth],
                    ['Gender',      student.gender],
                    ['City',        student.city],
                    ['Area',        student.area],
                    ['Nationality', student.nationality],
                    ['Guardian',    student.guardian_name],
                    ['Guardian Ph', student.guardian_phone],
                    ['Discipline',  student.discipline],
                    ['Source',      student.referral_source],
                    ['Joined',      student.joined_date],
                  ].filter(([,v]) => v).map(([k,v]) => (
                    <div key={k} className="bg-gray-50 rounded-lg px-3 py-2">
                      <div className="text-xs text-gray-400">{k}</div>
                      <div className="text-sm font-medium text-gray-800">{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Enrolled subjects */}
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Enrolled Subjects</div>
                {enrolledSubs.length === 0
                  ? <div className="text-sm text-gray-300">No subjects enrolled</div>
                  : <div className="flex flex-wrap gap-2">
                      {enrolledSubs.map((s:any) => (
                        <span key={s.id} className={clsx('badge text-sm px-3 py-1', colorBadge[s.color]||colorBadge.violet)}>{s.name}</span>
                      ))}
                    </div>
                }
              </div>

              {/* Recent payments preview */}
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent Payments</div>
                {payments.slice(0, 5).map((p:any) => (
                  <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="text-sm font-medium text-gray-800">{p.subjects?.name || p.description?.split('|')[0]?.trim() || 'Payment'}</div>
                      <div className="text-xs text-gray-400">{p.month_label} · {p.payment_date||'—'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">{fmt(p.amount)}</div>
                      <span className={statusBadge(p.status)}>{p.status}</span>
                    </div>
                  </div>
                ))}
                {payments.length > 5 && (
                  <button onClick={()=>setActiveTab('monthly')} className="text-xs text-brand-500 hover:text-brand-700 mt-2">
                    View all {payments.length} transactions →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── MONTHLY TAB ── */}
          {activeTab === 'monthly' && (
            <div className="space-y-4">
              {months.length === 0
                ? <div className="text-center py-10 text-gray-300">No payment history</div>
                : months.map(month => {
                    const mPayments = byMonth[month]
                    const mPaid    = mPayments.filter((p:any)=>p.status==='paid').reduce((a:number,p:any)=>a+p.amount,0)
                    const mPending = mPayments.filter((p:any)=>p.status!=='paid'&&p.status!=='failed').reduce((a:number,p:any)=>a+p.amount,0)
                    const mDisc    = mPayments.reduce((a:number,p:any)=>a+(p.discount||0),0)
                    const allPaid  = mPayments.every((p:any)=>p.status==='paid')
                    const anyOverdue = mPayments.some((p:any)=>p.status==='overdue')

                    return (
                      <div key={month} className="card overflow-hidden">
                        {/* Month header */}
                        <div className={clsx('flex items-center justify-between px-4 py-3 border-b border-gray-100',
                          allPaid?'bg-emerald-50/60':anyOverdue?'bg-red-50/50':'bg-amber-50/40'
                        )}>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 text-sm">{month}</span>
                            <span className={clsx('badge text-xs',
                              allPaid?'bg-emerald-100 text-emerald-700':
                              anyOverdue?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'
                            )}>
                              {allPaid?'✓ Paid':anyOverdue?'Overdue':'Pending'}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            {mDisc>0 && <span className="text-blue-600">Disc: {fmt(mDisc)}</span>}
                            {mPending>0 && <span className="text-amber-700">Due: {fmt(mPending)}</span>}
                            <span className={clsx('font-bold text-sm', allPaid?'text-emerald-700':'text-gray-700')}>
                              {fmt(mPaid + mPending)}
                            </span>
                          </div>
                        </div>

                        {/* Month rows */}
                        <div>
                          {mPayments.map((p:any) => (
                            <div key={p.id} className="flex items-start justify-between px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-800">
                                  {p.subjects?.name || p.description?.split('|')[0]?.replace(/\d+x a week-\s*/i,'').trim() || 'Payment'}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                  {p.invoice_number && <span className="text-xs text-gray-400">Invoice #{p.invoice_number}</span>}
                                  {p.receipt_number && <span className="text-xs text-gray-400">Receipt #{p.receipt_number}</span>}
                                  {p.payment_date && <span className="text-xs text-gray-400">{p.payment_date}</span>}
                                  {p.mode_of_payment && <span className="text-xs text-gray-400">{p.mode_of_payment}</span>}
                                  {p.recorded_by && <span className="text-xs text-gray-400">by {p.recorded_by}</span>}
                                </div>
                                {p.description && p.description !== p.subjects?.name && (
                                  <div className="text-xs text-gray-400 mt-0.5 italic">{p.description?.slice(0,80)}</div>
                                )}
                              </div>
                              <div className="text-right ml-4 flex-shrink-0">
                                <div className="font-semibold text-sm">{fmt(p.amount)}</div>
                                {p.discount>0 && <div className="text-xs text-blue-600">-{fmt(p.discount)} disc</div>}
                                <span className={statusBadge(p.status)}>{p.status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })
              }

              {/* Annual summary */}
              {months.length > 0 && (
                <div className="card p-4 bg-gray-50 border-gray-200">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Lifetime Summary</div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div><div className="text-xl font-bold text-emerald-700">{fmt(totalPaid)}</div><div className="text-xs text-gray-400">Total Paid</div></div>
                    <div><div className="text-xl font-bold text-blue-600">{fmt(totalDiscount)}</div><div className="text-xs text-gray-400">Total Discounts</div></div>
                    <div><div className="text-xl font-bold text-gray-700">{months.length}</div><div className="text-xs text-gray-400">Months Active</div></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── INVOICES / ALL TRANSACTIONS TAB ── */}
          {activeTab === 'invoices' && (
            <div>
              {payments.length === 0
                ? <div className="text-center py-10 text-gray-300">No transactions found</div>
                : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="th">Date</th>
                        <th className="th">Invoice</th>
                        <th className="th">Subject</th>
                        <th className="th">Description</th>
                        <th className="th">Mode</th>
                        <th className="th text-right">Discount</th>
                        <th className="th text-right">Amount</th>
                        <th className="th">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p:any) => (
                        <tr key={p.id} className={clsx('hover:bg-gray-50/50', p.status==='failed'&&'opacity-40')}>
                          <td className="td text-gray-500 whitespace-nowrap">{p.payment_date||'—'}</td>
                          <td className="td text-gray-400 whitespace-nowrap">
                            {p.invoice_number && <div>Inv #{p.invoice_number}</div>}
                            {p.receipt_number && <div className="text-xs">Rec #{p.receipt_number}</div>}
                          </td>
                          <td className="td">
                            {p.subjects && (
                              <span className={clsx('badge', colorBadge[p.subjects.color]||colorBadge.violet)}>
                                {p.subjects.name}
                              </span>
                            )}
                          </td>
                          <td className="td text-gray-400 max-w-[160px]">
                            <div className="truncate text-xs">{p.description?.split('|')[0]?.replace(/\d+x a week-\s*/i,'').trim()||'—'}</div>
                            {p.recorded_by && <div className="text-xs text-gray-300">by {p.recorded_by}</div>}
                          </td>
                          <td className="td text-gray-400">{p.mode_of_payment||'—'}</td>
                          <td className="td text-right text-blue-600">{p.discount>0?`-${fmt(p.discount)}`:''}</td>
                          <td className="td text-right font-semibold">{fmt(p.amount)}</td>
                          <td className="td"><span className={statusBadge(p.status)}>{p.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50">
                        <td colSpan={5} className="td text-right text-xs font-medium text-gray-500">Totals</td>
                        <td className="td text-right text-blue-600 font-semibold">{totalDiscount>0?`-${fmt(totalDiscount)}`:''}</td>
                        <td className="td text-right font-bold text-emerald-700">{fmt(totalPaid)}</td>
                        <td className="td"></td>
                      </tr>
                    </tfoot>
                  </table>
                )
              }
            </div>
          )}

          {/* ── RAISE INVOICE TAB ── */}
          {activeTab === 'raise_invoice' && (
            <RaiseInvoicePanel
              student={student}
              subjects={subjects}
              packages={packages}
              fees={fees}
              supabase={supabase}
              reload={reload}
              onSuccess={()=>setActiveTab('invoices')}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// RAISE INVOICE PANEL
// ══════════════════════════════════════════════════════════════
const MONTHS_OPTIONS = Array.from({length:12},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-2+i);return d.toLocaleString('en-IN',{month:'long',year:'numeric'})})
const UPI_ID = 'truetoneacademy@sbi'
const ACADEMY_NAME = 'True Tone Music Academy'
const ACADEMY_ADDRESS = 'Hoodi, Bengaluru'
const ACADEMY_PHONE = '+91 97312 70069'

function RaiseInvoicePanel({ student, subjects, packages, fees, supabase, reload, onSuccess }: any) {
  const enrolledSubs = subjects.filter((s:any) =>
    student.student_subjects?.some((ss:any) => ss.subject_id === s.id)
  )
  const allSubs = subjects

  const [form, setForm] = useState({
    subject_id: enrolledSubs[0]?.id || '',
    package_id: '',
    grade_level: 'Beginner–Grade 2',
    month_label: MONTHS_OPTIONS[2],
    amount: '',
    discount: '',
    notes: '',
    mode_of_payment: 'UPI',
    due_date: new Date(Date.now()+7*86400000).toISOString().slice(0,10),
    status: 'pending' as 'pending'|'paid',
  })
  const [busy, setBusy] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [invoiceNo, setInvoiceNo] = useState('')

  // Get packages for selected subject + grade
  const subjectPackages = packages.filter((p:any) =>
    p.subject_id === form.subject_id && (p.grade_level === form.grade_level || p.grade_level === 'All Levels')
  )

  // When subject changes, reset package and auto-fill from fee_structures
  useEffect(() => {
    const fee = fees.find((f:any) => f.subject_id === form.subject_id)
    setForm(f => ({ ...f, package_id: '', amount: fee ? String(fee.amount) : f.amount }))
  }, [form.subject_id])

  // When package changes, auto-fill amount
  useEffect(() => {
    if (!form.package_id) return
    const pkg = packages.find((p:any) => p.id === form.package_id)
    if (pkg) setForm(f => ({ ...f, amount: String(pkg.price) }))
  }, [form.package_id])

  const selectedSub = subjects.find((s:any) => s.id === form.subject_id)
  const selectedPkg = packages.find((p:any) => p.id === form.package_id)
  const rawAmount = parseFloat(form.amount) || 0
  const discountAmt = parseFloat(form.discount) || 0
  const finalAmount = Math.max(0, rawAmount - discountAmt)

  // Generate invoice number
  useEffect(() => {
    const ts = Date.now().toString().slice(-6)
    setInvoiceNo(`INV-${ts}`)
  }, [])

  async function saveInvoice() {
    if (!form.subject_id || !form.amount) return
    setBusy(true)
    const { error } = await supabase.from('payments').insert({
      student_id:      student.id,
      subject_id:      form.subject_id || null,
      amount:          finalAmount,
      discount:        discountAmt || null,
      payment_date:    form.status === 'paid' ? new Date().toISOString().slice(0,10) : null,
      status:          form.status,
      month_label:     form.month_label,
      due_date:        form.due_date || null,
      invoice_number:  invoiceNo.replace('INV-',''),
      mode_of_payment: form.mode_of_payment,
      description:     selectedPkg ? selectedPkg.name : (selectedSub?.name || ''),
      notes:           form.notes || null,
      student_name:    student.full_name,
      student_email:   student.email,
      student_phone:   student.phone,
      student_id_ext:  student.student_id_ext,
      recorded_by:     'Academy',
    })
    setBusy(false)
    if (!error) { reload(); onSuccess() }
    else alert('Error: ' + error.message)
  }

  if (showPreview) return (
    <InvoicePreview
      student={student}
      subject={selectedSub}
      pkg={selectedPkg}
      form={form}
      invoiceNo={invoiceNo}
      rawAmount={rawAmount}
      discountAmt={discountAmt}
      finalAmount={finalAmount}
      onBack={()=>setShowPreview(false)}
      onSave={saveInvoice}
      busy={busy}
    />
  )

  return (
    <div className="space-y-5">
      <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 text-xs text-brand-700">
        Raising invoice for <strong>{student.full_name}</strong> · ID #{student.student_id_ext || student.id.slice(0,6)}
      </div>

      {/* Subject */}
      <div>
        <label className="label">Subject *</label>
        <div className="grid grid-cols-2 gap-2">
          {allSubs.map((s:any) => (
            <button key={s.id} type="button"
              onClick={() => setForm(f => ({ ...f, subject_id: s.id, package_id: '' }))}
              className={clsx('px-3 py-2 rounded-xl border text-sm font-medium text-left transition-all flex items-center gap-2',
                form.subject_id === s.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              )}>
              <span className={clsx('badge text-xs', colorBadge[s.color]||colorBadge.violet)}>{s.code}</span>
              {s.name}
              {enrolledSubs.some((es:any) => es.id === s.id) && <span className="ml-auto text-xs text-emerald-600">✓ enrolled</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Grade Level */}
      <div>
        <label className="label">Grade Level</label>
        <div className="flex gap-2 flex-wrap">
          {['Beginner–Grade 2','Grade 3–5','Grade 6–8'].map(g => (
            <button key={g} type="button"
              onClick={() => setForm(f => ({ ...f, grade_level: g, package_id: '' }))}
              className={clsx('px-3 py-1.5 rounded-lg border text-sm font-medium transition-all',
                form.grade_level === g ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              )}>
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Package selection */}
      {subjectPackages.length > 0 && (
        <div>
          <label className="label">Package (optional — auto-fills price)</label>
          <div className="grid grid-cols-2 gap-2">
            {subjectPackages.map((p:any) => (
              <button key={p.id} type="button"
                onClick={() => setForm(f => ({ ...f, package_id: p.id }))}
                className={clsx('p-3 rounded-xl border text-left transition-all',
                  form.package_id === p.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:border-gray-300'
                )}>
                <div className="text-sm font-semibold text-gray-900">{fmt(p.price)}<span className="text-xs text-gray-400 font-normal">/mo</span></div>
                <div className="text-xs text-gray-500 mt-0.5">{p.name} · {p.duration_min}min</div>
                <div className="text-xs text-gray-400">{fmt(Math.round(p.price/p.classes_pm))}/class</div>
              </button>
            ))}
            <button type="button"
              onClick={() => setForm(f => ({ ...f, package_id: '' }))}
              className={clsx('p-3 rounded-xl border text-left transition-all',
                !form.package_id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:border-gray-300'
              )}>
              <div className="text-sm font-semibold text-gray-900">Custom</div>
              <div className="text-xs text-gray-500">Enter amount manually</div>
            </button>
          </div>
        </div>
      )}

      {/* Amount + Discount */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount (₹) *</label>
          <input className="input text-lg font-semibold" type="number" value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 2200"/>
        </div>
        <div>
          <label className="label">Discount (₹)</label>
          <input className="input" type="number" value={form.discount}
            onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} placeholder="0"/>
        </div>
      </div>

      {/* Final amount display */}
      {(rawAmount > 0) && (
        <div className={clsx('flex items-center justify-between px-4 py-3 rounded-xl',
          discountAmt > 0 ? 'bg-blue-50 border border-blue-100' : 'bg-emerald-50 border border-emerald-100'
        )}>
          <div className="text-sm text-gray-600">
            {discountAmt > 0 && <span className="text-blue-600">{fmt(rawAmount)} - {fmt(discountAmt)} disc = </span>}
            <strong className="text-gray-900">Final Amount:</strong>
          </div>
          <div className="text-xl font-bold text-emerald-700">{fmt(finalAmount)}</div>
        </div>
      )}

      {/* Month + Mode */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Month</label>
          <select className="input" value={form.month_label} onChange={e => setForm(f => ({ ...f, month_label: e.target.value }))}>
            {MONTHS_OPTIONS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Payment Mode</label>
          <select className="input" value={form.mode_of_payment} onChange={e => setForm(f => ({ ...f, mode_of_payment: e.target.value }))}>
            {['UPI','Cash','Credit / Debit Card','Payment gateway','Bank Transfer','Cheque'].map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Status + Due Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Status</label>
          <div className="flex gap-2">
            {(['pending','paid'] as const).map(s => (
              <button key={s} type="button"
                onClick={() => setForm(f => ({ ...f, status: s }))}
                className={clsx('flex-1 py-2 rounded-lg border text-sm font-medium capitalize transition-all',
                  form.status === s
                    ? s === 'paid' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-amber-400 bg-amber-400 text-white'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                )}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Due Date</label>
          <input className="input" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}/>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="label">Notes (optional)</label>
        <input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. 3 months advance payment"/>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button onClick={() => setShowPreview(true)} disabled={!form.subject_id || !form.amount} className="btn flex-1 justify-center">
          <Eye className="w-4 h-4"/> Preview Invoice
        </button>
        <button onClick={saveInvoice} disabled={busy || !form.subject_id || !form.amount} className="btn-primary flex-1 justify-center">
          {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileText className="w-4 h-4"/>}
          Save & Record
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// INVOICE PREVIEW — printable with QR code
// ══════════════════════════════════════════════════════════════
function InvoicePreview({ student, subject, pkg, form, invoiceNo, rawAmount, discountAmt, finalAmount, onBack, onSave, busy }: any) {
  const [emailSending, setEmailSending] = useState(false)
  const [emailResult, setEmailResult] = useState('')

  async function sendInvoiceEmail() {
    if (!student.email) { setEmailResult('❌ No email address on file for this student'); return }
    setEmailSending(true); setEmailResult('')
    const issueDate = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})
    const dueDate = new Date(form.due_date).toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})
    const r = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'invoice',
        studentEmail: student.email,
        studentName: student.full_name,
        invoiceData: {
          invoiceNo, subjectName: subject?.name || 'Tuition',
          pkgName: pkg?.name || null,
          monthLabel: form.month_label, rawAmount, discountAmt, finalAmount,
          issueDate, dueDate, status: form.status,
          notes: form.notes || null,
          upiId: UPI_ID, academyName: ACADEMY_NAME,
          academyAddress: ACADEMY_ADDRESS, academyPhone: ACADEMY_PHONE,
          studentPhone: student.phone, studentIdExt: student.student_id_ext,
        }
      })
    })
    const d = await r.json()
    setEmailSending(false)
    if (d.ok) setEmailResult(d.dev ? '✓ Email queued (add RESEND_API_KEY to send for real)' : `✓ Invoice emailed to ${student.email}`)
    else setEmailResult(`❌ ${d.error || 'Failed to send'}`)
  }

  const issueDate = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})
  const dueDate = new Date(form.due_date).toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})

  // UPI QR code URL via Google Charts API (free, no key needed)
  const upiString = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(ACADEMY_NAME)}&am=${finalAmount}&cu=INR&tn=${encodeURIComponent(invoiceNo)}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(upiString)}`

  return (
    <div>
      {/* Print/Save/Email actions */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <button onClick={onBack} className="btn"><X className="w-4 h-4"/> Back</button>
        <button onClick={() => window.print()} className="btn"><Download className="w-4 h-4"/> Print / PDF</button>
        <button onClick={sendInvoiceEmail} disabled={emailSending || !student.email} className="btn text-brand-600 border-brand-200 hover:bg-brand-50">
          {emailSending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Mail className="w-4 h-4"/>}
          {emailSending ? 'Sending…' : student.email ? `Email to ${student.email}` : 'No email on file'}
        </button>
        <button onClick={onSave} disabled={busy} className="btn-primary ml-auto">
          {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4"/>}
          Confirm & Save
        </button>
      </div>
      {emailResult && (
        <div className={clsx('mb-3 px-3 py-2 rounded-lg text-sm border', emailResult.startsWith('✓') ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100')}>
          {emailResult}
        </div>
      )}

      {/* Invoice document */}
      <div id="invoice-print" className="border border-gray-200 rounded-2xl overflow-hidden bg-white" style={{fontFamily:'sans-serif'}}>
        {/* Header band */}
        <div style={{background:'#3B1F8C',padding:'20px 24px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              <img src="/logo.png" alt="Logo" style={{width:'36px',height:'36px',borderRadius:'50%',objectFit:'cover',border:'2px solid rgba(255,255,255,0.3)'}}/>
              <div style={{color:'white',fontSize:'18px',fontWeight:700,letterSpacing:'-0.3px'}}>{ACADEMY_NAME}</div>
            </div>
            <div style={{color:'rgba(255,255,255,0.7)',fontSize:'12px',marginTop:'2px'}}>{ACADEMY_ADDRESS} · {ACADEMY_PHONE}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{color:'rgba(255,255,255,0.5)',fontSize:'11px',textTransform:'uppercase',letterSpacing:'0.08em'}}>Invoice</div>
            <div style={{color:'white',fontSize:'16px',fontWeight:700,fontFamily:'monospace'}}>{invoiceNo}</div>
          </div>
        </div>

        <div style={{padding:'20px 24px'}}>
          {/* Billed to + dates row */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'20px'}}>
            <div style={{background:'#f9fafb',borderRadius:'10px',padding:'12px 14px'}}>
              <div style={{fontSize:'10px',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'6px'}}>Billed To</div>
              <div style={{fontWeight:600,fontSize:'14px',color:'#111827'}}>{student.full_name}</div>
              {student.email && <div style={{fontSize:'12px',color:'#6b7280',marginTop:'2px'}}>{student.email}</div>}
              {student.phone && <div style={{fontSize:'12px',color:'#6b7280'}}>{student.phone}</div>}
              {student.student_id_ext && <div style={{fontSize:'11px',color:'#9ca3af',marginTop:'4px'}}>Student ID: #{student.student_id_ext}</div>}
            </div>
            <div style={{background:'#f9fafb',borderRadius:'10px',padding:'12px 14px'}}>
              <div style={{fontSize:'10px',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'6px'}}>Invoice Details</div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                <span style={{fontSize:'12px',color:'#6b7280'}}>Issue Date</span>
                <span style={{fontSize:'12px',fontWeight:500}}>{issueDate}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                <span style={{fontSize:'12px',color:'#6b7280'}}>Due Date</span>
                <span style={{fontSize:'12px',fontWeight:500,color: form.status==='paid'?'#059669':'#d97706'}}>{dueDate}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span style={{fontSize:'12px',color:'#6b7280'}}>Status</span>
                <span style={{fontSize:'12px',fontWeight:600,color:form.status==='paid'?'#059669':'#d97706',textTransform:'capitalize'}}>{form.status}</span>
              </div>
            </div>
          </div>

          {/* Line items table */}
          <table style={{width:'100%',borderCollapse:'collapse',marginBottom:'16px',fontSize:'13px'}}>
            <thead>
              <tr style={{borderBottom:'2px solid #e5e7eb'}}>
                <th style={{textAlign:'left',padding:'8px 0',color:'#6b7280',fontWeight:500,fontSize:'11px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Description</th>
                <th style={{textAlign:'center',padding:'8px 0',color:'#6b7280',fontWeight:500,fontSize:'11px',textTransform:'uppercase'}}>Period</th>
                <th style={{textAlign:'right',padding:'8px 0',color:'#6b7280',fontWeight:500,fontSize:'11px',textTransform:'uppercase'}}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{borderBottom:'1px solid #f3f4f6'}}>
                <td style={{padding:'12px 0'}}>
                  <div style={{fontWeight:600,color:'#111827'}}>{subject?.name || 'Tuition'}{pkg ? ` — ${pkg.name}` : ''}</div>
                  {pkg && <div style={{fontSize:'11px',color:'#9ca3af',marginTop:'2px'}}>{pkg.classes_pm} classes/month · {pkg.duration_min} min each</div>}
                  {form.notes && <div style={{fontSize:'11px',color:'#6b7280',marginTop:'2px',fontStyle:'italic'}}>{form.notes}</div>}
                </td>
                <td style={{padding:'12px 0',textAlign:'center',color:'#6b7280'}}>{form.month_label}</td>
                <td style={{padding:'12px 0',textAlign:'right',fontWeight:500}}>₹{rawAmount.toLocaleString('en-IN')}</td>
              </tr>
              {discountAmt > 0 && (
                <tr style={{borderBottom:'1px solid #f3f4f6'}}>
                  <td style={{padding:'8px 0',color:'#2563eb',fontStyle:'italic',fontSize:'12px'}}>Discount</td>
                  <td></td>
                  <td style={{padding:'8px 0',textAlign:'right',color:'#2563eb',fontWeight:500}}>-₹{discountAmt.toLocaleString('en-IN')}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Total + QR */}
          <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'16px',alignItems:'end'}}>
            {/* Total box */}
            <div>
              <div style={{background:'#3B1F8C',borderRadius:'10px',padding:'14px 18px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{color:'rgba(255,255,255,0.8)',fontSize:'13px',fontWeight:500}}>Total {form.status==='paid'?'Paid':'Due'}</span>
                <span style={{color:'white',fontSize:'22px',fontWeight:700}}>₹{finalAmount.toLocaleString('en-IN')}</span>
              </div>
              <div style={{marginTop:'10px',padding:'10px 14px',background:'#f0fdf4',borderRadius:'8px',border:'1px solid #bbf7d0'}}>
                <div style={{fontSize:'11px',color:'#166534',fontWeight:600,marginBottom:'4px'}}>Payment via UPI</div>
                <div style={{fontSize:'13px',color:'#15803d',fontWeight:700,fontFamily:'monospace'}}>{UPI_ID}</div>
                <div style={{fontSize:'11px',color:'#16a34a',marginTop:'2px'}}>State Bank of India</div>
              </div>
            </div>
            {/* QR Code */}
            <div style={{textAlign:'center'}}>
              <img
                src={qrUrl}
                alt="UPI QR Code"
                style={{width:'110px',height:'110px',borderRadius:'8px',border:'1px solid #e5e7eb'}}
                onError={e => { (e.target as HTMLImageElement).style.display='none' }}
              />
              <div style={{fontSize:'10px',color:'#9ca3af',marginTop:'4px'}}>Scan to pay</div>
              <div style={{fontSize:'10px',color:'#6b7280',fontWeight:600}}>{UPI_ID}</div>
            </div>
          </div>

          {/* Footer */}
          <div style={{marginTop:'16px',paddingTop:'12px',borderTop:'1px solid #f3f4f6',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontSize:'11px',color:'#9ca3af'}}>
              Thank you for learning with us! · {ACADEMY_NAME}
            </div>
            <div style={{fontSize:'11px',color:'#9ca3af',fontFamily:'monospace'}}>{invoiceNo}</div>
          </div>
        </div>
      </div>

      {/* Print styles injected */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-print, #invoice-print * { visibility: visible !important; }
          #invoice-print { position: fixed; top: 0; left: 0; width: 100%; border: none !important; border-radius: 0 !important; }
        }
      `}</style>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// REPORTS TAB
// ══════════════════════════════════════════════════════════════
// ── Donut/Pie chart using SVG ────────────────────────────────
function DonutChart({ data, total }: { data: { label: string; value: number; color: string }[], total: number }) {
  const COLORS: Record<string,string> = {
    'emerald-500': '#10b981', 'blue-500': '#3b82f6', 'violet-500': '#8b5cf6',
    'amber-400': '#f59e0b', 'orange-400': '#f97316', 'red-500': '#ef4444',
    'slate-400': '#94a3b8', 'gray-300': '#d1d5db', 'gray-400': '#9ca3af',
    'brand-500': '#3B1F8C', 'purple-700': '#7e22ce', 'teal-400': '#2dd4bf',
  }
  const SIZE = 180, CX = 90, CY = 90, R = 70, INNER = 45
  const validData = data.filter(d => d.value > 0)
  if (!validData.length) return <div className="text-center py-8 text-gray-300">No data</div>

  let cumAngle = -90 // start from top
  const slices = validData.map(d => {
    const pct = d.value / total
    const angle = pct * 360
    const startAngle = cumAngle
    cumAngle += angle
    const endAngle = cumAngle

    const toRad = (deg: number) => (deg * Math.PI) / 180
    const x1 = CX + R * Math.cos(toRad(startAngle))
    const y1 = CY + R * Math.sin(toRad(startAngle))
    const x2 = CX + R * Math.cos(toRad(endAngle))
    const y2 = CY + R * Math.sin(toRad(endAngle))
    const xi1 = CX + INNER * Math.cos(toRad(startAngle))
    const yi1 = CY + INNER * Math.sin(toRad(startAngle))
    const xi2 = CX + INNER * Math.cos(toRad(endAngle))
    const yi2 = CY + INNER * Math.sin(toRad(endAngle))
    const large = angle > 180 ? 1 : 0

    return {
      ...d,
      path: `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${INNER} ${INNER} 0 ${large} 0 ${xi1} ${yi1} Z`,
      fill: COLORS[d.color] || '#6b7280',
      pct: Math.round(pct * 100),
    }
  })

  const [hovered, setHovered] = React.useState<string | null>(null)

  return (
    <div className="flex items-center gap-8">
      <div className="relative flex-shrink-0">
        <svg width={SIZE} height={SIZE} className="overflow-visible">
          {slices.map((slice, i) => (
            <path key={i}
              d={slice.path}
              fill={slice.fill}
              opacity={hovered && hovered !== slice.label ? 0.4 : 1}
              stroke="white" strokeWidth={2}
              className="transition-all duration-200 cursor-pointer"
              onMouseEnter={() => setHovered(slice.label)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
          {/* Center text */}
          <text x={CX} y={CY - 6} textAnchor="middle" className="text-2xl font-black" style={{ fontSize: '24px', fontWeight: 800, fill: '#111827' }}>{total}</text>
          <text x={CX} y={CY + 14} textAnchor="middle" style={{ fontSize: '11px', fill: '#9ca3af' }}>students</text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex-1 space-y-2.5">
        {slices.map(slice => (
          <div key={slice.label}
            className={clsx('flex items-center justify-between py-1.5 px-2 rounded-lg transition-all cursor-default', hovered === slice.label ? 'bg-gray-50' : '')}
            onMouseEnter={() => setHovered(slice.label)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[slice.color] || '#6b7280' }}/>
              <span className="text-sm text-gray-700">{slice.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{slice.pct}%</span>
              <span className="text-sm font-bold text-gray-900 w-6 text-right">{slice.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportsTab({ students, subjects, payments, profiles, attendance, reload }: any) {
  const [activeReport, setActiveReport] = useState<string>('students_status')

  // ── helpers ──────────────────────────────────────────────────
  const paidPayments = payments.filter((p: any) => p.status === 'paid')

  // Financial year: 1 April to 31 March. If today is Jan-Mar, FY started last calendar year.
  const today = new Date()
  const fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1 // getMonth() 3 = April
  const fyLabel = `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}` // e.g. "FY 2025-26"
  const fyStart = new Date(fyStartYear, 3, 1) // 1 April
  const fyStartStr = `${fyStartYear}-04-01`

  const ytdPayments = paidPayments.filter((p: any) => p.payment_date && p.payment_date >= fyStartStr)

  // Month-to-date: current calendar month only
  const mtdKey = today.toISOString().slice(0, 7)
  const mtdPayments = paidPayments.filter((p: any) => p.payment_date?.startsWith(mtdKey))
  const totalMTD = mtdPayments.reduce((a: number, p: any) => a + p.amount, 0)

  // Build the ordered list of financial-year months Apr..Mar (only up to current month if current FY)
  const monthsSinceApril = (today.getFullYear() - fyStartYear) * 12 + (today.getMonth() - 3) + 1
  const fyMonthsToDate = Array.from({ length: Math.min(monthsSinceApril, 12) }, (_, i) => {
    const idx = (3 + i) % 12 // 3 = April (0-indexed)
    const yr = fyStartYear + Math.floor((3 + i) / 12)
    return `${yr}-${String(idx + 1).padStart(2, '0')}`
  })

  // Students by instrument/subject
  const studentsBySubject: Record<string, number> = {}
  subjects.forEach((s: any) => {
    const count = students.filter((st: any) =>
      (st.student_subjects || []).some((ss: any) => ss.subject_id === s.id)
    ).length
    if (count > 0) studentsBySubject[s.name] = count
  })

  // Students by status — all 7 classifications
  const statusCounts = STUDENT_STATUSES.map(st => ({
    ...st,
    count: students.filter((s: any) => (s.status || 'Active') === st.value).length
  })).filter(st => st.count > 0)

  const activeStudents = students.filter((s: any) => s.status === 'Active' || !s.status).length
  const inactiveStudents = students.length - activeStudents

  // Students by grade level (from student_subjects)
  const byGrade: Record<string,number> = {}
  students.forEach((s: any) => {
    (s.student_subjects || []).forEach((ss: any) => {
      const g = ss.grade_level || 'Unassigned'
      byGrade[g] = (byGrade[g] || 0) + 1
    })
  })

  // Payments by month (last 12)
  const monthlyCollection: Record<string, number> = {}
  paidPayments.forEach((p: any) => {
    if (!p.payment_date) return
    const key = p.payment_date.slice(0, 7) // YYYY-MM
    monthlyCollection[key] = (monthlyCollection[key] || 0) + p.amount
  })
  const last12Months = Array.from({ length: 12 }, (_, i) => {
    const totalMonths = today.getFullYear() * 12 + today.getMonth() - (11 - i)
    const yr = Math.floor(totalMonths / 12)
    const mo = totalMonths % 12
    return `${yr}-${String(mo + 1).padStart(2, '0')}`
  })

  // Payments by mode
  const byMode: Record<string, number> = {}
  paidPayments.forEach((p: any) => {
    const mode = p.mode_of_payment || 'Unknown'
    byMode[mode] = (byMode[mode] || 0) + p.amount
  })

  // Payments by subject — all-time, YTD (financial year), and MTD
  const bySubject: Record<string, number> = {}
  const bySubjectYTD: Record<string, number> = {}
  const bySubjectMTD: Record<string, number> = {}
  payments.forEach((p: any) => {
    if (p.status !== 'paid') return
    const name = p.subjects?.name || 'Other'
    bySubject[name] = (bySubject[name] || 0) + p.amount
    if (p.payment_date && p.payment_date >= fyStartStr) bySubjectYTD[name] = (bySubjectYTD[name] || 0) + p.amount
    if (p.payment_date?.startsWith(mtdKey)) bySubjectMTD[name] = (bySubjectMTD[name] || 0) + p.amount
  })

  // YTD by month
  const ytdByMonth: Record<string, number> = {}
  ytdPayments.forEach((p: any) => {
    const key = p.payment_date?.slice(0, 7)
    if (key) ytdByMonth[key] = (ytdByMonth[key] || 0) + p.amount
  })

  const totalYTD = ytdPayments.reduce((a: number, p: any) => a + p.amount, 0)
  const totalEver = paidPayments.reduce((a: number, p: any) => a + p.amount, 0)

  // Attendance stats
  const attPresent = attendance.filter((a: any) => a.status === 'present' && a.type === 'student').length
  const attAbsent = attendance.filter((a: any) => a.status === 'absent' && a.type === 'student').length
  const attBillable = attendance.filter((a: any) => a.status === 'absent_billable' && a.type === 'student').length

  const reports = [
    { id: 'students_status',     label: 'Students by Status',     group: 'Student Reports' },
    { id: 'students_inactive',   label: 'Inactive Students',      group: 'Student Reports' },
    { id: 'students_instrument', label: 'Students by Instrument', group: 'Student Reports' },
    { id: 'students_grade',      label: 'Students by Grade',      group: 'Student Reports' },
    { id: 'students_payment',    label: 'Students by Payment',    group: 'Student Reports' },
    { id: 'payment_monthly',     label: 'Monthly Collection',     group: 'Payment Reports' },
    { id: 'payment_ytd',         label: 'Year to Date',           group: 'Payment Reports' },
    { id: 'payment_mode',        label: 'Payment by Mode',        group: 'Payment Reports' },
    { id: 'payment_subject',     label: 'Revenue by Subject',     group: 'Payment Reports' },
    { id: 'attendance_report',   label: 'Attendance Summary',     group: 'Other' },
  ]

  const BAR_COLORS = ['#3B1F8C','#7B5FC4','#A98CE8','#4A2FA0','#6B55C8','#8F7ED5','#C8B5F5','#D8D1F0']

  function BarChart({ data, valuePrefix = '₹' }: { data: Record<string,number>, valuePrefix?: string }) {
    const entries = Object.entries(data).sort(([,a],[,b]) => b - a)
    const max = Math.max(...entries.map(([,v]) => v), 1)
    return (
      <div className="space-y-2.5">
        {entries.map(([label, value], i) => (
          <div key={label}>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span className="truncate max-w-[180px] font-medium">{label}</span>
              <span className="font-semibold ml-2">{valuePrefix === '₹' ? fmt(value) : value}</span>
            </div>
            <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(value / max) * 100}%`, background: BAR_COLORS[i % BAR_COLORS.length] }}
              />
            </div>
          </div>
        ))}
        {!entries.length && <div className="text-center text-gray-300 py-8">No data</div>}
      </div>
    )
  }

  function MonthChart({ data, months }: { data: Record<string,number>, months: string[] }) {
    const max = Math.max(...months.map(m => data[m] || 0), 1)
    return (
      <div>
        <div className="flex items-end gap-1.5 h-40 mb-2">
          {months.map((m, i) => {
            const val = data[m] || 0
            const pct = (val / max) * 100
            const label = new Date(m + '-01').toLocaleString('en-IN', { month: 'short' })
            return (
              <div key={m} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full relative flex items-end" style={{ height: '120px' }}>
                  <div
                    className="w-full rounded-t-md transition-all duration-500"
                    style={{ height: `${pct}%`, minHeight: val > 0 ? 4 : 0, background: BAR_COLORS[i % BAR_COLORS.length] }}
                    title={`${label}: ${fmt(val)}`}
                  />
                </div>
                <div className="text-xs text-gray-400">{label}</div>
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-2 border-t border-gray-100 pt-2">
          <span>Total: <strong className="text-gray-700">{fmt(months.reduce((a, m) => a + (data[m] || 0), 0))}</strong></span>
          <span>Avg/mo: <strong className="text-gray-700">{fmt(Math.round(months.reduce((a, m) => a + (data[m] || 0), 0) / months.filter(m => data[m]).length || 1))}</strong></span>
        </div>
      </div>
    )
  }

  // Export CSV helper
  function exportCSV(data: Record<string,any>[], filename: string) {
    const keys = Object.keys(data[0] || {})
    const csv = [keys.join(','), ...data.map(r => keys.map(k => `"${r[k] || ''}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = filename
    a.click()
  }

  return (
    <div className="animate-fu">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-400 mt-0.5">Analytics & insights</p>
        </div>
        {/* Summary pills */}
        <div className="flex gap-2 text-xs">
          <div className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg font-medium">MTD: {fmt(totalMTD)}</div>
          <div className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg font-medium">YTD: {fmt(totalYTD)}</div>
          <div className="px-3 py-1.5 bg-brand-50 text-brand-700 rounded-lg font-medium">Ever: {fmt(totalEver)}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label:'Active Students', val:activeStudents, sub:`${inactiveStudents} inactive`, color:'bg-blue-50 text-blue-700' },
          { label:'Subjects Offered', val:subjects.length, sub:`${Object.keys(studentsBySubject).length} with students`, color:'bg-violet-50 text-violet-700' },
          { label:'Collected YTD', val:fmt(totalYTD), sub:fyLabel, color:'bg-emerald-50 text-emerald-700' },
          { label:'Attendance Rate', val:attPresent+attAbsent+attBillable>0?`${Math.round(attPresent/(attPresent+attAbsent+attBillable)*100)}%`:'—', sub:`${attPresent} present · ${attBillable} billable`, color:'bg-amber-50 text-amber-700' },
        ].map(m => (
          <div key={m.label} className={clsx('card p-4 border-0', m.color)}>
            <div className="text-xs font-medium opacity-70 mb-1">{m.label}</div>
            <div className="text-2xl font-bold">{m.val}</div>
            <div className="text-xs opacity-60 mt-0.5">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-5">
        {/* Left nav */}
        <div className="col-span-1">
          <div className="card p-2">
            {(['Student Reports','Payment Reports','Other'] as const).map(group => (
              <div key={group}>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 py-1.5 mt-1">{group}</div>
                {reports.filter(r => r.group === group).map(r => (
                  <button key={r.id} onClick={() => setActiveReport(r.id)}
                    className={clsx('w-full text-left px-3 py-2 rounded-lg text-sm transition-all mb-0.5',
                      activeReport===r.id ? 'bg-brand-500 text-white font-medium' : 'text-gray-600 hover:bg-gray-50'
                    )}>
                    {r.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Right content */}
        <div className="col-span-3 card p-5">
          {activeReport === 'students_status' && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-gray-900">Students by Status</h2>
                <button onClick={() => exportCSV(statusCounts.map(s => ({ Status: s.label, Count: s.count, Percentage: `${Math.round(s.count/students.length*100)}%` })), 'students_by_status.csv')} className="btn btn-sm"><Download className="w-3 h-3"/> Export</button>
              </div>

              {/* Donut chart using SVG */}
              <DonutChart data={statusCounts.map(s => ({ label: s.label, value: s.count, color: s.dot.replace('bg-','') }))} total={students.length}/>

              {/* Status breakdown bars */}
              <div className="mt-6 space-y-3">
                {statusCounts.map((st, i) => {
                  const pct = Math.round((st.count / students.length) * 100)
                  return (
                    <div key={st.value}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className={clsx('w-3 h-3 rounded-full', st.dot)}/>
                          <span className="font-medium text-gray-800">{st.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-400 text-xs">{pct}%</span>
                          <span className="font-semibold text-gray-900 w-6 text-right">{st.count}</span>
                        </div>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={clsx('h-full rounded-full transition-all duration-700', st.dot)}
                          style={{ width: `${pct}%` }}/>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Summary grid */}
              <div className="grid grid-cols-4 gap-3 mt-6">
                {statusCounts.map(st => (
                  <div key={st.value} className={clsx('rounded-xl p-3 border text-center', st.color)}>
                    <div className="text-2xl font-bold">{st.count}</div>
                    <div className="text-xs mt-0.5 opacity-75">{st.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeReport === 'students_grade' && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-gray-900">Students by Grade Level</h2>
                <button onClick={() => exportCSV(Object.entries(byGrade).map(([Grade,Count]) => ({Grade,Count})), 'students_by_grade.csv')} className="btn btn-sm"><Download className="w-3 h-3"/> Export</button>
              </div>

              {Object.keys(byGrade).length === 0
                ? <div className="text-center py-10 text-gray-300">No grade level data — assign grade levels when enrolling students to subjects</div>
                : (
                  <>
                    <DonutChart
                      data={[
                        { label: 'Beginner–Grade 2', value: byGrade['Beginner–Grade 2'] || 0, color: 'emerald-500' },
                        { label: 'Grade 3–5',        value: byGrade['Grade 3–5'] || 0,        color: 'blue-500' },
                        { label: 'Grade 6–8',        value: byGrade['Grade 6–8'] || 0,        color: 'violet-500' },
                        { label: 'Unassigned',       value: byGrade['Unassigned'] || 0,       color: 'gray-300' },
                      ].filter(d => d.value > 0)}
                      total={Object.values(byGrade).reduce((a,b)=>a+b,0)}
                    />
                    <div className="mt-6 space-y-3">
                      {[
                        { label: 'Beginner–Grade 2', color: 'bg-emerald-500', border: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                        { label: 'Grade 3–5',        color: 'bg-blue-500',    border: 'bg-blue-50 text-blue-700 border-blue-200' },
                        { label: 'Grade 6–8',        color: 'bg-violet-500',  border: 'bg-violet-50 text-violet-700 border-violet-200' },
                        { label: 'Unassigned',       color: 'bg-gray-300',    border: 'bg-gray-50 text-gray-500 border-gray-200' },
                      ].map(g => {
                        const count = byGrade[g.label] || 0
                        const total = Object.values(byGrade).reduce((a:number,b:any)=>a+b,0)
                        const pct = total > 0 ? Math.round((count / total) * 100) : 0
                        if (!count) return null
                        return (
                          <div key={g.label}>
                            <div className="flex items-center justify-between text-sm mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className={clsx('w-3 h-3 rounded-full', g.color)}/>
                                <span className="font-medium text-gray-800">{g.label}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-gray-400 text-xs">{pct}%</span>
                                <span className="font-semibold text-gray-900">{count}</span>
                              </div>
                            </div>
                            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={clsx('h-full rounded-full', g.color)} style={{ width: `${pct}%` }}/>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )
              }
            </div>
          )}

          {activeReport === 'students_inactive' && (
            <InactiveStudentsReport students={students} subjects={subjects} exportCSV={exportCSV} reload={reload}/>
          )}

          {activeReport === 'students_instrument' && (
            <StudentsByInstrumentReport
              subjects={subjects}
              students={students}
              studentsBySubject={studentsBySubject}
              exportCSV={exportCSV}
              BarChart={BarChart}
              reload={reload}
            />
          )}

          {activeReport === 'students_payment' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Students by Payment Status</h2>
                <button onClick={() => exportCSV(
                  students.map((s: any) => {
                    const sp = payments.filter((p: any) => p.student_id === s.id || p.student_id_ext === s.student_id_ext)
                    const lastPaid = sp.filter((p: any) => p.status === 'paid').sort((a: any, b: any) => b.payment_date?.localeCompare(a.payment_date))[0]
                    return { Name: s.full_name, Email: s.email||'', Phone: s.phone||'', Status: s.status||'Active', TotalPaid: sp.filter((p:any)=>p.status==='paid').reduce((a:number,p:any)=>a+p.amount,0), LastPayment: lastPaid?.payment_date||'Never' }
                  }), 'students_payment.csv'
                )} className="btn btn-sm"><Download className="w-3 h-3"/> Export</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr><th className="th">Student</th><th className="th">Status</th><th className="th text-right">Total Paid</th><th className="th">Last Payment</th><th className="th">Subjects</th></tr></thead>
                  <tbody>
                    {students.map((s: any) => {
                      const sp = payments.filter((p: any) => p.student_id === s.id)
                      const total = sp.filter((p: any) => p.status === 'paid').reduce((a: number, p: any) => a + p.amount, 0)
                      const lastPaid = sp.filter((p: any) => p.status === 'paid').sort((a: any, b: any) => (b.payment_date || '').localeCompare(a.payment_date || ''))[0]
                      const subs = subjects.filter((sub: any) => (s.student_subjects || []).some((ss: any) => ss.subject_id === sub.id))
                      return (
                        <tr key={s.id} className="hover:bg-gray-50/50">
                          <td className="td"><div className="font-medium">{s.full_name}</div><div className="text-xs text-gray-400">{s.email}</div></td>
                          <td className="td"><span className={clsx('badge', s.status==='Active'?'bg-emerald-50 text-emerald-700':'bg-gray-100 text-gray-500')}>{s.status||'Active'}</span></td>
                          <td className="td text-right font-semibold text-emerald-700">{fmt(total)}</td>
                          <td className="td text-gray-400">{lastPaid?.payment_date || 'Never'}</td>
                          <td className="td"><div className="flex flex-wrap gap-0.5">{subs.map((sub: any) => <span key={sub.id} className={clsx('badge text-xs', colorBadge[sub.color]||colorBadge.violet)}>{sub.code}</span>)}</div></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeReport === 'payment_monthly' && (
            <MonthlyBreakdownReport
              paidPayments={paidPayments}
              last12Months={last12Months}
              monthlyCollection={monthlyCollection}
              totalYTD={totalYTD}
              totalMTD={totalMTD}
              fyLabel={fyLabel}
              exportCSV={exportCSV}
              MonthChart={MonthChart}
            />
          )}

          {activeReport === 'payment_ytd' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Year to Date — {fyLabel}</h2>
                <button onClick={() => exportCSV(Object.entries(ytdByMonth).map(([Month,Amount]) => ({Month,Amount})), `ytd_${fyStartYear}-${fyStartYear+1}.csv`)} className="btn btn-sm"><Download className="w-3 h-3"/> Export</button>
              </div>
              <div className="grid grid-cols-4 gap-4 mb-5">
                <div className="bg-emerald-50 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-emerald-700">{fmt(totalYTD)}</div><div className="text-xs text-emerald-600 mt-1">Total Collected {fyLabel}</div></div>
                <div className="bg-amber-50 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-amber-700">{fmt(totalMTD)}</div><div className="text-xs text-amber-600 mt-1">Month to Date</div></div>
                <div className="bg-blue-50 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-blue-700">{ytdPayments.length}</div><div className="text-xs text-blue-600 mt-1">Transactions</div></div>
                <div className="bg-violet-50 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-violet-700">{fmt(Math.round(totalYTD / (fyMonthsToDate.length||1)))}</div><div className="text-xs text-violet-600 mt-1">Avg per Month</div></div>
              </div>
              <MonthChart
                data={ytdByMonth}
                months={fyMonthsToDate}
              />
            </div>
          )}

          {activeReport === 'payment_mode' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Collection by Payment Mode</h2>
                <button onClick={() => exportCSV(Object.entries(byMode).map(([Mode,Amount]) => ({Mode,Amount})), 'payment_by_mode.csv')} className="btn btn-sm"><Download className="w-3 h-3"/> Export</button>
              </div>
              <BarChart data={byMode} />
              <div className="grid grid-cols-2 gap-3 mt-4">
                {Object.entries(byMode).sort(([,a],[,b]) => b-a).map(([mode, amount], i) => {
                  const pct = Math.round((amount / totalEver) * 100)
                  return (
                    <div key={mode} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex justify-between items-center mb-1"><span className="text-sm font-medium text-gray-700">{mode}</span><span className="text-xs text-gray-400">{pct}%</span></div>
                      <div className="text-lg font-bold" style={{color: BAR_COLORS[i % BAR_COLORS.length]}}>{fmt(amount)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeReport === 'payment_subject' && (
            <RevenueBySubjectReport
              bySubjectYTD={bySubjectYTD}
              bySubjectMTD={bySubjectMTD}
              fyLabel={fyLabel}
              exportCSV={exportCSV}
              BarChart={BarChart}
            />
          )}

          {activeReport === 'attendance_report' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Attendance Summary</h2>
              </div>
              {attendance.length === 0
                ? <div className="text-center py-10 text-gray-300">No attendance data yet. Mark attendance from the Attendance tab.</div>
                : (
                  <>
                    <div className="grid grid-cols-4 gap-3 mb-5">
                      {[
                        { label:'Present', val:attPresent, color:'bg-emerald-50 text-emerald-700' },
                        { label:'Absent (notified)', val:attAbsent, color:'bg-amber-50 text-amber-700' },
                        { label:'Absent Billable', val:attBillable, color:'bg-red-50 text-red-700' },
                        { label:'Attendance Rate', val:`${Math.round(attPresent/(attPresent+attAbsent+attBillable||1)*100)}%`, color:'bg-blue-50 text-blue-700' },
                      ].map(m => (
                        <div key={m.label} className={clsx('rounded-xl p-3 text-center', m.color)}>
                          <div className="text-xl font-bold">{m.val}</div>
                          <div className="text-xs opacity-70 mt-0.5">{m.label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr><th className="th">Date</th><th className="th">Student</th><th className="th">Class</th><th className="th">Status</th></tr></thead>
                        <tbody>
                          {attendance.filter((a: any) => a.type === 'student').slice(0, 50).map((a: any) => (
                            <tr key={a.id} className="hover:bg-gray-50/50">
                              <td className="td">{a.class_date}</td>
                              <td className="td font-medium">{a.students?.full_name || '—'}</td>
                              <td className="td text-gray-500">{(a.class_schedules as any)?.subjects?.name || '—'}</td>
                              <td className="td">
                                <span className={clsx('badge',
                                  a.status==='present'?'bg-emerald-50 text-emerald-700':
                                  a.status==='absent_billable'?'bg-red-50 text-red-700':
                                  a.status==='late'?'bg-amber-50 text-amber-700':
                                  'bg-gray-100 text-gray-600'
                                )}>
                                  {a.status==='absent_billable'?'Absent (billable)':a.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              }
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MONTHLY BREAKDOWN REPORT — click month to see student list
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// INACTIVE STUDENTS — status change + re-join email reminder
// ══════════════════════════════════════════════════════════════
function InactiveStudentsReport({ students, subjects, exportCSV, reload }: any) {
  const supabase = sb()
  const inactiveStudents = students.filter((s: any) => s.status === 'Inactive')
  const [sending, setSending] = useState<Record<string, boolean>>({})
  const [sentIds, setSentIds] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<string[]>([])
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkResult, setBulkResult] = useState('')
  const [customMessage, setCustomMessage] = useState('')

  async function changeStatus(studentId: string, newStatus: string) {
    await supabase.from('students').update({ status: newStatus }).eq('id', studentId)
    reload()
  }

  async function sendRejoinEmail(student: any) {
    if (!student.email) return
    setSending(s => ({ ...s, [student.id]: true }))
    const r = await fetch('/api/email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'rejoin_reminder', studentEmail: student.email, studentName: student.full_name, customMessage }),
    })
    setSending(s => ({ ...s, [student.id]: false }))
    if (r.ok) setSentIds(s => ({ ...s, [student.id]: true }))
  }

  async function sendBulkRejoin() {
    const targets = selected.length ? inactiveStudents.filter((s: any) => selected.includes(s.id)) : inactiveStudents
    const withEmail = targets.filter((s: any) => s.email)
    if (!withEmail.length) { setBulkResult('No selected students have an email on file'); return }
    setBulkSending(true); setBulkResult('')
    let sent = 0, failed = 0
    for (const s of withEmail) {
      const r = await fetch('/api/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'rejoin_reminder', studentEmail: s.email, studentName: s.full_name, customMessage }),
      })
      if (r.ok) { sent++; setSentIds(prev => ({ ...prev, [s.id]: true })) } else failed++
    }
    setBulkSending(false)
    setBulkResult(`✓ Sent to ${sent} student${sent !== 1 ? 's' : ''}${failed ? ` · ${failed} failed` : ''}`)
  }

  function toggleSelect(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  function exportList() {
    exportCSV(inactiveStudents.map((s: any) => ({
      Name: s.full_name, Email: s.email || '', Phone: s.phone || '', JoinedDate: s.joined_date || '',
    })), 'inactive_students.csv')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Inactive Students ({inactiveStudents.length})</h2>
        <button onClick={exportList} className="btn btn-sm"><Download className="w-3 h-3"/> Export</button>
      </div>

      {inactiveStudents.length === 0 ? (
        <div className="text-center py-10 text-gray-300">No inactive students — everyone's active! 🎉</div>
      ) : (
        <>
          {/* Bulk action bar */}
          <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
            <div>
              <label className="label">Re-join reminder message (optional)</label>
              <textarea
                className="input min-h-[56px] resize-none"
                placeholder="e.g. We've added new evening slots — come back and continue learning!"
                value={customMessage}
                onChange={e => setCustomMessage(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-400">
                {selected.length > 0 ? `${selected.length} selected` : `All ${inactiveStudents.filter((s: any) => s.email).length} with email will be emailed`}
              </div>
              <button onClick={sendBulkRejoin} disabled={bulkSending} className="btn-primary">
                {bulkSending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Mail className="w-4 h-4"/>}
                {bulkSending ? 'Sending…' : selected.length ? `Email ${selected.length} Selected` : 'Email All Inactive'}
              </button>
            </div>
            {bulkResult && <div className="text-xs text-emerald-600 font-medium">{bulkResult}</div>}
          </div>

          {/* Student list */}
          <div className="space-y-2">
            {inactiveStudents.map((s: any, i: number) => {
              const subs = subjects.filter((sub: any) => (s.student_subjects || []).some((ss: any) => ss.subject_id === sub.id))
              return (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-gray-200">
                  <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleSelect(s.id)} className="rounded border-gray-300 flex-shrink-0"/>
                  <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0', ac(i))}>{ini(s.full_name)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{s.full_name}</div>
                    <div className="text-xs text-gray-400 truncate">{s.email || 'No email on file'}{s.phone ? ` · ${s.phone}` : ''}</div>
                    {subs.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{subs.map((sub: any) => <span key={sub.id} className={clsx('badge text-xs', colorBadge[sub.color] || colorBadge.violet)}>{sub.code}</span>)}</div>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={s.status || 'Active'}
                      onChange={e => changeStatus(s.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 cursor-pointer hover:border-gray-300"
                    >
                      {STUDENT_STATUSES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                    </select>
                    <button
                      onClick={() => sendRejoinEmail(s)}
                      disabled={!s.email || sending[s.id]}
                      title={!s.email ? 'No email on file' : 'Send re-join reminder'}
                      className={clsx('btn btn-sm', sentIds[s.id] ? 'text-emerald-600 border-emerald-200 bg-emerald-50' : 'text-brand-600 border-brand-200 hover:bg-brand-50')}
                    >
                      {sending[s.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : sentIds[s.id] ? <CheckCircle className="w-3.5 h-3.5"/> : <Mail className="w-3.5 h-3.5"/>}
                      {sentIds[s.id] ? 'Sent' : 'Remind'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}


function StudentsByInstrumentReport({ subjects, students, studentsBySubject, exportCSV, BarChart, reload }: any) {
  const supabase = sb()
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const [sending, setSending] = useState<Record<string, boolean>>({})
  const [sentIds, setSentIds] = useState<Record<string, boolean>>({})

  async function changeStatus(studentId: string, newStatus: string) {
    await supabase.from('students').update({ status: newStatus }).eq('id', studentId)
    reload()
  }

  async function sendRejoinEmail(student: any) {
    if (!student.email) return
    setSending(s => ({ ...s, [student.id]: true }))
    const r = await fetch('/api/email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'rejoin_reminder', studentEmail: student.email, studentName: student.full_name }),
    })
    setSending(s => ({ ...s, [student.id]: false }))
    if (r.ok) setSentIds(s => ({ ...s, [student.id]: true }))
  }

  const subjectObj = selectedSubject ? subjects.find((s: any) => s.name === selectedSubject) : null
  const subjectStudents = subjectObj
    ? students.filter((s: any) => (s.student_subjects || []).some((ss: any) => ss.subject_id === subjectObj.id))
    : []

  const statusBreakdown = STUDENT_STATUSES.map(st => ({
    ...st,
    count: subjectStudents.filter((s: any) => (s.status || 'Active') === st.value).length,
  })).filter(st => st.count > 0)

  function exportSubject() {
    if (!selectedSubject) return
    const rows = subjectStudents.map((s: any) => ({
      Name: s.full_name, Status: s.status || 'Active', Email: s.email || '', Phone: s.phone || '',
    }))
    exportCSV(rows, `${selectedSubject}_students.csv`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Students by Instrument — click a bar to see breakdown by status</h2>
        <div className="flex gap-2">
          {selectedSubject && <button onClick={exportSubject} className="btn btn-sm"><Download className="w-3 h-3"/> Export {selectedSubject}</button>}
          <button onClick={() => exportCSV(Object.entries(studentsBySubject).map(([Subject,Count]) => ({Subject,Count})), 'students_by_instrument.csv')} className="btn btn-sm"><Download className="w-3 h-3"/> Export All</button>
        </div>
      </div>

      {/* Clickable bars */}
      <div className="space-y-2.5">
        {Object.entries(studentsBySubject).sort(([,a]: any,[,b]: any) => b-a).map(([label, value]: any, i: number) => {
          const max = Math.max(...Object.values(studentsBySubject) as number[], 1)
          const isSelected = selectedSubject === label
          return (
            <div key={label} className="cursor-pointer group" onClick={() => setSelectedSubject(isSelected ? null : label)}>
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span className={clsx('truncate max-w-[180px] font-medium', isSelected && 'text-brand-600')}>{label}{isSelected && ' ▼'}</span>
                <span className="font-semibold ml-2">{value}</span>
              </div>
              <div className="h-6 bg-gray-100 rounded-full overflow-hidden group-hover:opacity-80 transition-opacity">
                <div
                  className={clsx('h-full rounded-full transition-all duration-500', isSelected ? 'bg-brand-500' : '')}
                  style={{ width: `${(value / max) * 100}%`, background: isSelected ? undefined : '#7B5FC4' }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Status drilldown for selected subject */}
      {selectedSubject && (
        <div className="mt-6 pt-5 border-t border-gray-100 animate-fu">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">{selectedSubject} — {subjectStudents.length} students by status</h3>
            <button onClick={() => setSelectedSubject(null)} className="text-xs text-gray-400 hover:text-gray-600">✕ Close</button>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-4">
            {statusBreakdown.map(st => (
              <div key={st.value} className={clsx('rounded-xl p-3 border text-center', st.color)}>
                <div className="text-xl font-bold">{st.count}</div>
                <div className="text-xs mt-0.5 opacity-75">{st.label}</div>
              </div>
            ))}
            {!statusBreakdown.length && <div className="col-span-4 text-center text-gray-300 py-4 text-sm">No students found</div>}
          </div>

          {/* Student list grouped by status */}
          <div className="space-y-4">
            {statusBreakdown.map(st => (
              <div key={st.value}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={clsx('w-2 h-2 rounded-full', st.dot)}/>
                  <span className="text-xs font-semibold text-gray-500">{st.label} ({st.count})</span>
                </div>
                <div className="space-y-1.5">
                  {subjectStudents.filter((s: any) => (s.status || 'Active') === st.value).map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-800 truncate">{s.full_name}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <select
                          value={s.status || 'Active'}
                          onChange={e => changeStatus(s.id, e.target.value)}
                          className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white text-gray-600 cursor-pointer hover:border-gray-300"
                        >
                          {STUDENT_STATUSES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                        {st.value === 'Inactive' && (
                          <button
                            onClick={() => sendRejoinEmail(s)}
                            disabled={!s.email || sending[s.id]}
                            title={!s.email ? 'No email on file' : 'Send re-join reminder'}
                            className={clsx('btn btn-sm', sentIds[s.id] ? 'text-emerald-600 border-emerald-200 bg-emerald-50' : 'text-brand-600 border-brand-200 hover:bg-brand-50')}
                          >
                            {sending[s.id] ? <Loader2 className="w-3 h-3 animate-spin"/> : sentIds[s.id] ? <CheckCircle className="w-3 h-3"/> : <Mail className="w-3 h-3"/>}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// REVENUE BY SUBJECT — YTD / MTD toggle
// ══════════════════════════════════════════════════════════════
function RevenueBySubjectReport({ bySubjectYTD, bySubjectMTD, fyLabel, exportCSV, BarChart }: any) {
  const [period, setPeriod] = useState<'ytd' | 'mtd'>('ytd')
  const data = period === 'ytd' ? bySubjectYTD : bySubjectMTD
  const total: number = Object.values(data).reduce((a: number, v: any) => a + v, 0) as number

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Revenue by Subject</h2>
        <button onClick={() => exportCSV(Object.entries(data).map(([Subject,Amount]) => ({Subject,Amount})), `revenue_by_subject_${period}.csv`)} className="btn btn-sm"><Download className="w-3 h-3"/> Export</button>
      </div>

      {/* Period toggle */}
      <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit mb-5">
        <button onClick={() => setPeriod('mtd')}
          className={clsx('px-4 py-2 text-sm font-medium transition-colors', period==='mtd' ? 'bg-amber-500 text-white' : 'text-gray-500 hover:bg-gray-50')}>
          Month to Date
        </button>
        <button onClick={() => setPeriod('ytd')}
          className={clsx('px-4 py-2 text-sm font-medium transition-colors', period==='ytd' ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:bg-gray-50')}>
          {fyLabel} (YTD)
        </button>
      </div>

      <div className={clsx('rounded-xl p-4 mb-5 border', period==='ytd' ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100')}>
        <div className={clsx('text-xs font-semibold uppercase tracking-wide', period==='ytd' ? 'text-emerald-600' : 'text-amber-600')}>
          Total {period==='ytd' ? fyLabel : 'This Month'}
        </div>
        <div className={clsx('text-2xl font-bold mt-1', period==='ytd' ? 'text-emerald-700' : 'text-amber-700')}>{fmt(total)}</div>
      </div>

      {Object.keys(data).length === 0
        ? <div className="text-center py-10 text-gray-300">No revenue recorded for this period</div>
        : <BarChart data={data} />
      }
    </div>
  )
}


function MonthlyBreakdownReport({ paidPayments, last12Months, monthlyCollection, totalYTD, totalMTD, fyLabel, exportCSV, MonthChart }: any) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

  const monthStudents = selectedMonth
    ? paidPayments.filter((p: any) => p.payment_date?.startsWith(selectedMonth))
    : []

  // Group by student name for the selected month
  const byStudent: Record<string, { name: string; email: string; payments: any[] }> = {}
  monthStudents.forEach((p: any) => {
    const name = p.students?.full_name || p.student_name || 'Unknown'
    if (!byStudent[name]) byStudent[name] = { name, email: p.students?.email || p.student_email || '', payments: [] }
    byStudent[name].payments.push(p)
  })
  const studentList = Object.values(byStudent).sort((a, b) => a.name.localeCompare(b.name))
  const monthTotal = monthStudents.reduce((a: number, p: any) => a + p.amount, 0)

  function exportMonth() {
    if (!selectedMonth) return
    const rows = monthStudents.map((p: any) => ({
      Student: p.students?.full_name || p.student_name || '',
      Email: p.students?.email || p.student_email || '',
      Subject: p.subjects?.name || '',
      Amount: p.amount,
      Discount: p.discount || 0,
      Mode: p.mode_of_payment || '',
      Invoice: p.invoice_number || '',
      Date: p.payment_date || '',
    }))
    exportCSV(rows, `payments_${selectedMonth}.csv`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Monthly Collection — click a month to see students</h2>
        <div className="flex gap-2">
          {selectedMonth && (
            <button onClick={exportMonth} className="btn btn-sm"><Download className="w-3 h-3"/> Export {selectedMonth}</button>
          )}
          <button onClick={() => exportCSV(last12Months.map((m: string) => ({ Month: m, Amount: monthlyCollection[m]||0 })), 'monthly_collection.csv')} className="btn btn-sm"><Download className="w-3 h-3"/> Export All</button>
        </div>
      </div>

      {/* YTD / MTD summary */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <div className="text-xs text-amber-600 font-semibold uppercase tracking-wide">Month to Date</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{fmt(totalMTD)}</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <div className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">{fyLabel} (Year to Date)</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{fmt(totalYTD)}</div>
        </div>
      </div>

      {/* Bar chart — clickable bars */}
      <div className="mb-5">
        <div className="flex items-end gap-1.5 h-40 mb-2">
          {last12Months.map((m: string, i: number) => {
            const val = monthlyCollection[m] || 0
            const max = Math.max(...last12Months.map((x: string) => monthlyCollection[x] || 0), 1)
            const pct = (val / max) * 100
            const label = new Date(m + '-01').toLocaleString('en-IN', { month: 'short' })
            const isSelected = selectedMonth === m
            const BAR_COLORS = ['#3B1F8C','#7B5FC4','#A98CE8','#4A2FA0','#6B55C8','#8F7ED5','#C8B5F5','#D8D1F0']
            return (
              <div key={m} className="flex-1 flex flex-col items-center gap-1 cursor-pointer group" onClick={() => setSelectedMonth(isSelected ? null : m)}>
                <div className="w-full relative flex items-end" style={{ height: '120px' }}>
                  <div
                    className="w-full rounded-t-md transition-all duration-200"
                    style={{
                      height: `${pct}%`, minHeight: val > 0 ? 4 : 0,
                      background: isSelected ? '#F0C040' : BAR_COLORS[i % BAR_COLORS.length],
                      boxShadow: isSelected ? '0 0 0 2px #F0C040, 0 0 0 4px rgba(240,192,64,0.3)' : undefined,
                    }}
                    title={`${label}: ${val.toLocaleString('en-IN', {style:'currency',currency:'INR'})}`}
                  />
                </div>
                <div className={clsx('text-xs', isSelected ? 'text-amber-600 font-semibold' : 'text-gray-400 group-hover:text-gray-600')}>{label}</div>
              </div>
            )
          })}
        </div>
        <div className="text-xs text-gray-400 text-center">Click a bar to drill down into student payments</div>
      </div>

      {/* Month summary table with clickable rows */}
      {!selectedMonth && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr>
              <th className="th">Month</th>
              <th className="th text-right">Collected</th>
              <th className="th text-right">Transactions</th>
              <th className="th text-right">Students</th>
              <th className="th w-24"></th>
            </tr></thead>
            <tbody>
              {last12Months.slice().reverse().map((m: string) => {
                const monthPmts = paidPayments.filter((p: any) => p.payment_date?.startsWith(m))
                const uniqueStudents = new Set(monthPmts.map((p: any) => p.students?.full_name || p.student_name)).size
                return (
                  <tr key={m} className="hover:bg-brand-50/50 cursor-pointer" onClick={() => setSelectedMonth(m)}>
                    <td className="td font-medium">{new Date(m+'-01').toLocaleString('en-IN',{month:'long',year:'numeric'})}</td>
                    <td className="td text-right font-semibold text-emerald-700">{fmt(monthlyCollection[m]||0)}</td>
                    <td className="td text-right text-gray-400">{monthPmts.length}</td>
                    <td className="td text-right text-gray-400">{uniqueStudents}</td>
                    <td className="td text-right"><span className="text-xs text-brand-500">View →</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Drilled-down student list for selected month */}
      {selectedMonth && (
        <div className="animate-fu">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-gray-900">
                {new Date(selectedMonth+'-01').toLocaleString('en-IN',{month:'long',year:'numeric'})}
              </h3>
              <div className="text-xs text-gray-400 mt-0.5">{studentList.length} students · {monthStudents.length} payments · Total: {fmt(monthTotal)}</div>
            </div>
            <button onClick={() => setSelectedMonth(null)} className="btn btn-sm">
              <X className="w-3 h-3"/> All Months
            </button>
          </div>

          <div className="space-y-2">
            {studentList.map((stu, i) => {
              const stuTotal = stu.payments.reduce((a: number, p: any) => a + p.amount, 0)
              const stuDisc  = stu.payments.reduce((a: number, p: any) => a + (p.discount || 0), 0)
              return (
                <div key={stu.name} className="card p-0 overflow-hidden">
                  {/* Student header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50/60 border-b border-gray-100">
                    <div className="flex items-center gap-2.5">
                      <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold', ac(i))}>
                        {ini(stu.name)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{stu.name}</div>
                        {stu.email && <div className="text-xs text-gray-400">{stu.email}</div>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-emerald-700">{fmt(stuTotal)}</div>
                      {stuDisc > 0 && <div className="text-xs text-blue-600">-{fmt(stuDisc)} disc</div>}
                    </div>
                  </div>

                  {/* Payment rows */}
                  {stu.payments.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/40">
                      <div className="flex items-center gap-3">
                        {p.subjects && (
                          <span className={clsx('badge text-xs', colorBadge[p.subjects.color] || colorBadge.violet)}>
                            {p.subjects.name}
                          </span>
                        )}
                        <div className="text-xs text-gray-400">
                          {p.payment_date}
                          {p.invoice_number && ` · Inv #${p.invoice_number}`}
                          {p.mode_of_payment && ` · ${p.mode_of_payment}`}
                          {p.recorded_by && ` · ${p.recorded_by}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {p.discount > 0 && <span className="text-xs text-blue-500">-{fmt(p.discount)}</span>}
                        <span className="text-sm font-semibold">{fmt(p.amount)}</span>
                        <span className={clsx('badge text-xs',
                          p.status==='paid'?'bg-emerald-50 text-emerald-700':
                          p.status==='failed'?'bg-red-50 text-red-400':'bg-amber-50 text-amber-700'
                        )}>{p.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {/* Month totals footer */}
          <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div><div className="text-lg font-bold text-emerald-700">{fmt(monthTotal)}</div><div className="text-xs text-gray-400">Total Collected</div></div>
              <div><div className="text-lg font-bold text-gray-700">{studentList.length}</div><div className="text-xs text-gray-400">Students</div></div>
              <div><div className="text-lg font-bold text-blue-600">{fmt(monthStudents.reduce((a: number, p: any) => a + (p.discount||0), 0))}</div><div className="text-xs text-gray-400">Total Discounts</div></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ATTENDANCE TAB
// ══════════════════════════════════════════════════════════════
const ATT_STATUS = ['present','absent','absent_billable','late'] as const
type AttStatus = typeof ATT_STATUS[number]
const attLabel: Record<AttStatus,string> = { present:'Present', absent:'Absent (notified)', absent_billable:'Absent Billable', late:'Late' }
const attColor: Record<AttStatus,string> = { present:'bg-emerald-50 text-emerald-700 border-emerald-200', absent:'bg-amber-50 text-amber-700 border-amber-200', absent_billable:'bg-red-50 text-red-700 border-red-200', late:'bg-blue-50 text-blue-700 border-blue-200' }
const attBtnColor: Record<AttStatus,string> = { present:'bg-emerald-500 text-white border-emerald-500', absent:'bg-amber-500 text-white border-amber-500', absent_billable:'bg-red-500 text-white border-red-500', late:'bg-blue-500 text-white border-blue-500' }

function AttendanceTab({ schedules, subjects, students, profiles, profile, attendance, reload }: any) {
  const supabase = sb()
  const isTeacher = profile.role === 'teacher'
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedClass, setSelectedClass] = useState<any>(null)
  const [marking, setMarking] = useState(false)
  const [viewMode, setViewMode] = useState<'mark'|'history'>('mark')

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const selectedDay = days[new Date(selectedDate + 'T00:00:00').getDay()]

  // Classes for selected day
  const dayClasses = schedules.filter((sc: any) => {
    if (sc.day_of_week !== selectedDay) return false
    if (isTeacher) {
      const sub = subjects.find((s: any) => s.id === sc.subject_id)
      return sub?.teacher_id === profile.id
    }
    return true
  })

  // Get attendance for selected class + date
  const classAttendance = attendance.filter((a: any) =>
    a.schedule_id === selectedClass?.id && a.class_date === selectedDate
  )

  const getStudentAtt = (studentId: string) =>
    classAttendance.find((a: any) => a.student_id === studentId && a.type === 'student')

  const getTeacherAtt = () =>
    classAttendance.find((a: any) => a.type === 'teacher')

  async function markAttendance(type: 'student' | 'teacher', entityId: string, status: AttStatus, notes?: string) {
    if (!selectedClass) return
    setMarking(true)

    const payload: any = {
      schedule_id: selectedClass.id,
      class_date: selectedDate,
      type,
      status,
      marked_by: profile.id,
      notes: notes || null,
    }
    if (type === 'student') payload.student_id = entityId
    else payload.teacher_id = entityId

    // Upsert
    const existing = type === 'student'
      ? classAttendance.find((a: any) => a.student_id === entityId && a.type === 'student')
      : classAttendance.find((a: any) => a.type === 'teacher')

    if (existing) {
      await supabase.from('attendance').update({ status, notes: notes || null, informed_at: status === 'absent' ? new Date().toISOString() : null }).eq('id', existing.id)
    } else {
      if (status === 'absent') payload.informed_at = new Date().toISOString()
      await supabase.from('attendance').insert(payload)
    }
    setMarking(false)
    reload()
  }

  async function markAllPresent() {
    if (!selectedClass) return
    const classStudents = (selectedClass.schedule_students || []).map((ss: any) => ss.student_id)
    for (const sid of classStudents) {
      const existing = classAttendance.find((a: any) => a.student_id === sid && a.type === 'student')
      if (!existing) {
        await supabase.from('attendance').insert({ schedule_id: selectedClass.id, class_date: selectedDate, type: 'student', student_id: sid, status: 'present', marked_by: profile.id })
      }
    }
    reload()
  }

  const classSubject = selectedClass ? subjects.find((s: any) => s.id === selectedClass.subject_id) : null
  const classStudentIds = (selectedClass?.schedule_students || []).map((ss: any) => ss.student_id)
  const classStudents = students.filter((s: any) => classStudentIds.includes(s.id))
  const classTeacherId = classSubject?.teacher_id
  const classTeacher = profiles.find((p: any) => p.id === classTeacherId)

  // History view
  const recentAtt = attendance
    .filter((a: any) => a.type === 'student')
    .slice(0, 100)

  return (
    <div className="animate-fu">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-400 mt-0.5">Mark and track student & teacher attendance</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setViewMode('mark')} className={clsx('btn', viewMode==='mark'&&'btn-primary')}>Mark Attendance</button>
          <button onClick={() => setViewMode('history')} className={clsx('btn', viewMode==='history'&&'btn-primary')}>History</button>
        </div>
      </div>

      {viewMode === 'mark' && (
        <div className="grid grid-cols-3 gap-5">
          {/* Left: date + class picker */}
          <div className="space-y-4">
            <div className="card p-4">
              <label className="label">Select Date</label>
              <input
                type="date"
                className="input"
                value={selectedDate}
                onChange={e => { setSelectedDate(e.target.value); setSelectedClass(null) }}
              />
              <div className="mt-2 text-xs text-gray-400">{selectedDay} classes: <strong>{dayClasses.length}</strong></div>
            </div>

            <div className="card p-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Classes on {selectedDay}</div>
              {dayClasses.length === 0
                ? <div className="text-sm text-gray-300 py-4 text-center">No classes on {selectedDay}</div>
                : dayClasses.map((cls: any) => {
                    const sub = subjects.find((s: any) => s.id === cls.subject_id)
                    const stuCount = (cls.schedule_students || []).length
                    const markedCount = attendance.filter((a: any) => a.schedule_id === cls.id && a.class_date === selectedDate && a.type === 'student').length
                    const isSelected = selectedClass?.id === cls.id
                    return (
                      <button
                        key={cls.id}
                        onClick={() => setSelectedClass(cls)}
                        className={clsx('w-full text-left p-3 rounded-xl border mb-2 transition-all',
                          isSelected ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-gray-200 bg-white'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={clsx('badge text-xs mb-1', sub ? (colorBadge[sub.color]||colorBadge.violet) : 'bg-gray-100 text-gray-600')}>{sub?.name||'Unknown'}</div>
                            <div className="text-xs text-gray-500 font-mono">{cls.start_time?.slice(0,5)} · {cls.duration_minutes}m</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold text-gray-700">{markedCount}/{stuCount}</div>
                            <div className="text-xs text-gray-400">marked</div>
                          </div>
                        </div>
                      </button>
                    )
                  })
              }
            </div>
          </div>

          {/* Right: attendance marking */}
          <div className="col-span-2">
            {!selectedClass
              ? (
                <div className="card p-12 text-center">
                  <CheckCircle className="w-12 h-12 text-gray-200 mx-auto mb-3"/>
                  <p className="text-gray-400">Select a class on the left to mark attendance</p>
                </div>
              )
              : (
                <div className="card">
                  {/* Class header */}
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{classSubject?.name} — {selectedDate}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{selectedClass.start_time?.slice(0,5)} · {selectedClass.duration_minutes} min · {classStudents.length} students</div>
                    </div>
                    <button onClick={markAllPresent} className="btn btn-sm bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                      <CheckCircle className="w-3.5 h-3.5"/> Mark All Present
                    </button>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Teacher attendance */}
                    {classTeacher && (
                      <div>
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Teacher</div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-2">
                            <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold', ac(1))}>{ini(classTeacher.full_name)}</div>
                            <span className="text-sm font-medium text-gray-800">{classTeacher.full_name}</span>
                          </div>
                          <div className="flex gap-1.5">
                            {(['present','absent','late'] as AttStatus[]).map(s => {
                              const tAtt = getTeacherAtt()
                              const isActive = tAtt?.status === s
                              return (
                                <button
                                  key={s}
                                  onClick={() => markAttendance('teacher', classTeacherId, s)}
                                  disabled={marking}
                                  className={clsx('px-2.5 py-1 rounded-lg border text-xs font-medium transition-all',
                                    isActive ? attBtnColor[s] : 'border-gray-200 text-gray-400 hover:border-gray-300 bg-white'
                                  )}
                                >
                                  {s === 'present' ? '✓' : s === 'absent' ? 'Absent' : 'Late'}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Student attendance */}
                    <div>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Students ({classStudents.length})</div>
                      {classStudents.length === 0
                        ? <div className="text-sm text-gray-300 py-4 text-center">No students assigned to this class</div>
                        : <div className="space-y-2">
                            {classStudents.map((stu: any, i: number) => {
                              const att = getStudentAtt(stu.id)
                              return (
                                <div key={stu.id} className={clsx('flex items-center justify-between p-3 rounded-xl border transition-all',
                                  att ? (attColor[att.status as AttStatus] || 'border-gray-100 bg-white') : 'border-gray-100 bg-white'
                                )}>
                                  <div className="flex items-center gap-2.5">
                                    <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold', ac(i))}>{ini(stu.full_name)}</div>
                                    <div>
                                      <div className="text-sm font-medium text-gray-800">{stu.full_name}</div>
                                      {att && <div className="text-xs text-gray-400">{attLabel[att.status as AttStatus]}{att.informed_at ? ` · informed ${new Date(att.informed_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}` : ''}</div>}
                                    </div>
                                  </div>
                                  <div className="flex gap-1">
                                    {ATT_STATUS.map(s => {
                                      const isActive = att?.status === s
                                      return (
                                        <button
                                          key={s}
                                          onClick={() => markAttendance('student', stu.id, s)}
                                          disabled={marking}
                                          title={attLabel[s]}
                                          className={clsx('w-8 h-8 rounded-lg border text-xs font-bold transition-all flex items-center justify-center',
                                            isActive ? attBtnColor[s] : 'border-gray-200 text-gray-300 hover:border-gray-400 hover:text-gray-500 bg-white'
                                          )}
                                        >
                                          {s==='present'?'✓':s==='absent'?'A':s==='absent_billable'?'B':'L'}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                      }
                    </div>

                    {/* Legend */}
                    <div className="flex gap-3 pt-2 border-t border-gray-100">
                      {ATT_STATUS.map(s => (
                        <div key={s} className="flex items-center gap-1.5 text-xs text-gray-500">
                          <div className={clsx('w-5 h-5 rounded flex items-center justify-center text-xs font-bold border', attBtnColor[s])}>
                            {s==='present'?'✓':s==='absent'?'A':s==='absent_billable'?'B':'L'}
                          </div>
                          {attLabel[s]}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            }
          </div>
        </div>
      )}

      {viewMode === 'history' && (
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Recent Attendance (last 100 records)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="th">Date</th>
                <th className="th">Student</th>
                <th className="th">Class</th>
                <th className="th">Status</th>
                <th className="th">Informed At</th>
                <th className="th">Notes</th>
              </tr></thead>
              <tbody>
                {recentAtt.map((a: any) => (
                  <tr key={a.id} className="hover:bg-gray-50/50">
                    <td className="td text-gray-500">{a.class_date}</td>
                    <td className="td font-medium">{a.students?.full_name || '—'}</td>
                    <td className="td text-gray-500">{(a.class_schedules as any)?.subjects?.name || '—'}</td>
                    <td className="td">
                      <span className={clsx('badge', attColor[a.status as AttStatus]?.split(' ').slice(0,2).join(' ') || 'bg-gray-100 text-gray-600')}>
                        {attLabel[a.status as AttStatus] || a.status}
                      </span>
                    </td>
                    <td className="td text-gray-400 text-xs">{a.informed_at ? new Date(a.informed_at).toLocaleString('en-IN') : '—'}</td>
                    <td className="td text-gray-400 text-xs">{a.notes || '—'}</td>
                  </tr>
                ))}
                {!recentAtt.length && <tr><td colSpan={6} className="td text-center text-gray-300 py-8">No attendance records yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ENROLLMENT MODAL — multi-step full enrollment form
// ══════════════════════════════════════════════════════════════
const ENROLLMENT_STEPS = ['Personal','Guardian & Medical','Instrument & Package','Invoice'] as const
type EnrollStep = typeof ENROLLMENT_STEPS[number]

function EnrollmentModal({ student, subjects, packages, schedules, onClose, reload }: any) {
  const [blockedSlots, setBlockedSlots] = useState<any[]>([])
  const [centerHours, setCenterHours] = useState<any[]>([])
  useEffect(() => {
    sb().from('blocked_slots').select('*').then(({ data }: any) => setBlockedSlots(data || []))
    sb().from('center_hours').select('*').then(({ data }: any) => setCenterHours(data || []))
  }, [])
  function hourSlotsForDay(day:string):string[] {
    const h = centerHours.find((c:any)=>c.day_of_week===day)
    if (!h || h.is_closed) return []
    const slots:string[] = []
    const oh = parseInt(h.open_time.split(':')[0])
    const ch = parseInt(h.close_time.split(':')[0])
    for (let hr=oh; hr<ch; hr++) slots.push(`${String(hr).padStart(2,'0')}:00`)
    return slots
  }
  const supabase = sb()
  const isEdit = !!student
  const [step, setStep] = useState<EnrollStep>('Personal')
  const [busy, setBusy] = useState(false)
  const [savedStudent, setSavedStudent] = useState<any>(student || null)
  const [invoiceSent, setInvoiceSent] = useState(false)
  const [emailResult, setEmailResult] = useState('')

  const [p, setP] = useState({
    // Personal
    full_name:              student?.full_name || '',
    email:                  student?.email || '',
    phone:                  student?.phone || '',
    date_of_birth:          student?.date_of_birth || '',
    age:                    student?.age || '',
    gender:                 student?.gender || '',
    nationality:            student?.nationality || '',
    city:                   student?.city || '',
    area:                   student?.area || '',
    status:                 student?.status || 'Active',
    joined_date:            student?.joined_date || new Date().toISOString().slice(0,10),
    referral_source:        student?.referral_source || '',
    // Guardian
    guardian_name:          student?.guardian_name || '',
    guardian_phone:         student?.guardian_phone || '',
    guardian_email:         student?.guardian_email || '',
    emergency_contact_name: student?.emergency_contact_name || '',
    emergency_contact_phone:student?.emergency_contact_phone || '',
    // Medical
    medical_conditions:     student?.medical_conditions || '',
    allergies:              student?.allergies || '',
    notes:                  student?.notes || '',
    // Instrument
    subject_ids:            (student?.student_subjects||[]).map((x:any)=>x.subject_id) as string[],
    grade_level:            'Beginner–Grade 2',
    enroll_day:             '',
    enroll_time:            '',
    // Invoice
    package_id:             '',
    invoice_amount:         '',
    invoice_discount:       '',
    invoice_month:          new Date().toLocaleString('en-IN',{month:'long',year:'numeric'}),
    invoice_mode:           'UPI',
    invoice_status:         'pending' as 'pending'|'paid',
    invoice_due:            new Date(Date.now()+7*86400000).toISOString().slice(0,10),
    invoice_notes:          '',
  })

  const sf = (k: string, v: any) => setP((prev:any) => ({...prev, [k]: v}))

  const stepIdx = ENROLLMENT_STEPS.indexOf(step)
  const canNext = stepIdx < ENROLLMENT_STEPS.length - 1

  // Save student on step 1 completion
  async function savePersonal() {
    if (!p.full_name.trim()) return
    setBusy(true)
    const payload: any = {
      full_name: p.full_name.trim(), email: p.email||null, phone: p.phone||null,
      date_of_birth: p.date_of_birth||null, age: p.age||null, gender: p.gender||null,
      nationality: p.nationality||null, city: p.city||null, area: p.area||null,
      status: p.status, joined_date: p.joined_date||null, referral_source: p.referral_source||null,
    }
    let sid = savedStudent?.id
    if (isEdit && sid) {
      await supabase.from('students').update(payload).eq('id', sid)
    } else {
      const { data } = await supabase.from('students').insert(payload).select().single()
      sid = data?.id
      setSavedStudent(data)
    }
    setBusy(false)
    if (sid) setStep('Guardian & Medical')
  }

  async function saveGuardianMedical() {
    if (!savedStudent?.id) return
    setBusy(true)
    await supabase.from('students').update({
      guardian_name: p.guardian_name||null,
      guardian_phone: p.guardian_phone||null,
      guardian_email: p.guardian_email||null,
      emergency_contact_name: p.emergency_contact_name||null,
      emergency_contact_phone: p.emergency_contact_phone||null,
      medical_conditions: p.medical_conditions||null,
      allergies: p.allergies||null,
      notes: p.notes||null,
    }).eq('id', savedStudent.id)
    setBusy(false)
    setStep('Instrument & Package')
  }

  async function saveInstrument() {
    if (!savedStudent?.id) return
    setBusy(true)
    const sid = savedStudent.id
    await supabase.from('student_subjects').delete().eq('student_id', sid)
    if (p.subject_ids.length) {
      await supabase.from('student_subjects').insert(
        p.subject_ids.map((subId: string) => ({ student_id: sid, subject_id: subId, grade_level: p.grade_level }))
      )
    }

    // If a slot was selected, create or reuse the class and assign the student to it
    if (p.enroll_day && p.enroll_time && p.subject_ids.length) {
      const primarySubjectId = p.subject_ids[0]
      // Re-check the slot is still free (race condition safety)
      const { data: conflict } = await supabase
        .from('class_schedules')
        .select('id')
        .eq('subject_id', primarySubjectId)
        .eq('day_of_week', p.enroll_day)
        .eq('start_time', p.enroll_time)
        .maybeSingle()

      let scheduleId = conflict?.id
      if (!scheduleId) {
        const { data: newCls } = await supabase
          .from('class_schedules')
          .insert({ subject_id: primarySubjectId, day_of_week: p.enroll_day, start_time: p.enroll_time, duration_minutes: 60 })
          .select()
          .single()
        scheduleId = newCls?.id
      }
      if (scheduleId) {
        await supabase.from('schedule_students').upsert(
          { schedule_id: scheduleId, student_id: sid },
          { onConflict: 'schedule_id,student_id', ignoreDuplicates: true }
        )
      }
    }

    setBusy(false)
    setStep('Invoice')
  }

  async function saveAndSendInvoice(sendEmail: boolean) {
    if (!savedStudent?.id) { reload(); onClose(); return }
    setBusy(true)

    const selectedPkg = packages.find((pkg: any) => pkg.id === p.package_id)
    const selectedSub = subjects.find((s: any) => p.subject_ids.includes(s.id))
    const rawAmount = parseFloat(p.invoice_amount) || 0
    const discountAmt = parseFloat(p.invoice_discount) || 0
    const finalAmount = Math.max(0, rawAmount - discountAmt)
    const invoiceNo = `INV-${Date.now().toString().slice(-6)}`

    if (rawAmount > 0) {
      await supabase.from('payments').insert({
        student_id:      savedStudent.id,
        subject_id:      p.subject_ids[0] || null,
        amount:          finalAmount,
        discount:        discountAmt || null,
        status:          p.invoice_status,
        payment_date:    p.invoice_status === 'paid' ? new Date().toISOString().slice(0,10) : null,
        month_label:     p.invoice_month,
        due_date:        p.invoice_due || null,
        invoice_number:  invoiceNo.replace('INV-',''),
        mode_of_payment: p.invoice_mode,
        description:     selectedPkg?.name || selectedSub?.name || 'Tuition',
        student_name:    savedStudent.full_name,
        student_email:   savedStudent.email,
        student_phone:   savedStudent.phone,
        recorded_by:     'Academy',
      })
    }

    if (sendEmail && savedStudent.email && rawAmount > 0) {
      const issueDate = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})
      const dueDate = new Date(p.invoice_due).toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})
      const r = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'invoice',
          studentEmail: savedStudent.email,
          studentName: savedStudent.full_name,
          invoiceData: {
            invoiceNo, subjectName: selectedSub?.name || 'Tuition',
            pkgName: selectedPkg?.name || null,
            monthLabel: p.invoice_month, rawAmount, discountAmt, finalAmount,
            issueDate, dueDate, status: p.invoice_status,
            notes: p.invoice_notes || null,
            upiId: 'truetoneacademy@sbi',
            academyName: 'True Tone Music Academy',
            academyAddress: 'Hoodi, Bengaluru',
            academyPhone: '+91 97312 70069',
            studentPhone: savedStudent.phone,
            studentIdExt: savedStudent.student_id_ext,
          }
        })
      })
      const d = await r.json()
      setEmailResult(d.ok ? `✓ Invoice emailed to ${savedStudent.email}` : `Email error: ${d.error}`)
      setInvoiceSent(true)
    }

    setBusy(false)
    reload()
    if (!sendEmail || !savedStudent.email) onClose()
  }

  const subjectPackages = packages.filter((pkg: any) =>
    p.subject_ids.includes(pkg.subject_id) &&
    (pkg.grade_level === p.grade_level || pkg.grade_level === 'All Levels') &&
    pkg.is_active
  )

  const selectedPkg = packages.find((pkg: any) => pkg.id === p.package_id)
  const rawAmount = parseFloat(p.invoice_amount) || 0
  const discountAmt = parseFloat(p.invoice_discount) || 0
  const finalAmount = Math.max(0, rawAmount - discountAmt)

  const MONTHS_OPTS = Array.from({length:12},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-1+i);return d.toLocaleString('en-IN',{month:'long',year:'numeric'})})

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[94vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{isEdit ? 'Edit Student' : 'Enroll New Student'}</h2>
            {savedStudent && <div className="text-xs text-gray-400 mt-0.5">{savedStudent.full_name}</div>}
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4"/></button>
        </div>

        {/* Step indicators */}
        <div className="flex border-b border-gray-100 px-6 flex-shrink-0">
          {ENROLLMENT_STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <button
                onClick={() => { if (savedStudent || i === 0) setStep(s) }}
                className={clsx('px-3 py-2.5 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5',
                  step === s ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-400',
                  (savedStudent || i === 0) ? 'cursor-pointer hover:text-gray-600' : 'cursor-not-allowed opacity-40'
                )}
              >
                <span className={clsx('w-4 h-4 rounded-full text-xs flex items-center justify-center font-bold',
                  step === s ? 'bg-brand-500 text-white' :
                  ENROLLMENT_STEPS.indexOf(step) > i ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'
                )}>{ENROLLMENT_STEPS.indexOf(step) > i ? '✓' : i+1}</span>
                {s}
              </button>
              {i < ENROLLMENT_STEPS.length - 1 && <div className="w-4 h-px bg-gray-200 mx-1"/>}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* ── STEP 1: Personal ── */}
          {step === 'Personal' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label">Full Name *</label>
                  <input className="input" value={p.full_name} onChange={e=>sf('full_name',e.target.value)} placeholder="e.g. Arjun Mehta" autoFocus/>
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={p.email} onChange={e=>sf('email',e.target.value)} placeholder="student@email.com"/>
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={p.phone} onChange={e=>sf('phone',e.target.value)} placeholder="+91 98765 43210"/>
                </div>
                <div>
                  <label className="label">Date of Birth</label>
                  <input className="input" type="date" value={p.date_of_birth} onChange={e=>sf('date_of_birth',e.target.value)}/>
                </div>
                <div>
                  <label className="label">Age</label>
                  <input className="input" type="number" value={p.age} onChange={e=>sf('age',e.target.value)} placeholder="e.g. 12"/>
                </div>
                <div>
                  <label className="label">Gender</label>
                  <select className="input" value={p.gender} onChange={e=>sf('gender',e.target.value)}>
                    <option value="">— Select —</option>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="label">Nationality</label>
                  <input className="input" value={p.nationality} onChange={e=>sf('nationality',e.target.value)} placeholder="e.g. Indian"/>
                </div>
                <div>
                  <label className="label">City</label>
                  <input className="input" value={p.city} onChange={e=>sf('city',e.target.value)} placeholder="e.g. Bengaluru"/>
                </div>
                <div>
                  <label className="label">Area / Locality</label>
                  <input className="input" value={p.area} onChange={e=>sf('area',e.target.value)} placeholder="e.g. Hoodi"/>
                </div>
                <div>
                  <label className="label">Referral Source</label>
                  <select className="input" value={p.referral_source} onChange={e=>sf('referral_source',e.target.value)}>
                    <option value="">— Select —</option>
                    {['Instagram','Facebook','Google','Friend/Family','Walk-in','WhatsApp','Other'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Enrolment Date</label>
                  <input className="input" type="date" value={p.joined_date} onChange={e=>sf('joined_date',e.target.value)}/>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={p.status} onChange={e=>sf('status',e.target.value)}>
                    {STUDENT_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Guardian & Medical ── */}
          {step === 'Guardian & Medical' && (
            <div className="space-y-5">
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Guardian Details</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="label">Guardian / Parent Name</label>
                    <input className="input" value={p.guardian_name} onChange={e=>sf('guardian_name',e.target.value)} placeholder="Parent or guardian full name"/>
                  </div>
                  <div>
                    <label className="label">Guardian Phone</label>
                    <input className="input" value={p.guardian_phone} onChange={e=>sf('guardian_phone',e.target.value)}/>
                  </div>
                  <div>
                    <label className="label">Guardian Email</label>
                    <input className="input" type="email" value={p.guardian_email} onChange={e=>sf('guardian_email',e.target.value)}/>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Emergency Contact</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Contact Name</label>
                    <input className="input" value={p.emergency_contact_name} onChange={e=>sf('emergency_contact_name',e.target.value)} placeholder="Name (if different from guardian)"/>
                  </div>
                  <div>
                    <label className="label">Contact Phone</label>
                    <input className="input" value={p.emergency_contact_phone} onChange={e=>sf('emergency_contact_phone',e.target.value)}/>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Medical Information</div>
                <div className="space-y-3">
                  <div>
                    <label className="label">Medical Conditions</label>
                    <textarea
                      className="input min-h-[72px] resize-none"
                      value={p.medical_conditions}
                      onChange={e=>sf('medical_conditions',e.target.value)}
                      placeholder="List any relevant medical conditions, disabilities, or learning differences we should be aware of…"
                    />
                  </div>
                  <div>
                    <label className="label">Allergies</label>
                    <input className="input" value={p.allergies} onChange={e=>sf('allergies',e.target.value)} placeholder="e.g. Peanuts, Penicillin, Dust — or None"/>
                  </div>
                  <div>
                    <label className="label">Additional Notes</label>
                    <textarea
                      className="input min-h-[56px] resize-none"
                      value={p.notes}
                      onChange={e=>sf('notes',e.target.value)}
                      placeholder="Any other information for teachers or staff…"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Instrument & Package ── */}
          {step === 'Instrument & Package' && (
            <div className="space-y-5">
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Select Instrument(s) *</div>
                <div className="grid grid-cols-2 gap-2">
                  {subjects.map((s:any) => (
                    <button key={s.id} type="button"
                      onClick={()=>sf('subject_ids', p.subject_ids.includes(s.id) ? p.subject_ids.filter((x:string)=>x!==s.id) : [...p.subject_ids, s.id])}
                      className={clsx('px-3 py-2.5 rounded-xl border text-sm font-medium text-left transition-all flex items-center gap-2',
                        p.subject_ids.includes(s.id) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      )}>
                      <span className={clsx('badge text-xs', colorBadge[s.color]||colorBadge.violet)}>{s.code}</span>
                      {s.name}
                      {p.subject_ids.includes(s.id) && <span className="ml-auto text-brand-500">✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Grade Level</div>
                <div className="flex gap-2 flex-wrap">
                  {['Beginner–Grade 2','Grade 3–5','Grade 6–8'].map(g=>(
                    <button key={g} type="button"
                      onClick={()=>{ sf('grade_level',g); sf('package_id',''); sf('invoice_amount','') }}
                      className={clsx('px-3 py-1.5 rounded-lg border text-sm font-medium transition-all',
                        p.grade_level===g ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      )}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Free slot picker — now bookable, based on center hours */}
              {p.subject_ids.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Select a Class Slot (1 hour)</div>
                  <div className="space-y-3">
                    {(centerHours.filter((h:any)=>!h.is_closed).map((h:any)=>h.day_of_week)).map((day:string) => {
                      const bookedSlots = schedules.filter((sc:any) => p.subject_ids.includes(sc.subject_id) && sc.day_of_week === day).map((sc:any) => sc.start_time?.slice(0,5))
                      const blockedSlotsForDay = (blockedSlots||[]).filter((b:any)=>b.day_of_week===day).map((b:any)=>b.start_time?.slice(0,5))
                      const allSlots = hourSlotsForDay(day)
                      const freeSlots = allSlots.filter(t => !bookedSlots.includes(t) && !blockedSlotsForDay.includes(t))
                      if (!freeSlots.length && !bookedSlots.length) return null
                      return (
                        <div key={day}>
                          <div className="text-xs font-medium text-gray-500 mb-1.5">{day === 'Sun' ? 'Sunday' : day === 'Tue' ? 'Tuesday' : day === 'Wed' ? 'Wednesday' : day === 'Thu' ? 'Thursday' : day === 'Fri' ? 'Friday' : 'Saturday'}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {freeSlots.map(t => {
                              const selected = p.enroll_day === day && p.enroll_time === t
                              return (
                                <button key={t} type="button"
                                  onClick={() => { sf('enroll_day', day); sf('enroll_time', t) }}
                                  className={clsx('px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition-all cursor-pointer',
                                    selected ? 'bg-brand-500 text-white border-brand-500' : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                                  )}>
                                  {t}
                                </button>
                              )
                            })}
                            {bookedSlots.map((t:string) => (
                              <span key={t} className="px-2.5 py-1 rounded-lg text-xs font-mono bg-gray-100 text-gray-400 line-through cursor-not-allowed">{t}</span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {p.enroll_day && p.enroll_time ? (
                    <div className="mt-3 flex items-center justify-between bg-brand-50 border border-brand-100 rounded-xl px-3 py-2.5">
                      <div className="text-sm text-brand-700">Slot selected: <strong>{p.enroll_day} at {p.enroll_time}</strong></div>
                      <button type="button" onClick={() => { sf('enroll_day',''); sf('enroll_time','') }} className="text-xs text-brand-400 hover:text-brand-600">Clear</button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 mt-2">Click a green slot to book a class time — this will be created automatically when you finish enrolling. You can also skip and assign a slot later from the Schedule tab.</p>
                  )}
                </div>
              )}

              {p.subject_ids.length > 0 && subjectPackages.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Select Package</div>
                  <div className="grid grid-cols-2 gap-2">
                    {subjectPackages.sort((a:any,b:any)=>(a.months||1)-(b.months||1)||(a.classes_pm-b.classes_pm)).map((pkg:any)=>(
                      <button key={pkg.id} type="button"
                        onClick={()=>{ sf('package_id',pkg.id); sf('invoice_amount',String(pkg.price)) }}
                        className={clsx('p-3 rounded-xl border text-left transition-all',
                          p.package_id===pkg.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:border-gray-300'
                        )}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="badge text-xs bg-gray-100 text-gray-600">{pkg.classes_pm} cls/mo</span>
                          {(pkg.months||1)>1 && <span className={clsx('badge text-xs',(pkg.months||1)===6?'bg-rose-50 text-rose-700':'bg-teal-50 text-teal-700')}>{pkg.months}mo · {(pkg.months||1)===6?'15%':'10%'} off</span>}
                        </div>
                        <div className="text-base font-bold text-gray-900">{pkg.months>1?`₹${pkg.price.toLocaleString('en-IN')} total`:`₹${pkg.price.toLocaleString('en-IN')}/mo`}</div>
                        {pkg.months>1 && <div className="text-xs text-emerald-600">= ₹{Math.round(pkg.price/pkg.months).toLocaleString('en-IN')}/mo</div>}
                        <div className="text-xs text-gray-400 mt-0.5">{pkg.duration_min} min · ₹{Math.round(pkg.price/(pkg.classes_pm*(pkg.months||1))).toLocaleString('en-IN')}/class</div>
                      </button>
                    ))}
                    <button type="button"
                      onClick={()=>{ sf('package_id',''); sf('invoice_amount','') }}
                      className={clsx('p-3 rounded-xl border text-left transition-all',
                        !p.package_id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:border-gray-300'
                      )}>
                      <div className="text-sm font-semibold text-gray-700">Custom amount</div>
                      <div className="text-xs text-gray-400">Enter manually in invoice step</div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: Invoice ── */}
          {step === 'Invoice' && (
            <div className="space-y-4">
              {invoiceSent ? (
                <div className="text-center py-8">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="w-7 h-7 text-emerald-600"/>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Enrolment Complete!</h3>
                  <p className="text-sm text-gray-500">{savedStudent?.full_name} has been enrolled successfully.</p>
                  {emailResult && <p className={clsx('text-sm mt-2', emailResult.startsWith('✓')?'text-emerald-600':'text-red-500')}>{emailResult}</p>}
                  <button onClick={onClose} className="btn-primary mt-5 mx-auto">Done</button>
                </div>
              ) : (
                <>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-sm text-emerald-800">
                    <strong>{savedStudent?.full_name}</strong> enrolled · {p.subject_ids.length} instrument(s) · {p.grade_level}
                    {selectedPkg && <span> · {selectedPkg.name}</span>}
                    {p.enroll_day && p.enroll_time && <div className="mt-1">🗓️ Class booked: <strong>{p.enroll_day} at {p.enroll_time}</strong></div>}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Amount (₹)</label>
                      <input className="input text-lg font-semibold" type="number" value={p.invoice_amount}
                        onChange={e=>sf('invoice_amount',e.target.value)} placeholder="e.g. 2200"/>
                    </div>
                    <div>
                      <label className="label">Discount (₹)</label>
                      <input className="input" type="number" value={p.invoice_discount}
                        onChange={e=>sf('invoice_discount',e.target.value)} placeholder="0"/>
                    </div>
                  </div>

                  {rawAmount > 0 && (
                    <div className={clsx('flex justify-between items-center px-4 py-2.5 rounded-xl text-sm',
                      discountAmt>0?'bg-blue-50 border border-blue-100':'bg-emerald-50 border border-emerald-100'
                    )}>
                      <span className="text-gray-600">{discountAmt>0?<><span className="text-blue-600">{rawAmount.toLocaleString('en-IN')} - {discountAmt.toLocaleString('en-IN')} = </span></>:null}Final amount:</span>
                      <span className="font-bold text-lg text-emerald-700">₹{finalAmount.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">For Month</label>
                      <select className="input" value={p.invoice_month} onChange={e=>sf('invoice_month',e.target.value)}>
                        {MONTHS_OPTS.map(m=><option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Payment Mode</label>
                      <select className="input" value={p.invoice_mode} onChange={e=>sf('invoice_mode',e.target.value)}>
                        {PAY_MODES.map(m=><option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Status</label>
                      <div className="flex gap-2">
                        {(['pending','paid'] as const).map(s=>(
                          <button key={s} type="button"
                            onClick={()=>sf('invoice_status',s)}
                            className={clsx('flex-1 py-2 rounded-lg border text-sm font-medium capitalize transition-all',
                              p.invoice_status===s
                                ? s==='paid'?'border-emerald-500 bg-emerald-500 text-white':'border-amber-400 bg-amber-400 text-white'
                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                            )}>{s}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="label">Due Date</label>
                      <input className="input" type="date" value={p.invoice_due} onChange={e=>sf('invoice_due',e.target.value)}/>
                    </div>
                  </div>

                  <div>
                    <label className="label">UPI Payment Info</label>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3 text-sm">
                      <div className="font-bold text-emerald-800 font-mono">truetoneacademy@sbi</div>
                      <div className="text-emerald-600 text-xs mt-0.5">State Bank of India</div>
                    </div>
                  </div>

                  <div>
                    <label className="label">Invoice Notes (optional)</label>
                    <input className="input" value={p.invoice_notes} onChange={e=>sf('invoice_notes',e.target.value)} placeholder="e.g. 3-month advance payment"/>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        {!invoiceSent && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-gray-50/60 rounded-b-2xl">
            <div>
              {stepIdx > 0 && <button onClick={()=>setStep(ENROLLMENT_STEPS[stepIdx-1])} className="btn">← Back</button>}
            </div>
            <div className="flex gap-2">
              {step === 'Personal' && (
                <button onClick={savePersonal} disabled={busy||!p.full_name.trim()} className="btn-primary">
                  {busy?<Loader2 className="w-4 h-4 animate-spin"/>:null} Save & Continue →
                </button>
              )}
              {step === 'Guardian & Medical' && (
                <button onClick={saveGuardianMedical} disabled={busy} className="btn-primary">
                  {busy?<Loader2 className="w-4 h-4 animate-spin"/>:null} Save & Continue →
                </button>
              )}
              {step === 'Instrument & Package' && (
                <button onClick={saveInstrument} disabled={busy} className="btn-primary">
                  {busy?<Loader2 className="w-4 h-4 animate-spin"/>:null} Continue to Invoice →
                </button>
              )}
              {step === 'Invoice' && (
                <>
                  <button onClick={()=>saveAndSendInvoice(false)} disabled={busy} className="btn">
                    {busy?<Loader2 className="w-4 h-4 animate-spin"/>:null}
                    {rawAmount>0?'Save Invoice':'Complete (no invoice)'}
                  </button>
                  {savedStudent?.email && rawAmount>0 && (
                    <button onClick={()=>saveAndSendInvoice(true)} disabled={busy} className="btn-primary">
                      {busy?<Loader2 className="w-4 h-4 animate-spin"/>:<Mail className="w-4 h-4"/>}
                      Save & Email Invoice
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
