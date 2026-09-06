// ZKTeco ADMS "push" protocol — the K40 Pro (with ADMS/Cloud server enabled
// in Comm settings) calls this endpoint directly, with NO auth headers of
// its own kind — the protocol predates that. We gate on the device serial
// number (?SN=...) matching a row in biometric_devices instead.
//
//   GET  /api/iclock/cdata?SN=xxx&options=all   — device handshake on boot/reconnect
//   POST /api/iclock/cdata?SN=xxx&table=ATTLOG  — device pushes punch records (body = plain text, one per line)
//   POST /api/iclock/cdata?SN=xxx&table=OPERLOG — device pushes admin-side operation logs (user add/edit on the device itself)
//
// Responses must be `text/plain` — the device firmware parses them as
// key=value lines (GET) or a bare status word (POST), not JSON.
import { NextRequest } from 'next/server'
import { serviceSB } from '@/lib/server'
import { ingestAttlog } from '@/lib/adms'

export const dynamic = 'force-dynamic'

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })
}

async function touchDevice(sn: string, ip: string | null) {
  const svc = await serviceSB()
  await svc.from('biometric_devices')
    .update({ last_seen_at: new Date().toISOString(), last_ip: ip })
    .eq('serial_number', sn)
}

async function isKnownDevice(sn: string): Promise<boolean> {
  if (!sn) return false
  const svc = await serviceSB()
  const { data } = await svc.from('biometric_devices')
    .select('id').eq('serial_number', sn).eq('is_active', true).maybeSingle()
  return !!data
}

// Device boot/handshake — tells the device how often to talk to us.
// We keep it permissive (short intervals) since this is a single low-traffic device.
export async function GET(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get('SN') || ''
  const ip = req.headers.get('x-forwarded-for')

  if (!(await isKnownDevice(sn))) {
    // Unknown device — respond OK anyway so we don't leak which SNs are valid,
    // but don't touch last_seen_at or accept its data elsewhere.
    return text('OK')
  }
  await touchDevice(sn, ip)

  const body = [
    `GET OPTION FROM: ${sn}`,
    'Stamp=9999',
    'OpStamp=9999',
    'ErrorDelay=30',
    'Delay=10',
    'TransFlag=TransData AttLog\tOpLog',
    'TransInterval=1',
    'TimeZone=5.5',
    'Realtime=1',
    'Encrypt=None',
  ].join('\n')
  return text(body)
}

// Device pushing data — ATTLOG (punches) is what we care about.
export async function POST(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get('SN') || ''
  const table = (req.nextUrl.searchParams.get('table') || '').toUpperCase()
  const raw = await req.text()

  if (!(await isKnownDevice(sn))) {
    // Still ack with OK — returning an error makes some firmware retry forever.
    return text('OK')
  }
  await touchDevice(sn, req.headers.get('x-forwarded-for'))

  if (table === 'ATTLOG') {
    const { inserted } = await ingestAttlog(sn, raw)
    return text(`OK: ${inserted}`)
  }

  // OPERLOG and anything else — accepted but not processed yet.
  return text('OK')
}
