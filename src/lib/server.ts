import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function serverSB() {
  const c = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => c.getAll(), setAll: (cs) => { try { cs.forEach(({ name, value, options }) => c.set(name, value, options)) } catch {} } } }
  )
}

export function serviceSB() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}
