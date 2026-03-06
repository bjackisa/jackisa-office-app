'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle, Lock } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

export const dynamic = 'force-dynamic'

function ResetPasswordInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const init = async () => {
      try {
        const code = params.get('code')
        if (code) {
          await supabase.auth.exchangeCodeForSession(code)
        }
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          setSessionReady(true)
        } else {
          setError('Invalid or expired reset link. Please request a new one.')
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to verify reset link')
      } finally {
        setChecking(false)
      }
    }
    init()
  }, [params])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!password || !confirmPassword) {
        setError('Please fill in both fields')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters')
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }

      setSuccess(true)
      setTimeout(() => router.push('/app'), 2000)
    } catch (err) {
      setError('An unexpected error occurred')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="bg-card border border-border/50 rounded-2xl shadow-elevated p-8 w-full max-w-md text-center animate-fade-in">
          <div className="flex items-center justify-center gap-3">
            <Spinner />
            <p className="text-foreground text-sm font-medium">Verifying reset link...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 dot-pattern opacity-20" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl" />
      <div className="w-full max-w-md relative animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 p-3 mb-5 ring-1 ring-primary/20">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1.5 tracking-tight">New Password</h1>
          <p className="text-muted-foreground text-sm">Enter your new password below</p>
        </div>

        <div className="bg-card rounded-2xl shadow-elevated border border-border/50 p-8">
          {success ? (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 mb-5">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <h2 className="text-base font-semibold text-foreground mb-2">Password Updated</h2>
              <p className="text-sm text-muted-foreground">Redirecting to your dashboard...</p>
            </div>
          ) : !sessionReady ? (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-destructive/10 mb-5">
                <AlertCircle className="w-7 h-7 text-destructive" />
              </div>
              <p className="text-sm text-destructive mb-5">{error}</p>
              <Link href="/auth/forgot-password">
                <Button className="w-full shadow-glow-primary">Request New Reset Link</Button>
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-6 flex items-center gap-3 rounded-xl bg-destructive/[0.06] border border-destructive/15 p-4 text-destructive">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-foreground mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pl-10"
                      disabled={loading}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground/50 mt-1.5">At least 8 characters</p>
                </div>

                <div>
                  <label htmlFor="confirm" className="block text-sm font-semibold text-foreground mb-2">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <Input
                      id="confirm"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="pl-10"
                      disabled={loading}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 text-sm font-semibold shadow-glow-primary"
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="bg-card border border-border/50 rounded-2xl shadow-elevated p-8 w-full max-w-md text-center">
            <div className="flex items-center justify-center gap-3">
              <Spinner />
              <p className="text-foreground text-sm font-medium">Loading...</p>
            </div>
          </div>
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  )
}
