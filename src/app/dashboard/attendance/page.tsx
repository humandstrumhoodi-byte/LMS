import { redirect } from 'next/navigation'
import { serverSB } from '@/lib/server'
import AttendanceBiometric from '@/components/AttendanceBiometric'

export default async function AttendancePage() {
  const supabase = await serverSB()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['superadmin', 'center_manager'].includes(profile.role)) redirect('/dashboard')
  return <AttendanceBiometric />
}
