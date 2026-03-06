'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

export const dynamic = 'force-dynamic'

type VerifyStatus = 'verifying' | 'waiting' | 'completing' | 'done' | 'error'

function VerifyInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [status, setStatus] = useState<VerifyStatus>('verifying')
  const [message, setMessage] = useState<string>('Verifying your email...')
  const [pendingEmail, setPendingEmail] = useState<string>('')

  useEffect(() => {
    const run = async () => {
      try {
        const mode = params.get('mode')
        const tokenHash = params.get('token_hash')
        const code = params.get('code')

        if (mode === 'check-email' && !tokenHash && !code) {
          let savedEmail = ''
          try {
            const raw = localStorage.getItem('pendingRegistration')
            if (raw) {
              const pending = JSON.parse(raw)
              savedEmail = pending?.email || ''
            }
          } catch {}

          setPendingEmail(savedEmail)
          setStatus('waiting')
          setMessage('Registration successful. Please check your inbox and click the verification link to complete setup.')
          return
        }

        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash })
          if (error) throw error
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setStatus('waiting')
          setMessage('Your email is not verified in this browser session yet. Please sign in after verification.')
          return
        }

        setStatus('completing')
        setMessage('Email verified. Finalizing your account...')

        let payload: any = null
        try {
          const raw = localStorage.getItem('pendingRegistration')
          if (raw) payload = JSON.parse(raw)
        } catch {}

        const res = await fetch('/api/register/complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload || {}),
        })

        if (!res.ok) {
          const t = await res.text()
          throw new Error(t || 'Failed to complete registration')
        }

        try { localStorage.removeItem('pendingRegistration') } catch {}
        setStatus('done')
        setMessage('All set! Redirecting to dashboard...')
        router.replace('/app')
      } catch (err: any) {
        console.error(err)
        setStatus('error')
        setMessage(err?.message || 'Verification failed. Please try again.')
      }
    }

    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleResend = async () => {
    try {
      let email = pendingEmail
      if (!email) {
        const raw = localStorage.getItem('pendingRegistration')
        if (raw) {
          const pending = JSON.parse(raw)
          email = pending?.email || ''
        }
      }

      if (!email) {
        setStatus('error')
        setMessage('Missing pending email. Please register again.')
        return
      }

      const { error } = await supabase.auth.resend({ type: 'signup', email })
      if (error) throw error
      setMessage(`Verification email sent to ${email}.`)
      setPendingEmail(email)
      setStatus('waiting')
    } catch (e: any) {
      setStatus('error')
      setMessage(e?.message || 'Failed to resend verification email.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 dot-pattern opacity-20" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl" />
      <div className="bg-card border border-border/50 rounded-2xl shadow-elevated p-8 w-full max-w-md text-center space-y-5 relative animate-fade-in">
        {(status === 'verifying' || status === 'completing') && (
          <div className="flex items-center justify-center gap-3">
            <Spinner />
            <p className="text-foreground text-sm font-medium">{message}</p>
          </div>
        )}

        {(status === 'waiting' || status === 'done') && (
          <>
            <p className="text-foreground text-sm leading-relaxed">{message}</p>
            {pendingEmail && <p className="text-sm text-muted-foreground/60">Pending email: <span className="font-medium text-foreground">{pendingEmail}</span></p>}
            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={handleResend}>Resend Email</Button>
              <Button onClick={() => router.push('/auth/login')} className="shadow-glow-primary">Go to Login</Button>
            </div>
          </>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-destructive/10 mx-auto">
              <svg className="w-6 h-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            </div>
            <p className="text-destructive text-sm">{message}</p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={handleResend}>Resend Email</Button>
              <Button asChild className="shadow-glow-primary"><Link href="/auth/login">Back to Login</Link></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="bg-card border border-border/50 rounded-2xl shadow-elevated p-8 w-full max-w-md text-center">
            <div className="flex items-center justify-center gap-3">
              <Spinner />
              <p className="text-foreground text-sm font-medium">Preparing verification...</p>
            </div>
          </div>
        </div>
      }
    >
      <VerifyInner />
    </Suspense>
  )
}
