import { redirect } from 'next/navigation'
import { serverSB } from '@/lib/server'
import LeaveManagement from '@/components/LeaveManagement'

export default async function LeavePage() {
  const supabase = await serverSB()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/dashboard')
  return <LeaveManagement profile={profile} />
}
