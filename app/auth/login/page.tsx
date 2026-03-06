'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, Lock, Mail } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  const redirectAfterAuth = useCallback(async () => {
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      setCheckingAuth(false)
      return
    }

    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile) {
      const fallbackName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
      await supabase
        .from('users')
        .upsert(
          { id: user.id, email: user.email || '', full_name: fallbackName, role: 'company_admin' },
          { onConflict: 'id' }
        )
    }

    const { data: employee } = await supabase
      .from('company_employees')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    router.replace(employee ? '/app' : '/auth/verify?mode=complete-profile')
  }, [router])

  useEffect(() => {
    const checkSession = async () => {
      await redirectAfterAuth()
      setCheckingAuth(false)
    }

    checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        redirectAfterAuth()
      }
    })

    return () => subscription.unsubscribe()
  }, [redirectAfterAuth])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!email || !password) {
        setError('Please enter your email and password')
        return
      }
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (authError) {
        const msg = authError.message || 'Login failed'
        // Normalize common cases
        if (/confirm|verified|confirm your email/i.test(msg)) {
          setError('Email not confirmed. Please verify your email to continue.')
        } else if (/invalid login credentials/i.test(msg)) {
          setError('Invalid email or password')
        } else {
          setError(msg)
        }
        return
      }

      await redirectAfterAuth()
    } catch (err) {
      setError('An unexpected error occurred')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    try {
      if (!email) {
        setError('Enter your email to resend verification')
        return
      }
      const { error } = await supabase.auth.resend({ type: 'signup', email })
      if (error) {
        setError(error.message)
        return
      }
      setError(null)
      setInfo('Verification email sent. Please check your inbox. After verifying, return here to sign in.')
    } catch (e) {
      setError('Failed to resend verification email')
    }
  }

  if (checkingAuth) {
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 dot-pattern opacity-20" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl" />
      <div className="w-full max-w-md relative animate-fade-in">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[hsl(224,40%,8%)] p-2 mb-5 ring-1 ring-white/10 shadow-elevated">
            <img
              src="https://res.cloudinary.com/dsijcu1om/image/upload/v1772089694/2_en3tei.png"
              alt="Jackisa Office logo"
              className="h-full w-full object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1.5 tracking-tight">Welcome back</h1>
          <p className="text-muted-foreground text-sm">Sign in to your Jackisa Office account</p>
        </div>

        {/* Login Card */}
        <div className="bg-card rounded-2xl shadow-elevated border border-border/50 p-8">
          {info && (
            <div className="mb-6 rounded-xl border border-primary/20 bg-primary/[0.06] p-4 text-foreground">
              <p className="text-sm">{info}</p>
            </div>
          )}
          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-xl bg-destructive/[0.06] border border-destructive/15 p-4 text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-foreground mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-foreground mb-2">
                Password
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
            </div>

            {/* Remember & Forgot */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded-md border-border w-4 h-4"
                  defaultChecked
                />
                <span className="text-sm text-muted-foreground">Remember me</span>
              </label>
              <Link href="/auth/forgot-password" className="text-sm text-primary font-medium hover:text-primary/80 transition-colors">
                Forgot password?
              </Link>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 text-sm font-semibold shadow-glow-primary"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-7">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-card text-muted-foreground/50 text-xs">or</span>
            </div>
          </div>

          {/* Sign Up Link */}
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/auth/register" className="text-primary font-semibold hover:text-primary/80 transition-colors">
              Create account
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50 mt-8">
          By signing in, you agree to our{' '}
          <Link href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
            Terms of Service
          </Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  )
}
