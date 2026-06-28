import { redirect } from 'next/navigation'
import { serverSB } from '@/lib/server'
import DashboardShell from '@/components/DashboardShell'

export default async function DashboardPage() {
  const supabase = await serverSB()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')
  return <DashboardShell profile={profile} />
}
