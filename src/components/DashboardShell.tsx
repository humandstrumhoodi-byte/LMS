'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/client'
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, CalendarDays, Coins,
  Receipt, ShieldCheck, LogOut, Music, Bell, FileText, CheckCircle,
  Plus, Trash2, Edit, Search, X, ChevronRight, Loader2, AlertCircle,
  Upload, Download, UserPlus, Mail, Send, Eye, CreditCard, Phone
} from 'lucide-react'
import clsx from 'clsx'
import type { Profile, Perms, Role } from '@/types'
import { ROLE_PERMS, ROLE_LABEL, ROLE_COLOR, DAYS, TIMES, COLORS } from '@/types'

const fmt = (n: number) => '₹' + (n||0).toLocaleString('en-IN')
const ini = (name: string) => (name||'?').split(' ').map((w:string)=>w[0]).join('').toUpperCase().slice(0,2)
const avatarColors = ['bg-violet-100 text-violet-700','bg-sky-100 text-sky-700','bg-emerald-100 text-emerald-700','bg-amber-100 text-amber-700','bg-rose-100 text-rose-700']
const ac = (i:number) => avatarColors[i%avatarColors.length]
const colorBadge:Record<string,string> = { violet:'bg-violet-50 text-violet-700', sky:'bg-sky-50 text-sky-700', emerald:'bg-emerald-50 text-emerald-700', amber:'bg-amber-50 text-amber-700', rose:'bg-rose-50 text-rose-700', indigo:'bg-indigo-50 text-indigo-700' }
const colorCell:Record<string,string> = { violet:'bg-violet-100 text-violet-700 border border-violet-200', sky:'bg-sky-100 text-sky-700 border border-sky-200', emerald:'bg-emerald-100 text-emerald-700 border border-emerald-200', amber:'bg-amber-100 text-amber-700 border border-amber-200', rose:'bg-rose-100 text-rose-700 border border-rose-200', indigo:'bg-indigo-100 text-indigo-700 border border-indigo-200' }
const PAY_MODES = ['UPI','Cash','Credit / Debit Card','Payment gateway','Cheque','Bank Transfer','Other']
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
  const status = row['status']?.toLowerCase()==='successful'?'paid':row['status']?.toLowerCase()==='failed'?'failed':'pending'
  return {
    payment_date:row['date']||null,
    amount:parseInt(row['amount'])||0,
    receipt_number:row['receipt #']||row['receipt_number']||null,
    invoice_number:row['invoice #']||row['invoice_number']||null,
    description:row['payment description']||row['description']||null,
    mode_of_payment:row['mode of payment']||row['mode_of_payment']||'UPI',
    transaction_id:row['transaction id']||row['transaction_id']||null,
    student_name:row['student']||null,
    student_email:row['student email']||row['student_email']||null,
    student_phone:row['student phone']||row['student_phone']||null,
    student_id_ext:row['student id']||row['student_id']||null,
    status, recorded_by:row['recorded by']||row['recorded_by']||null,
    month_label: row['date'] ? new Date(row['date']).toLocaleString('en-IN',{month:'long',year:'numeric'}) : '',
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
function ImportPanel({type,onImport,subjects}:{type:'students'|'payments'|'staff';onImport:(rows:any[])=>void;subjects?:any[]}){
  const fileRef=useRef<HTMLInputElement>(null)
  const [rows,setRows]=useState<any[]>([])
  const [error,setError]=useState('')
  const templates:Record<string,string>={
    students:'"First Name","Last Name","Name","Status","Email","Phone","Guardian Name","Guardian Phone","Guardian Email","Created On","Batch","Student ID Prefix","Student ID","Courses","School Year","School Name","Refferal Source","Nationality","Area","City","Date Of Birth","Age","Signup Source","Gender"\n"Arjun","Mehta","Arjun Mehta","Active","arjun@email.com","+91 98765 43210","","","","2024-01-15 00:00:00","","","1","Guitar","","","Instagram","IN","Hoodi","Bengaluru","2012-06-15","12","Manual entry","Male"',
    payments:'"Date","Amount","Receipt #","Invoice #","Payment Description","Mode of Payment","Transaction ID","Response Code","Student","Student Email","Student Phone","Student ID","Status","Created","Recorded By"\n"2026-06-28","2200","402","407","","UPI","","","Arjun Mehta","arjun@email.com","+91 98765 43210","1","Successful","2026-06-28 06:36:12","Benjamin Singh"',
    staff:'"Name","Role","Calendar","Phone","Email"\n"Sadhana Singh","Teacher","","+91 98838 81289","singh.sadna24@gmail.com"',
  }
  function handleFile(e:React.ChangeEvent<HTMLInputElement>){
    setError('');setRows([])
    const file=e.target.files?.[0];if(!file)return
    const reader=new FileReader()
    reader.onload=(ev)=>{try{const parsed=parseCSV(ev.target?.result as string);if(!parsed.length){setError('No data rows found.');return}setRows(parsed)}catch{setError('Could not read file. Use CSV format.')}}
    reader.readAsText(file)
  }
  const previewCols=rows[0]?Object.keys(rows[0]).slice(0,6):[]
  return(
    <div className="space-y-4">
      <div className="flex gap-2">
        <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(templates[type])}`} download={`${type}-template.csv`} className="btn btn-sm flex-1 justify-center"><Download className="w-3 h-3"/> Download Template</a>
      </div>
      <div><label className="label">Upload CSV</label><input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="input"/><div className="text-xs text-gray-400 mt-1">For Excel: Save As → CSV (Comma delimited)</div></div>
      {error&&<div className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}
      {rows.length>0&&(
        <>
          <div className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-100 font-medium">✓ {rows.length} rows detected — ready to import</div>
          <div className="overflow-x-auto rounded-lg border border-gray-100 text-xs">
            <table className="w-full"><thead><tr>{previewCols.map(c=><th key={c} className="th py-1.5 whitespace-nowrap">{c}</th>)}</tr></thead>
            <tbody>{rows.slice(0,3).map((row,i)=><tr key={i}>{previewCols.map(c=><td key={c} className="td py-1.5 max-w-[100px] truncate">{row[c]||'—'}</td>)}</tr>)}</tbody></table>
          </div>
          <button onClick={()=>onImport(rows)} className="btn-primary w-full justify-center"><Upload className="w-4 h-4"/> Import {rows.length} {type}</button>
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN SHELL
// ══════════════════════════════════════════════════════════════
export default function DashboardShell({profile}:{profile:Profile}){
  const router=useRouter()
  const supabase=sb()
  const perms:Perms=ROLE_PERMS[profile.role as Role]
  const [tab,setTab]=useState('home')
  const [students,setStudents]=useState<any[]>([])
  const [profiles,setProfiles]=useState<any[]>([])
  const [subjects,setSubjects]=useState<any[]>([])
  const [schedules,setSchedules]=useState<any[]>([])
  const [fees,setFees]=useState<any[]>([])
  const [payments,setPayments]=useState<any[]>([])
  const [leads,setLeads]=useState<any[]>([])

  const load=useCallback(async()=>{
    const [s,p,sub,sch,f,pay,l]=await Promise.all([
      supabase.from('students').select('*, student_subjects(subject_id)').order('full_name'),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('subjects').select('*').order('name'),
      supabase.from('class_schedules').select('*, schedule_students(student_id)').order('day_of_week').order('start_time'),
      supabase.from('fee_structures').select('*'),
      supabase.from('payments').select('*, students(full_name,email,phone), subjects(name,code,color)').order('created_at',{ascending:false}),
      supabase.from('leads').select('*').order('created_at',{ascending:false}),
    ])
    setStudents(s.data||[]);setProfiles(p.data||[]);setSubjects(sub.data||[])
    setSchedules(sch.data||[]);setFees(f.data||[]);setPayments(pay.data||[]);setLeads(l.data||[])
  },[])

  useEffect(()=>{load()},[load])
  async function signOut(){await supabase.auth.signOut();router.push('/login')}

  const nav=[
    {id:'home',icon:LayoutDashboard,label:'Dashboard',show:true},
    {id:'students',icon:Users,label:'Students',show:perms.manageStudents},
    {id:'leads',icon:UserPlus,label:'Leads',show:perms.manageStudents},
    {id:'teachers',icon:GraduationCap,label:'Teachers',show:perms.manageTeachers},
    {id:'subjects',icon:BookOpen,label:'Subjects',show:perms.manageSubjects},
    {id:'schedule',icon:CalendarDays,label:'Schedule',show:perms.viewOwnSchedule},
    {id:'fees',icon:Coins,label:'Fee Structure',show:perms.manageFees},
    {id:'payments',icon:Receipt,label:'Payments',show:perms.viewPayments},
    {id:'users',icon:ShieldCheck,label:'Users & Roles',show:perms.manageUsers},
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
          {tab==='students'&&<StudentsTab students={students} subjects={subjects} reload={load}/>}
          {tab==='leads'&&<LeadsTab leads={leads} subjects={subjects} reload={load}/>}
          {tab==='teachers'&&<TeachersTab profiles={profiles} subjects={subjects} reload={load}/>}
          {tab==='subjects'&&<SubjectsTab subjects={subjects} profiles={profiles} students={students} fees={fees} reload={load}/>}
          {tab==='schedule'&&<ScheduleTab schedules={schedules} subjects={subjects} students={students} profile={profile} perms={perms} reload={load}/>}
          {tab==='fees'&&<FeesTab subjects={subjects} fees={fees} reload={load}/>}
          {tab==='payments'&&<PaymentsTab payments={payments} students={students} subjects={subjects} fees={fees} perms={perms} reload={load}/>}
          {tab==='users'&&<UsersTab profiles={profiles} profile={profile} reload={load}/>}
        </div>
      </main>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════ HOME
function HomeTab({profile,perms,students,profiles,payments,schedules,subjects,leads,setTab}:any){
  const teachers=profiles.filter((p:any)=>p.role==='teacher')
  const paid=payments.filter((p:any)=>p.status==='paid').reduce((a:number,p:any)=>a+p.amount,0)
  const pending=payments.filter((p:any)=>p.status==='pending'||p.status==='overdue').reduce((a:number,p:any)=>a+p.amount,0)
  const overdue=payments.filter((p:any)=>p.status==='overdue')
  const newLeads=leads.filter((l:any)=>l.status==='New').length
  const isTeacher=profile.role==='teacher'
  return(
    <div className="animate-fu">
      <div className="mb-6"><h1 className="text-xl font-semibold text-gray-900">Good day, {profile.full_name.split(' ')[0]} 👋</h1><p className="text-sm text-gray-400 mt-0.5">{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p></div>
      <div className={clsx('inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border mb-6',profile.role==='superadmin'?'bg-purple-50 text-purple-700 border-purple-200':profile.role==='center_manager'?'bg-blue-50 text-blue-700 border-blue-200':'bg-emerald-50 text-emerald-700 border-emerald-200')}>
        <span className="w-1.5 h-1.5 rounded-full bg-current"/>{ROLE_LABEL[profile.role as Role]}{isTeacher&&' — schedule view only'}
      </div>
      {!isTeacher&&(<>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[{label:'Students',val:students.length,icon:Users,color:'bg-blue-50 text-blue-600',page:'students'},{label:'Leads',val:leads.length,icon:UserPlus,color:'bg-purple-50 text-purple-600',page:'leads'},{label:'Teachers',val:teachers.length,icon:GraduationCap,color:'bg-indigo-50 text-indigo-600',page:'teachers'},{label:'Subjects',val:subjects.length,icon:BookOpen,color:'bg-emerald-50 text-emerald-600',page:'subjects'},{label:'Classes/wk',val:schedules.length,icon:CalendarDays,color:'bg-amber-50 text-amber-600',page:'schedule'}].map(m=>{
            const Icon=m.icon;return(<button key={m.label} onClick={()=>setTab(m.page)} className="card p-4 text-left hover:shadow-md transition-shadow"><div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center mb-2',m.color)}><Icon className="w-4 h-4"/></div><div className="text-xl font-semibold text-gray-900">{m.val}</div><div className="text-xs text-gray-400 mt-0.5">{m.label}</div></button>)
          })}
        </div>
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="card p-4 bg-emerald-50 border-emerald-100"><div className="text-xs text-emerald-600 font-medium mb-1">Collected</div><div className="text-xl font-semibold text-emerald-700">{fmt(paid)}</div></div>
          <div className="card p-4 bg-amber-50 border-amber-100"><div className="text-xs text-amber-600 font-medium mb-1">Pending</div><div className="text-xl font-semibold text-amber-700">{fmt(pending)}</div></div>
          <div className="card p-4 bg-red-50 border-red-100"><div className="text-xs text-red-500 font-medium mb-1">Overdue</div><div className="text-xl font-semibold text-red-600">{overdue.length} students</div></div>
        </div>
        {newLeads>0&&<div className="card p-4 mb-4 border-purple-100 bg-purple-50/50 flex items-center justify-between"><div className="flex items-center gap-2 text-purple-700"><UserPlus className="w-4 h-4"/><span className="text-sm font-medium">{newLeads} new lead{newLeads>1?'s':''} awaiting follow-up</span></div><button onClick={()=>setTab('leads')} className="btn btn-sm text-purple-700 border-purple-200">View Leads</button></div>}
        {overdue.length>0&&<div className="card mb-4"><div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 text-sm font-medium text-red-600"><AlertCircle className="w-4 h-4"/>Overdue Fees</div>{overdue.slice(0,5).map((p:any)=><div key={p.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-50 last:border-0"><div><div className="text-sm font-medium text-gray-800">{p.students?.full_name||p.student_name}</div><div className="text-xs text-gray-400">{p.subjects?.name} · {p.month_label}</div></div><span className="text-sm font-semibold text-red-600">{fmt(p.amount)}</span></div>)}</div>}
      </>)}
      {isTeacher&&<div className="card p-10 text-center"><CalendarDays className="w-12 h-12 text-brand-300 mx-auto mb-3"/><h2 className="text-base font-medium text-gray-800 mb-1">Your Teaching Schedule</h2><p className="text-sm text-gray-400 mb-5">View classes assigned to your subjects.</p><button onClick={()=>setTab('schedule')} className="btn-primary">View My Schedule</button></div>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════ STUDENTS
function StudentsTab({students,subjects,reload}:any){
  const supabase=sb()
  const [q,setQ]=useState('')
  const [open,setOpen]=useState(false)
  const [importOpen,setImportOpen]=useState(false)
  const [detailStudent,setDetailStudent]=useState<any>(null)
  const [studentPayments,setStudentPayments]=useState<any[]>([])
  const [editing,setEditing]=useState<any>(null)
  const [form,setForm]=useState({full_name:'',email:'',phone:'',joined_date:'',status:'Active',subject_ids:[] as string[]})
  const [busy,setBusy]=useState(false)
  const [importResult,setImportResult]=useState('')

  async function viewStudent(s:any){
    setDetailStudent(s)
    const {data}=await supabase.from('payments').select('*, subjects(name)').eq('student_id',s.id).order('payment_date',{ascending:false})
    setStudentPayments(data||[])
  }

  const openAdd=()=>{setEditing(null);setForm({full_name:'',email:'',phone:'',joined_date:new Date().toISOString().slice(0,10),status:'Active',subject_ids:[]});setOpen(true)}
  const openEdit=(s:any)=>{setEditing(s);setForm({full_name:s.full_name,email:s.email||'',phone:s.phone||'',joined_date:s.joined_date||'',status:s.status||'Active',subject_ids:(s.student_subjects||[]).map((x:any)=>x.subject_id)});setOpen(true)}

  async function save(){
    if(!form.full_name.trim())return;setBusy(true)
    const payload={full_name:form.full_name.trim(),email:form.email||null,phone:form.phone||null,joined_date:form.joined_date||null,status:form.status}
    let sid=editing?.id
    if(editing){await supabase.from('students').update(payload).eq('id',sid)}
    else{const{data}=await supabase.from('students').insert(payload).select().single();sid=data?.id}
    if(sid){await supabase.from('student_subjects').delete().eq('student_id',sid);if(form.subject_ids.length)await supabase.from('student_subjects').insert(form.subject_ids.map(s=>({student_id:sid,subject_id:s})))}
    setBusy(false);setOpen(false);reload()
  }

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
        <div className="flex gap-2"><button onClick={()=>setImportOpen(true)} className="btn"><Upload className="w-4 h-4"/> Import CSV</button><button onClick={openAdd} className="btn-primary"><Plus className="w-4 h-4"/> Add Student</button></div>
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
                const statusColor=s.status==='Active'?'bg-emerald-50 text-emerald-700':'bg-gray-100 text-gray-500'
                return(<tr key={s.id} className="hover:bg-gray-50/50">
                  <td className="td"><div className="flex items-center gap-3"><Avatar name={s.full_name} i={i}/><div><div className="font-medium text-gray-900">{s.full_name}</div><div className="text-xs text-gray-400">{s.email}</div></div></div></td>
                  <td className="td text-gray-500">{s.phone||'—'}</td>
                  <td className="td"><div className="flex flex-wrap gap-1">{subs.map((sub:any)=><span key={sub.id} className={clsx('badge',colorBadge[sub.color]||colorBadge.violet)}>{sub.name}</span>)}</div></td>
                  <td className="td"><span className={clsx('badge',statusColor)}>{s.status||'Active'}</span></td>
                  <td className="td text-gray-400">{s.joined_date||'—'}</td>
                  <td className="td"><div className="flex gap-1">
                    <button onClick={()=>viewStudent(s)} className="btn btn-sm" title="View details"><Eye className="w-3 h-3"/></button>
                    <button onClick={()=>openEdit(s)} className="btn btn-sm"><Edit className="w-3 h-3"/></button>
                    <button onClick={()=>del(s.id)} className="btn btn-sm btn-danger"><Trash2 className="w-3 h-3"/></button>
                  </div></td>
                </tr>)
              })}
              {!filtered.length&&<tr><td colSpan={6} className="td text-center text-gray-300 py-10">No students found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Student detail + payment history modal */}
      <Modal open={!!detailStudent} onClose={()=>setDetailStudent(null)} title={`${detailStudent?.full_name} — Details`} wide>
        {detailStudent&&(
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[['Email',detailStudent.email],['Phone',detailStudent.phone],['Status',detailStudent.status],['DOB',detailStudent.date_of_birth],['Gender',detailStudent.gender],['City',detailStudent.city],['Guardian',detailStudent.guardian_name],['Guardian Ph',detailStudent.guardian_phone],['Discipline',detailStudent.discipline],['Student ID',detailStudent.student_id_ext]].map(([k,v])=>v&&(
                <div key={k} className="bg-gray-50 rounded-lg px-3 py-2"><div className="text-xs text-gray-400">{k}</div><div className="font-medium text-gray-800">{v}</div></div>
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-800 mb-3">Payment History</div>
              {studentPayments.length===0?<div className="text-sm text-gray-400 text-center py-6">No payments recorded</div>:(
                <table className="w-full text-sm">
                  <thead><tr><th className="th">Date</th><th className="th">Subject</th><th className="th">Amount</th><th className="th">Mode</th><th className="th">Receipt</th><th className="th">Status</th></tr></thead>
                  <tbody>
                    {studentPayments.map((p:any)=>(
                      <tr key={p.id} className="hover:bg-gray-50/50">
                        <td className="td">{p.payment_date||'—'}</td>
                        <td className="td">{p.subjects?.name||p.student_name||'—'}</td>
                        <td className="td font-semibold">{fmt(p.amount)}</td>
                        <td className="td text-gray-400">{p.mode_of_payment||'—'}</td>
                        <td className="td text-gray-400">#{p.receipt_number||'—'}</td>
                        <td className="td"><span className={clsx('badge',p.status==='paid'?'bg-emerald-50 text-emerald-700':p.status==='failed'?'bg-red-50 text-red-600':'bg-amber-50 text-amber-700')}>{p.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="mt-3 flex justify-between items-center pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">Total paid: <strong className="text-emerald-700">{fmt(studentPayments.filter(p=>p.status==='paid').reduce((a:number,p:any)=>a+p.amount,0))}</strong></span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={open} onClose={()=>setOpen(false)} title={editing?'Edit Student':'Add Student'}>
        <div className="space-y-3">
          <div><label className="label">Full Name *</label><input className="input" value={form.full_name} onChange={e=>setForm(f=>({...f,full_name:e.target.value}))}/></div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Joined Date</label><input className="input" type="date" value={form.joined_date} onChange={e=>setForm(f=>({...f,joined_date:e.target.value}))}/></div>
            <div><label className="label">Status</label><select className="input" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option>Active</option><option>Inactive</option></select></div>
          </div>
          <div><label className="label">Subjects</label><div className="space-y-1.5 mt-1">{subjects.map((s:any)=><label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.subject_ids.includes(s.id)} onChange={()=>setForm(f=>({...f,subject_ids:f.subject_ids.includes(s.id)?f.subject_ids.filter(x=>x!==s.id):[...f.subject_ids,s.id]}))} className="rounded border-gray-300"/>{s.name}</label>)}</div></div>
          <div className="flex justify-end gap-2 pt-2"><button className="btn" onClick={()=>setOpen(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy?<Loader2 className="w-4 h-4 animate-spin"/>:null}{editing?'Save':'Add'}</button></div>
        </div>
      </Modal>
      <Modal open={importOpen} onClose={()=>setImportOpen(false)} title="Import Students from CSV" wide>
        <ImportPanel type="students" onImport={handleImport} subjects={subjects}/>
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
  const teachers=profiles.filter((p:any)=>p.role==='teacher')
  const [open,setOpen]=useState(false);const [importOpen,setImportOpen]=useState(false)
  const [form,setForm]=useState({full_name:'',email:'',phone:'',password:''})
  const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const [importResult,setImportResult]=useState('')

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
  return(
    <div className="animate-fu">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-xl font-semibold text-gray-900">Teachers</h1><p className="text-sm text-gray-400 mt-0.5">{teachers.length} faculty</p></div>
        <div className="flex gap-2"><button onClick={()=>setImportOpen(true)} className="btn"><Upload className="w-4 h-4"/> Import Staff CSV</button><button onClick={()=>setOpen(true)} className="btn-primary"><Plus className="w-4 h-4"/> Add Teacher</button></div>
      </div>
      {importResult&&<div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-100">{importResult}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teachers.map((t:any,i:number)=>{
          const tSubs=subjects.filter((s:any)=>s.teacher_id===t.id)
          return(<div key={t.id} className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4"><div className="flex items-center gap-3"><Avatar name={t.full_name} i={i}/><div><div className="font-medium text-gray-900">{t.full_name}</div><span className="badge bg-emerald-50 text-emerald-700 text-xs">{t.staff_role||'Teacher'}</span></div></div><button onClick={()=>del(t.id)} className="btn btn-sm btn-danger"><Trash2 className="w-3 h-3"/></button></div>
            <div className="text-xs text-gray-400 mb-0.5">{t.email}</div>
            {t.phone&&<div className="text-xs text-gray-400 mb-3 flex items-center gap-1"><Phone className="w-3 h-3"/>{t.phone}</div>}
            <div className="flex flex-wrap gap-1">{tSubs.map((s:any)=><span key={s.id} className={clsx('badge',colorBadge[s.color]||colorBadge.violet)}>{s.name}</span>)}{!tSubs.length&&<span className="text-xs text-gray-300">No subjects yet</span>}</div>
          </div>)
        })}
        {!teachers.length&&<div className="col-span-3 text-center py-16 text-gray-300">No teachers yet. Import your staff CSV to get started.</div>}
      </div>
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
function SubjectsTab({subjects,profiles,students,fees,reload}:any){
  const supabase=sb()
  const teachers=profiles.filter((p:any)=>['teacher','center_manager','superadmin'].includes(p.role))
  const [open,setOpen]=useState(false);const [editing,setEditing]=useState<any>(null)
  const [form,setForm]=useState({name:'',code:'',level:'',color:'violet',teacher_id:''});const [busy,setBusy]=useState(false)
  const openAdd=()=>{setEditing(null);setForm({name:'',code:'',level:'',color:'violet',teacher_id:''});setOpen(true)}
  const openEdit=(s:any)=>{setEditing(s);setForm({name:s.name,code:s.code,level:s.level||'',color:s.color||'violet',teacher_id:s.teacher_id||''});setOpen(true)}
  async function save(){if(!form.name.trim())return;setBusy(true);const p={name:form.name.trim(),code:form.code.toUpperCase(),level:form.level||null,color:form.color,teacher_id:form.teacher_id||null};if(editing)await supabase.from('subjects').update(p).eq('id',editing.id);else await supabase.from('subjects').insert(p);setBusy(false);setOpen(false);reload()}
  async function del(id:string){if(!confirm('Delete subject?'))return;await supabase.from('subjects').delete().eq('id',id);reload()}
  return(
    <div className="animate-fu">
      <div className="flex items-center justify-between mb-5"><div><h1 className="text-xl font-semibold text-gray-900">Subjects</h1><p className="text-sm text-gray-400 mt-0.5">{subjects.length} courses</p></div><button onClick={openAdd} className="btn-primary"><Plus className="w-4 h-4"/> Add Subject</button></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.map((s:any)=>{
          const teacher=profiles.find((p:any)=>p.id===s.teacher_id)
          const enrolled=students.filter((st:any)=>(st.student_subjects||[]).some((ss:any)=>ss.subject_id===s.id)).length
          const fee=fees.find((f:any)=>f.subject_id===s.id)
          return(<div key={s.id} className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3"><span className={clsx('badge',colorBadge[s.color]||colorBadge.violet)}>{s.code||s.name.slice(0,3).toUpperCase()}</span><div className="flex gap-1"><button onClick={()=>openEdit(s)} className="btn btn-sm"><Edit className="w-3 h-3"/></button><button onClick={()=>del(s.id)} className="btn btn-sm btn-danger"><Trash2 className="w-3 h-3"/></button></div></div>
            <div className="font-semibold text-gray-900 mb-0.5">{s.name}</div><div className="text-xs text-gray-400 mb-4">{s.level}</div>
            <div className="space-y-1.5 text-xs"><div className="flex justify-between"><span className="text-gray-400">Teacher</span><span className="font-medium">{teacher?.full_name||'Unassigned'}</span></div><div className="flex justify-between"><span className="text-gray-400">Students</span><span className="font-medium">{enrolled}</span></div><div className="flex justify-between"><span className="text-gray-400">Monthly fee</span><span className="font-semibold text-brand-600">{fee?fmt(fee.amount):'Not set'}</span></div></div>
          </div>)
        })}
      </div>
      <Modal open={open} onClose={()=>setOpen(false)} title={editing?'Edit Subject':'Add Subject'}>
        <div className="space-y-3">
          <div><label className="label">Subject Name *</label><input className="input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="label">Code</label><input className="input" value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value}))} maxLength={5}/></div><div><label className="label">Color</label><select className="input" value={form.color} onChange={e=>setForm(f=>({...f,color:e.target.value}))}>{COLORS.map(c=><option key={c} value={c}>{c}</option>)}</select></div></div>
          <div><label className="label">Level</label><input className="input" value={form.level} onChange={e=>setForm(f=>({...f,level:e.target.value}))}/></div>
          <div><label className="label">Assign Teacher</label><select className="input" value={form.teacher_id} onChange={e=>setForm(f=>({...f,teacher_id:e.target.value}))}><option value="">— None —</option>{teachers.map((t:any)=><option key={t.id} value={t.id}>{t.full_name}</option>)}</select></div>
          <div className="flex justify-end gap-2 pt-2"><button className="btn" onClick={()=>setOpen(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy?<Loader2 className="w-4 h-4 animate-spin"/>:null}{editing?'Save':'Add'}</button></div>
        </div>
      </Modal>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════ SCHEDULE + EMAIL REMINDERS
function ScheduleTab({schedules,subjects,students,profile,perms,reload}:any){
  const supabase=sb()
  const isTeacher=profile.role==='teacher'
  const mySubjectIds=isTeacher?subjects.filter((s:any)=>s.teacher_id===profile.id).map((s:any)=>s.id):subjects.map((s:any)=>s.id)
  const visible=schedules.filter((sc:any)=>mySubjectIds.includes(sc.subject_id))
  const [open,setOpen]=useState(false);const [reminderOpen,setReminderOpen]=useState(false);const [reminderCls,setReminderCls]=useState<any>(null)
  const [form,setForm]=useState({subject_id:'',day_of_week:'Mon',start_time:'10:00',duration_minutes:60,student_ids:[] as string[]})
  const [busy,setBusy]=useState(false);const [reminderMsg,setReminderMsg]=useState('');const [sending,setSending]=useState(false);const [sentResult,setSentResult]=useState('')

  async function save(){if(!form.subject_id)return;setBusy(true);const{data:cls}=await supabase.from('class_schedules').insert({subject_id:form.subject_id,day_of_week:form.day_of_week,start_time:form.start_time,duration_minutes:form.duration_minutes}).select().single();if(cls&&form.student_ids.length)await supabase.from('schedule_students').insert(form.student_ids.map(sid=>({schedule_id:cls.id,student_id:sid})));setBusy(false);setOpen(false);reload()}
  async function del(id:string){if(!confirm('Remove class?'))return;await supabase.from('class_schedules').delete().eq('id',id);reload()}

  async function sendReminders(){
    if(!reminderCls)return;setSending(true);setSentResult('')
    const schedStudentIds=(reminderCls.schedule_students||[]).map((ss:any)=>ss.student_id)
    const sub=subjects.find((s:any)=>s.id===reminderCls.subject_id)
    const teacher=sub?.teacher_id?[sub.teacher_id]:[]
    const r=await fetch('/api/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'class_reminder',scheduleId:reminderCls.id,studentIds:schedStudentIds,teacherIds:teacher,customMessage:reminderMsg})})
    const d=await r.json()
    setSending(false);setSentResult(d.ok?`✓ Sent ${d.sent} email${d.sent!==1?'s':''}${d.dev?' (console mode — add RESEND_API_KEY to actually send)':''}`:`Error: ${d.error}`)
  }

  const subById=(id:string)=>subjects.find((s:any)=>s.id===id)
  return(
    <div className="animate-fu">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-xl font-semibold text-gray-900">{isTeacher?'My Schedule':'Class Schedule'}</h1><p className="text-sm text-gray-400 mt-0.5">Weekly timetable</p></div>
        {!isTeacher&&<button onClick={()=>setOpen(true)} className="btn-primary"><Plus className="w-4 h-4"/> Add Class</button>}
      </div>
      <div className="card overflow-hidden mb-5"><div className="overflow-x-auto"><table className="w-full text-xs" style={{minWidth:600}}>
        <thead><tr><th className="th w-16 bg-gray-50">Time</th>{DAYS.map(d=><th key={d} className="th bg-gray-50 text-center">{d}</th>)}</tr></thead>
        <tbody>{TIMES.map(time=><tr key={time}><td className="td text-gray-400 bg-gray-50/60 text-center font-mono">{time}</td>{DAYS.map(day=>{const cls=visible.filter((sc:any)=>sc.day_of_week===day&&sc.start_time?.slice(0,5)===time);return<td key={day} className="td align-top" style={{minHeight:40}}>{cls.map((c:any)=>{const sub=subById(c.subject_id);return sub?<div key={c.id} className={clsx('rounded px-1.5 py-1 mb-0.5 text-xs font-medium cursor-pointer hover:opacity-80',colorCell[sub.color]||colorCell.violet)} onClick={()=>{setReminderCls(c);setReminderOpen(true);setSentResult('')}}>{sub.code} {c.duration_minutes}m <Mail className="w-2.5 h-2.5 inline opacity-60"/></div>:null})}</td>})}</tr>)}</tbody>
      </table></div></div>
      <div className="card">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between"><span className="text-sm font-medium text-gray-700">All Classes</span><span className="text-xs text-gray-400">Click a cell above to send reminders</span></div>
        <table className="w-full">
          <thead><tr><th className="th">Subject</th><th className="th">Day</th><th className="th">Time</th><th className="th">Duration</th><th className="th">Students</th><th className="th w-28">Actions</th></tr></thead>
          <tbody>
            {visible.map((c:any)=>{const sub=subById(c.subject_id);const stuNames=(c.schedule_students||[]).map((ss:any)=>{const s=students.find((st:any)=>st.id===ss.student_id);return s?.full_name?.split(' ')[0]||''}).filter(Boolean);return(
              <tr key={c.id} className="hover:bg-gray-50/50">
                <td className="td">{sub&&<span className={clsx('badge',colorBadge[sub.color]||colorBadge.violet)}>{sub.name}</span>}</td>
                <td className="td font-medium">{c.day_of_week}</td>
                <td className="td font-mono">{c.start_time?.slice(0,5)}</td>
                <td className="td text-gray-400">{c.duration_minutes}m</td>
                <td className="td"><div className="flex flex-wrap gap-1">{stuNames.map((n:string,i:number)=><span key={i} className="badge bg-gray-100 text-gray-600">{n}</span>)}{!stuNames.length&&<span className="text-gray-300">—</span>}</div></td>
                <td className="td"><div className="flex gap-1">
                  <button onClick={()=>{setReminderCls(c);setReminderOpen(true);setSentResult('')}} className="btn btn-sm text-brand-600 border-brand-200 hover:bg-brand-50" title="Send reminders"><Mail className="w-3 h-3"/> Remind</button>
                  {!isTeacher&&<button onClick={()=>del(c.id)} className="btn btn-sm btn-danger"><Trash2 className="w-3 h-3"/></button>}
                </div></td>
              </tr>
            )})}
            {!visible.length&&<tr><td colSpan={6} className="td text-center text-gray-300 py-8">No classes</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Email reminder modal */}
      <Modal open={reminderOpen} onClose={()=>setReminderOpen(false)} title="Send Class Reminders" wide>
        {reminderCls&&(()=>{
          const sub=subById(reminderCls.subject_id)
          const schedStudents=(reminderCls.schedule_students||[]).map((ss:any)=>students.find((st:any)=>st.id===ss.student_id)).filter(Boolean)
          const teacher=sub?.teacher_id?subjects.find((s:any)=>s.id===reminderCls.subject_id):null
          return(
            <div className="space-y-4">
              <div className="bg-brand-50 rounded-xl p-4 text-sm">
                <div className="font-semibold text-brand-700 mb-2">📧 Reminder for: {sub?.name}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-gray-400">Day/Time: </span><strong>{reminderCls.day_of_week} at {reminderCls.start_time?.slice(0,5)}</strong></div>
                  <div><span className="text-gray-400">Duration: </span><strong>{reminderCls.duration_minutes} min</strong></div>
                </div>
              </div>
              <div>
                <div className="label mb-2">Recipients</div>
                <div className="space-y-1">
                  {schedStudents.map((s:any)=><div key={s.id} className="flex items-center justify-between text-sm px-3 py-1.5 bg-gray-50 rounded-lg">
                    <span>{s.full_name}</span>
                    <span className="text-xs text-gray-400">{s.email||<span className="text-red-400">No email</span>}</span>
                  </div>)}
                  {!schedStudents.length&&<div className="text-sm text-gray-400 px-3 py-2">No students assigned to this class</div>}
                </div>
              </div>
              <div>
                <label className="label">Custom Note (optional)</label>
                <textarea className="input" rows={2} placeholder="e.g. Please bring your instrument. Class is online today." value={reminderMsg} onChange={e=>setReminderMsg(e.target.value)}/>
              </div>
              {sentResult&&<div className={clsx('px-3 py-2 rounded-lg text-sm',sentResult.startsWith('✓')?'bg-emerald-50 text-emerald-700 border border-emerald-100':'bg-red-50 text-red-600')}>{sentResult}</div>}
              <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
                <strong>Email setup:</strong> Add <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> to your Vercel environment variables to send real emails. Without it, emails are logged to console. Get a free key at <a href="https://resend.com" target="_blank" className="text-brand-500 underline">resend.com</a> (100 emails/day free).
              </div>
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

      {!isTeacher&&<Modal open={open} onClose={()=>setOpen(false)} title="Schedule Class" wide>
        <div className="space-y-3">
          <div><label className="label">Subject *</label><select className="input" value={form.subject_id} onChange={e=>setForm(f=>({...f,subject_id:e.target.value}))}><option value="">— Select —</option>{subjects.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Day</label><select className="input" value={form.day_of_week} onChange={e=>setForm(f=>({...f,day_of_week:e.target.value}))}>{DAYS.map(d=><option key={d}>{d}</option>)}</select></div>
            <div><label className="label">Start Time</label><select className="input" value={form.start_time} onChange={e=>setForm(f=>({...f,start_time:e.target.value}))}>{TIMES.map(t=><option key={t}>{t}</option>)}</select></div>
            <div><label className="label">Duration (min)</label><input className="input" type="number" min={15} step={15} value={form.duration_minutes} onChange={e=>setForm(f=>({...f,duration_minutes:+e.target.value}))}/></div>
          </div>
          <div><label className="label">Students</label><div className="grid grid-cols-2 gap-1.5 mt-1 max-h-40 overflow-y-auto">{students.map((s:any)=><label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.student_ids.includes(s.id)} onChange={()=>setForm(f=>({...f,student_ids:f.student_ids.includes(s.id)?f.student_ids.filter(x=>x!==s.id):[...f.student_ids,s.id]}))} className="rounded border-gray-300"/>{s.full_name}</label>)}</div></div>
          <div className="flex justify-end gap-2 pt-2"><button className="btn" onClick={()=>setOpen(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy?<Loader2 className="w-4 h-4 animate-spin"/>:null}Schedule</button></div>
        </div>
      </Modal>}
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
function PaymentsTab({payments,students,subjects,fees,perms,reload}:any){
  const supabase=sb()
  const [tab,setTab]=useState('all');const [open,setOpen]=useState(false);const [importOpen,setImportOpen]=useState(false)
  const [invoice,setInvoice]=useState<any>(null);const [reminder,setReminder]=useState<any>(null)
  const [form,setForm]=useState({student_id:'',subject_id:'',month_label:'',amount:'',payment_date:'',mode_of_payment:'UPI',receipt_number:'',invoice_number:'',description:'',notes:''})
  const [busy,setBusy]=useState(false);const [importResult,setImportResult]=useState('');const [q,setQ]=useState('')
  const months=Array.from({length:12},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-i);return d.toLocaleString('en-IN',{month:'long',year:'numeric'})})
  const filtered=(tab==='all'?payments:payments.filter((p:any)=>p.status===tab)).filter((p:any)=>{const name=(p.students?.full_name||p.student_name||'').toLowerCase();return name.includes(q.toLowerCase())||p.receipt_number?.includes(q)||p.invoice_number?.includes(q)})
  const paid=payments.filter((p:any)=>p.status==='paid').reduce((a:number,p:any)=>a+p.amount,0)
  const pending=payments.filter((p:any)=>p.status==='pending').reduce((a:number,p:any)=>a+p.amount,0)
  const failed=payments.filter((p:any)=>p.status==='failed').length

  async function markPaid(id:string){await supabase.from('payments').update({status:'paid',payment_date:new Date().toISOString().slice(0,10)}).eq('id',id);reload()}

  async function save(){
    if(!form.student_id||!form.amount)return;setBusy(true)
    await supabase.from('payments').insert({student_id:form.student_id,subject_id:form.subject_id||null,amount:+form.amount,payment_date:form.payment_date||new Date().toISOString().slice(0,10),status:'paid',month_label:form.month_label||months[0],mode_of_payment:form.mode_of_payment,receipt_number:form.receipt_number||null,invoice_number:form.invoice_number||null,description:form.description||null,notes:form.notes||null})
    setBusy(false);setOpen(false);reload()
  }

  async function handleImport(rows:any[]){
    setBusy(true);let ok=0,fail=0,skip=0
    for(const row of rows){
      const mapped=mapPayment(row)
      if(!mapped.amount||mapped.amount<=0){skip++;continue}
      // Try to match student by student_id_ext or email
      let studentId=null
      if(mapped.student_id_ext){const{data:s}=await supabase.from('students').select('id').eq('student_id_ext',mapped.student_id_ext).single();studentId=s?.id}
      if(!studentId&&mapped.student_email){const{data:s}=await supabase.from('students').select('id').eq('email',mapped.student_email).single();studentId=s?.id}
      const payload={...mapped,student_id:studentId||null}
      const{error}=await supabase.from('payments').insert(payload)
      if(error){console.error(mapped.student_name,error.message);fail++}else ok++
    }
    setBusy(false);setImportResult(`✓ ${ok} payments imported${fail>0?`, ${fail} failed`:''}${skip>0?`, ${skip} skipped`:''}`);setImportOpen(false);reload()
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
          {perms.managePayments&&<button onClick={()=>setOpen(true)} className="btn-primary"><Plus className="w-4 h-4"/> Record</button>}
        </div>
      </div>
      {importResult&&<div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-100">{importResult}</div>}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="card p-4 bg-emerald-50 border-emerald-100"><div className="text-xs text-emerald-600 mb-1">Collected</div><div className="text-xl font-semibold text-emerald-700">{fmt(paid)}</div></div>
        <div className="card p-4 bg-amber-50 border-amber-100"><div className="text-xs text-amber-600 mb-1">Pending</div><div className="text-xl font-semibold text-amber-700">{fmt(pending)}</div></div>
        <div className="card p-4 bg-red-50 border-red-100"><div className="text-xs text-red-500 mb-1">Failed Txns</div><div className="text-xl font-semibold text-red-600">{failed}</div></div>
        <div className="card p-4 bg-blue-50 border-blue-100"><div className="text-xs text-blue-600 mb-1">Total Records</div><div className="text-xl font-semibold text-blue-700">{payments.length}</div></div>
      </div>
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
                    {(p.status==='pending'||p.status==='overdue')&&<button onClick={()=>setReminder(p)} className="btn btn-sm" title="Email reminder"><Mail className="w-3.5 h-3.5 text-amber-500"/></button>}
                    {p.status==='paid'&&<button onClick={()=>setInvoice(p)} className="btn btn-sm" title="Invoice"><FileText className="w-3.5 h-3.5 text-gray-400"/></button>}
                  </div></td>
                </tr>
              ))}
              {!filtered.length&&<tr><td colSpan={9} className="td text-center text-gray-300 py-8">No payments</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record payment */}
      <Modal open={open} onClose={()=>setOpen(false)} title="Record Payment" wide>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="label">Student *</label><select className="input" value={form.student_id} onChange={e=>setForm(f=>({...f,student_id:e.target.value}))}><option value="">— Select student —</option>{students.map((s:any)=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
          <div><label className="label">Subject</label><select className="input" value={form.subject_id} onChange={e=>{const fee=fees.find((f:any)=>f.subject_id===e.target.value);setForm(f=>({...f,subject_id:e.target.value,amount:fee?String(fee.amount):f.amount}))}}><option value="">— Select —</option>{subjects.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="label">Amount (₹) *</label><input className="input" type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="Auto-fills from fee"/></div>
          <div><label className="label">Month</label><select className="input" value={form.month_label} onChange={e=>setForm(f=>({...f,month_label:e.target.value}))}>{months.map(m=><option key={m}>{m}</option>)}</select></div>
          <div><label className="label">Payment Date</label><input className="input" type="date" value={form.payment_date} onChange={e=>setForm(f=>({...f,payment_date:e.target.value}))}/></div>
          <div><label className="label">Mode of Payment</label><select className="input" value={form.mode_of_payment} onChange={e=>setForm(f=>({...f,mode_of_payment:e.target.value}))}>{PAY_MODES.map(m=><option key={m}>{m}</option>)}</select></div>
          <div><label className="label">Receipt #</label><input className="input" value={form.receipt_number} onChange={e=>setForm(f=>({...f,receipt_number:e.target.value}))}/></div>
          <div><label className="label">Invoice #</label><input className="input" value={form.invoice_number} onChange={e=>setForm(f=>({...f,invoice_number:e.target.value}))}/></div>
          <div className="col-span-2"><label className="label">Description</label><input className="input" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Optional"/></div>
        </div>
        <div className="flex justify-end gap-2 pt-4"><button className="btn" onClick={()=>setOpen(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy?<Loader2 className="w-4 h-4 animate-spin"/>:null}Record Payment</button></div>
      </Modal>

      {/* Import payments */}
      <Modal open={importOpen} onClose={()=>setImportOpen(false)} title="Import Payments from CSV" wide>
        <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">Payments will be matched to students by Student ID or Email. Unmatched payments are still imported but not linked to a student profile.</div>
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
