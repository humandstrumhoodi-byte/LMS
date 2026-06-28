import { NextRequest, NextResponse } from 'next/server'
import { serverSB, serviceSB } from '@/lib/server'

async function getCallerRole() {
  const s = await serverSB()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return null
  const { data } = await s.from('profiles').select('role').eq('id', user.id).single()
  return data?.role ?? null
}

export async function POST(req: NextRequest) {
  const role = await getCallerRole()
  if (!role || !['superadmin', 'center_manager'].includes(role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()

  if (role === 'center_manager' && body.role !== 'teacher')
    return NextResponse.json({ error: 'Center managers may only create teacher accounts' }, { status: 403 })

  const svc = await serviceSB()

  // Create auth user
  const { data: authData, error: authErr } = await svc.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { full_name: body.full_name, role: body.role },
  })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

  const uid = authData.user.id

  // UPSERT — works whether trigger already created the row or not
  const { error: profErr } = await svc.from('profiles').upsert({
    id: uid,
    email: body.email,
    full_name: body.full_name,
    phone: body.phone || null,
    role: body.role,
  }, { onConflict: 'id' })

  if (profErr) {
    await svc.auth.admin.deleteUser(uid)
    return NextResponse.json({ error: profErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, id: uid })
}

export async function DELETE(req: NextRequest) {
  const role = await getCallerRole()
  if (!role || !['superadmin', 'center_manager'].includes(role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const svc = await serviceSB()
  await svc.from('profiles').delete().eq('id', id)
  await svc.auth.admin.deleteUser(id)
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const callerRole = await getCallerRole()
  if (callerRole !== 'superadmin')
    return NextResponse.json({ error: 'Only superadmin can change roles' }, { status: 403 })

  const { id, role } = await req.json()
  const svc = await serviceSB()
  await svc.from('profiles').update({ role }).eq('id', id)
  return NextResponse.json({ ok: true })
}
