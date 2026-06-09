'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/client'
import { Music, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail]     = useState('')
  const [pass,  setPass]      = useState('')
  const [show,  setShow]      = useState(false)
  const [err,   setErr]       = useState('')
  const [busy,  setBusy]      = useState(false)
  const router = useRouter()

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    const { error } = await sb().auth.signInWithPassword({ email, password: pass })
    if (error) { setErr(error.message); setBusy(false) }
    else { router.push('/dashboard'); router.refresh() }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 p-4">
      <div className="w-full max-w-sm">
        {/* logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 mb-4">
            <Music className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-white">Academy LMS</h1>
          <p className="text-white/60 text-sm mt-1">Sign in to your workspace</p>
        </div>

        <div className="card p-7">
          {err && <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100">{err}</div>}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="you@academy.com" value={email} onChange={e=>setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input className="input pr-10" type={show?'text':'password'} placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)} required />
                <button type="button" onClick={()=>setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {show ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                </button>
              </div>
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full justify-center py-2.5 mt-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : null}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        {/* role pills */}
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[['SuperAdmin','Full access'],['Center Mgr','Operations'],['Teacher','My schedule']].map(([r,d])=>(
            <div key={r} className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-3">
              <div className="text-white text-xs font-medium">{r}</div>
              <div className="text-white/50 text-xs mt-0.5">{d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
