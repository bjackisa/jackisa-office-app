'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

export default function VerifyPage() {
  const router = useRouter()
  const params = useSearchParams()
  const [status, setStatus] = useState<'verifying' | 'ready' | 'error' | 'completing' | 'done'>('verifying')
  const [message, setMessage] = useState<string>('Verifying your email...')

  useEffect(() => {
    const run = async () => {
      try {
        const tokenHash = params.get('token_hash')
        const type = (params.get('type') || 'signup') as 'signup' | 'invite' | 'email_change' | 'recovery'
        const code = params.get('code')

        // Try verify via token_hash if present
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash })
          if (error) throw error
        } else if (code) {
          // In some flows code is present (PKCE); exchange for session
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        }

        // Confirm session exists
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('No active session after verification')

        setStatus('ready')
        setMessage('Email verified. Finalizing your account...')

        // Complete registration with pending data
        setStatus('completing')
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

        // Cleanup and route
        try { localStorage.removeItem('pendingRegistration') } catch {}
        setStatus('done')
        setMessage('All set! Redirecting to app...')
        router.push('/app')
      } catch (err: any) {
        console.error(err)
        setStatus('error')
        setMessage(err?.message || 'Verification failed. Please try again.')
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="bg-card border border-border rounded-lg p-8 w-full max-w-md text-center">
        {(status === 'verifying' || status === 'completing') && (
          <div className="flex items-center justify-center gap-3">
            <Spinner />
            <p className="text-foreground">{message}</p>
          </div>
        )}
        {(status === 'ready' || status === 'done') && (
          <p className="text-foreground">{message}</p>
        )}
        {status === 'error' && (
          <div>
            <p className="text-destructive mb-4">{message}</p>
            <Button onClick={() => router.push('/auth/login')}>Back to Login</Button>
          </div>
        )}
      </div>
    </div>
  )
}
