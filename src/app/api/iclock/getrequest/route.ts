// Device polls this periodically asking "any commands for me?" (e.g. reboot,
// reload user data, clear log). We don't queue any device commands from the
// app today, so we always say "nothing to do" — returning anything else here
// makes the device try to execute it as a shell command.
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
}
