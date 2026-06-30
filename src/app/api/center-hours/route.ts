import { NextRequest, NextResponse } from 'next/server'
import { serverSB, serviceSB } from '@/lib/server'

async function checkSuperadmin() {
  const s = await serverSB()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return null
  const { data: profile } = await s.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return null
  return user
}

export async function GET() {
  const svc = await serviceSB()
  const { data } = await svc.from('center_hours').select('*').order('day_of_week')
  return NextResponse.json({ ok: true, hours: data || [] })
}

export async function POST(req: NextRequest) {
  const user = await checkSuperadmin()
  if (!user) return NextResponse.json({ error: 'Only superadmin can set center hours' }, { status: 403 })

  const svc = await serviceSB()
  const { hours } = await req.json() // array of { day_of_week, open_time, close_time, is_closed }

  for (const h of hours) {
    await svc.from('center_hours').upsert({
      day_of_week: h.day_of_week,
      open_time: h.open_time,
      close_time: h.close_time,
      is_closed: h.is_closed || false,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'day_of_week' })
  }

  return NextResponse.json({ ok: true })
}
