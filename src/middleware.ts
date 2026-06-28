import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Role } from '@/types'

const GUARD: Record<string, Role[]> = {
  '/dashboard/users':    ['superadmin'],
  '/dashboard/fees':     ['superadmin', 'center_manager'],
  '/dashboard/payments': ['superadmin', 'center_manager'],
  '/dashboard/teachers': ['superadmin', 'center_manager'],
  '/dashboard/students': ['superadmin', 'center_manager'],
  '/dashboard/subjects': ['superadmin', 'center_manager'],
  '/dashboard/schedule': ['superadmin', 'center_manager', 'teacher'],
  '/dashboard':          ['superadmin', 'center_manager', 'teacher'],
}

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cs: { name: string; value: string; options?: any }[]) => {
          cs.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          cs.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  const path = req.nextUrl.pathname
  if (!user && path.startsWith('/dashboard')) return NextResponse.redirect(new URL('/login', req.url))
  if (user && path === '/login') return NextResponse.redirect(new URL('/dashboard', req.url))
  if (user && path.startsWith('/dashboard')) {
    const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const role = p?.role as Role | undefined
    const matched = Object.keys(GUARD).filter(k => path.startsWith(k)).sort((a,b) => b.length-a.length)[0]
    if (matched && role && !GUARD[matched].includes(role))
      return NextResponse.redirect(new URL('/dashboard?denied=1', req.url))
  }
  return res
}

export const config = { matcher: ['/dashboard/:path*', '/login'] }
