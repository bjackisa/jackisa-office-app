'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ContinueWithJackisa } from '@/components/continue-with-jackisa'
import { establishSessionFromJackisa } from '@/lib/auth/sso'
import { Spinner } from '@/components/ui/spinner'
import { Building2, GraduationCap, AlertCircle, CheckCircle2 } from 'lucide-react'

type Invite = {
  id: string
  company_id: string
  label: string | null
  department: string | null
  position: string | null
  requires_approval: boolean
  companies?: { name: string; logo_url: string | null }
}

function JoinInner() {
  const params = useSearchParams()
  const router = useRouter()
  const inviteToken = params.get('invite')
  const studentToken = params.get('student')
  const isStudent = !!studentToken

  const [loading, setLoading] = useState(true)
  const [invite, setInvite] = useState<Invite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ status: 'pending' | 'active' } | null>(null)
  const [signedIn, setSignedIn] = useState(false)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [programme, setProgramme] = useState('')
  const [studentNumber, setStudentNumber] = useState('')

  useEffect(() => {
    const load = async () => {
      const token = inviteToken || studentToken
      if (!token) {
        setError('This link is missing its invite token.')
        setLoading(false)
        return
      }

      // A "Continue with Jackisa" return carries ?access_token=...; exchange it
      // for a real session before we look up the invite.
      const accessToken = params.get('access_token')
      if (accessToken) {
        const sso = await establishSessionFromJackisa(accessToken)
        if (!sso.ok) setError(sso.error || 'Jackisa sign-in failed')
      }

      try {
        const endpoint = isStudent ? '/api/students/link' : '/api/companies/members'
        const res = await fetch(`${endpoint}?invite=${encodeURIComponent(token)}`)
        const json = await res.json()
        if (json.ok) setInvite(json.invite)
        else setError(json.error || 'This invite is not valid')
      } catch {
        setError('Could not load this invite.')
      }
      const { data } = await supabase.auth.getUser()
      setSignedIn(!!data?.user)
      if (data?.user) {
        setEmail(data.user.email || '')
        setFullName((data.user.user_metadata?.full_name as string) || '')
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteToken, studentToken])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      let userId: string | null = null
      if (!signedIn) {
        if (!email || !password || password.length < 8) {
          throw new Error('Enter an email and a password of at least 8 characters.')
        }
        const { data, error: signErr } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (signErr) throw signErr
        userId = data.user?.id || null
        if (!data.session) {
          // Email confirmation required — remember the invite so they finish later.
          localStorage.setItem('pendingInvite', JSON.stringify({ inviteToken, studentToken, fullName }))
          setDone({ status: 'pending' })
          return
        }
      }

      const endpoint = isStudent ? '/api/students/link' : '/api/companies/members'
      const body = isStudent
        ? {
            action: 'request_join',
            inviteToken: studentToken,
            companyId: invite?.company_id,
            firstName: fullName.split(' ')[0],
            lastName: fullName.split(' ').slice(1).join(' '),
            programme,
            studentNumber,
          }
        : {
            action: 'request_join',
            inviteToken,
            companyId: invite?.company_id,
            position: invite?.position || undefined,
            department: invite?.department || undefined,
          }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Could not submit your request')

      setDone({ status: json.autoApproved ? 'active' : 'pending' })
      if (json.autoApproved) {
        setTimeout(() => router.replace('/app'), 1500)
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner className="w-6 h-6 text-primary" /></div>
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 dot-pattern opacity-20" />
      <div className="w-full max-w-md relative">
        <div className="bg-card rounded-2xl shadow-elevated border border-border/50 p-8">
          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-xl bg-destructive/[0.06] border border-destructive/15 p-4 text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {done ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <h1 className="text-lg font-bold text-foreground mb-2">
                {done.status === 'active' ? 'You are in' : 'Request sent'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {done.status === 'active'
                  ? 'Welcome aboard. Taking you to your workspace…'
                  : 'An administrator will review your request. You will get an email once you are admitted.'}
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-7">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  {isStudent ? <GraduationCap className="w-7 h-7 text-primary" /> : <Building2 className="w-7 h-7 text-primary" />}
                </div>
                <h1 className="text-xl font-bold text-foreground mb-1.5">
                  {isStudent ? 'Join as a student' : 'Join the team'}
                </h1>
                {invite?.companies?.name && (
                  <p className="text-sm text-muted-foreground">
                    {invite.companies.name}
                    {invite.position ? ` · ${invite.position}` : ''}
                  </p>
                )}
              </div>

              {!signedIn && (
                <div className="mb-6">
                  <ContinueWithJackisa label="Continue with Jackisa" redirect={`${typeof window !== 'undefined' ? window.location.href : ''}`} />
                  <div className="flex items-center gap-3 my-5">
                    <div className="flex-1 h-px bg-border/60" />
                    <span className="text-[11px] text-muted-foreground/50 uppercase tracking-wide">or</span>
                    <div className="flex-1 h-px bg-border/60" />
                  </div>
                </div>
              )}

              <form onSubmit={submit} className="space-y-4">
                {!signedIn && (
                  <>
                    <Input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                    <Input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    <Input type="password" placeholder="Password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </>
                )}
                {isStudent && (
                  <>
                    <Input placeholder="Programme (e.g. BSc Computer Science)" value={programme} onChange={(e) => setProgramme(e.target.value)} />
                    <Input placeholder="Student number (optional)" value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} />
                  </>
                )}
                <Button type="submit" className="w-full h-11 font-semibold shadow-glow-primary" disabled={submitting}>
                  {submitting ? 'Sending…' : invite?.requires_approval === false ? 'Join now' : 'Request to join'}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-6">
                Already have an account?{' '}
                <Link href="/auth/login" className="text-primary font-semibold">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner className="w-6 h-6 text-primary" /></div>}>
      <JoinInner />
    </Suspense>
  )
}
