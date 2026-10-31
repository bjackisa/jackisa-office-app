'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
import { AlertCircle } from 'lucide-react'

/**
 * Landing point for "Continue with Jackisa" and magic-link returns.
 * Accepts either:
 *   ?access_token=...   (from jackisa.com SSO redirect)
 *   ?token_hash=...&type=magiclink  (from a Supabase magic link)
 */
function CallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        // Supabase magic-link return: establish the session directly.
        const tokenHash = searchParams.get('token_hash')
        const type = searchParams.get('type')
        if (tokenHash && type) {
          const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any })
          if (otpErr) throw otpErr
          await finalize()
          return
        }

        const code = searchParams.get('code')
        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
          if (exErr) throw exErr
          await finalize()
          return
        }

        // Jackisa SSO return.
        const accessToken = searchParams.get('access_token')
        if (!accessToken) {
          throw new Error('No sign-in token was provided. Please try again.')
        }

        const ssoRes = await fetch('/api/auth/jackisa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken }),
        })
        const ssoJson = await ssoRes.json()
        if (!ssoJson.ok || !ssoJson.ssoToken) {
          throw new Error(ssoJson.error || 'Jackisa sign-in failed')
        }

        const exRes = await fetch('/api/auth/jackisa/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ssoToken: ssoJson.ssoToken }),
        })
        const exJson = await exRes.json()
        if (!exJson.ok) {
          throw new Error(exJson.error || 'Could not complete sign-in')
        }

        // Preferred: verify the one-time email token in place. This works on any
        // Supabase project regardless of the magic-link/PKCE setting.
        if (exJson.tokenHash && exJson.email) {
          const { error: otpErr } = await supabase.auth.verifyOtp({
            token_hash: exJson.tokenHash,
            type: (exJson.otpType || 'email') as any,
          })
          if (!otpErr) {
            await finalize()
            return
          }
          // Fall through to the magic link if the token could not be verified.
        }

        if (exJson.magicLink) {
          window.location.href = exJson.magicLink
          return
        }
        throw new Error('Could not complete sign-in')
      } catch (err: any) {
        setError(err?.message || 'Sign-in failed')
      }
    }

    const finalize = async () => {
      // Apply any remembered plan, then head to the app.
      let completedCompany = false
      try {
        const raw = localStorage.getItem('pendingRegistration')
        if (raw) {
          const pending = JSON.parse(raw)
          if (pending?.planCode || pending?.companyName) {
            const res = await fetch('/api/register/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}` },
              body: JSON.stringify(pending),
            })
            if (res.ok) {
              completedCompany = true
              try { localStorage.removeItem('pendingRegistration') } catch {}
            }
          }
        }
      } catch {}

      // A brand-new SSO user with no company yet needs to pick one — send them
      // to finish setting up rather than into an empty workspace.
      const { data: employee } = await supabase
        .from('company_employees')
        .select('id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id || '')
        .eq('status', 'active')
        .maybeSingle()

      if (completedCompany || employee) {
        router.replace('/app')
      } else {
        router.replace('/auth/verify?mode=complete-profile')
      }
    }

    run()
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-sm">
        {error ? (
          <>
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-5">
              <AlertCircle className="w-7 h-7 text-destructive" />
            </div>
            <h1 className="text-lg font-bold text-foreground mb-2">We could not sign you in</h1>
            <p className="text-sm text-muted-foreground mb-6">{error}</p>
            <a href="/auth/login" className="text-primary font-semibold text-sm">Back to sign in</a>
          </>
        ) : (
          <>
            <Spinner className="w-6 h-6 text-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Signing you in…</p>
          </>
        )}
      </div>
    </div>
  )
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner className="w-6 h-6 text-primary" /></div>}>
      <CallbackInner />
    </Suspense>
  )
}
