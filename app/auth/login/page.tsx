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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/5 p-4">
      <div className="w-full max-w-md">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-[#0a1628] p-2 mb-4">
            <img
              src="https://res.cloudinary.com/dsijcu1om/image/upload/v1772089694/2_en3tei.png"
              alt="Jackisa Office logo"
              className="h-full w-full object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Jackisa Office</h1>
          <p className="text-muted-foreground">Sign in to your account</p>
        </div>

        {/* Login Card */}
        <div className="bg-card rounded-lg shadow-lg border border-border p-8">
          {info && (
            <div className="mb-6 rounded-lg border border-border bg-primary/10 p-4 text-foreground">
              <p className="text-sm">{info}</p>
            </div>
          )}
          {error && (
            <div className="mb-6 flex items-gap-3 rounded-lg bg-destructive/10 p-4 text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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
            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  defaultChecked
                />
                <span className="text-sm text-foreground">Remember me</span>
              </label>
              <Link href="/auth/forgot-password" className="text-sm text-primary hover:underline">
                Forgot password?
              </Link>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 text-base font-medium"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-card text-muted-foreground">or</span>
            </div>
          </div>

          {/* Sign Up Link */}
          <p className="text-center text-sm text-foreground">
            Don't have an account?{' '}
            <Link href="/auth/register" className="text-primary hover:underline font-medium">
              Sign up here
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          By signing in, you agree to our{' '}
          <Link href="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  )
}
