import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function serverSB() {
  const c = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => c.getAll(),
        setAll: (cs: { name: string; value: string; options?: any }[]) => {
          try { cs.forEach(({ name, value, options }) => c.set(name, value, options)) } catch {}
        }
      }
    }
  )
}

export async function serviceSB() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set in environment variables. Add it to Vercel → Settings → Environment Variables.')
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}
