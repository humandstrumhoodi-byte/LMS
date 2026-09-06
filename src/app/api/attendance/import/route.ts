// Manual fallback for punch data — paste/upload a ZKTeco export (USB
// pendrive .dat file, or text copied from the device's attendance software)
// when ADMS push isn't set up yet, or to backfill a gap after an outage.
// Admin/manager only, authenticated via the normal browser session.
import { NextRequest, NextResponse } from 'next/server'
import { serverSB } from '@/lib/server'
import { ingestAttlog } from '@/lib/adms'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await serverSB()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['superadmin', 'center_manager'].includes(profile.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { deviceSerial, raw } = await req.json()
  if (!deviceSerial || !raw)
    return NextResponse.json({ error: 'deviceSerial and raw text are required' }, { status: 400 })

  const result = await ingestAttlog(deviceSerial, raw)
  return NextResponse.json({ ok: true, ...result })
}
