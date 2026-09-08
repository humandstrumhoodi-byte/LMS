import { redirect } from 'next/navigation'
import { serverSB } from '@/lib/server'
import PayrollManagement from '@/components/PayrollManagement'

export default async function PayrollPage() {
  const supabase = await serverSB()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['superadmin', 'center_manager'].includes(profile.role)) redirect('/dashboard')
  return <PayrollManagement profile={profile} />
}
