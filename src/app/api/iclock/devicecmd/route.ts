// Device reports the result of a command here (e.g. "ID=1&Return=0&CMD=INFO").
// Since we never queue commands via /iclock/getrequest, this just needs to
// exist and ack — kept as a stub so the device's phone-home never 404s.
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.text().catch(() => '')
  if (body) console.log('[iclock/devicecmd]', body)
  return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
}
