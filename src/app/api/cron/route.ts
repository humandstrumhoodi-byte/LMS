// Vercel Cron Job — runs daily at 7am IST (1:30am UTC)
// Configure vercel.json: { "crons": [{ "path": "/api/cron", "schedule": "30 1 * * *" }] }
import { NextRequest, NextResponse } from 'next/server'
import { serviceSB } from '@/lib/server'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || 'hum-strum-cron-2024'
  if (authHeader !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = await serviceSB()
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const today = new Date()
  const todayDay = days[today.getDay()]
  const todayStr = today.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})

  const { data: classes } = await svc
    .from('class_schedules')
    .select('*, subjects(name,code,teacher_id), schedule_students(student_id,students(full_name,email))')
    .eq('day_of_week', todayDay)
    .order('start_time')

  if (!classes?.length) return NextResponse.json({ ok:true, sent:0, message:`No classes on ${todayDay}` })

  const apiKey = process.env.RESEND_API_KEY
  let sent = 0, failed = 0

  for (const cls of classes) {
    const subject = (cls as any).subjects
    if (!subject?.teacher_id) continue
    const { data: teacher } = await svc.from('profiles').select('full_name,email').eq('id', subject.teacher_id).single()
    if (!teacher?.email) continue
    const students = ((cls as any).schedule_students||[]).map((ss:any)=>ss.students).filter(Boolean)

    const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <div style="background:#3B1F8C;padding:24px;border-radius:12px 12px 0 0">
        <h2 style="color:white;margin:0">📅 Today's Teaching Schedule</h2>
        <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:13px">Hum & Strum Music Academy</p>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p style="color:#374151">Hi <strong>${teacher.full_name}</strong>,</p>
        <p style="color:#374151">You have a class today — <strong>${todayStr}</strong></p>
        <div style="background:#f3f4f6;border-radius:10px;padding:16px;margin:16px 0">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#6b7280;font-size:13px">Subject</span><strong>${subject.name}</strong></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#6b7280;font-size:13px">Time</span><strong>${(cls.start_time as string)?.slice(0,5)} · ${cls.duration_minutes} min</strong></div>
          <div style="display:flex;justify-content:space-between"><span style="color:#6b7280;font-size:13px">Students</span><strong>${students.length} enrolled</strong></div>
        </div>
        ${students.length?`<p style="color:#6b7280;font-size:12px">Students today:</p><ul style="color:#374151;font-size:13px">${students.map((s:any)=>`<li>${s.full_name}</li>`).join('')}</ul>`:''}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
        <p style="color:#9ca3af;font-size:11px;text-align:center">Hum & Strum Music Academy · Hoodi, Bengaluru</p>
      </div></div>`

    if (apiKey) {
      const r = await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM||'Hum & Strum <noreply@humandstrum.com>',to:[teacher.email],subject:`📅 Today: ${subject.name} at ${(cls.start_time as string)?.slice(0,5)}`,html})})
      if(r.ok)sent++;else failed++
    } else { console.log(`[CRON] No RESEND_API_KEY — would email ${teacher.email}`); sent++ }
  }
  return NextResponse.json({ ok:true, sent, failed, day:todayDay, classes:classes.length })
}
