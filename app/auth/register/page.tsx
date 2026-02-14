'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, Building2, Lock, Mail, User } from 'lucide-react'

const TIERS = [
  { value: 'basic', label: 'Basic - $5/mo' },
  { value: 'pro', label: 'Pro - $15/mo' },
  { value: 'platinum', label: 'Platinum - $25/mo' },
]

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<'company' | 'account'>('company')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Company Form State
  const [companyName, setCompanyName] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')
  const [industry, setIndustry] = useState('')

  // Account Form State
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [packageTier, setPackageTier] = useState<'basic' | 'pro' | 'platinum'>('basic')
  const [couponCode, setCouponCode] = useState('')

  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyName || !companyEmail || !industry) {
      setError('Please fill in all fields')
      return
    }
    setError(null)
    try {
      const pending = {
        companyName,
        companyEmail,
        industry,
      }
      localStorage.setItem('pendingRegistration', JSON.stringify(pending))
    } catch {}
    setStep('account')
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!fullName || !email || !password || !confirmPassword) {
        setError('Please fill in all fields')
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

      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/verify`,
          data: {
            full_name: fullName,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      if (!authData.user) {
        setError('Failed to create account')
        return
      }

      try {
        const existing = localStorage.getItem('pendingRegistration')
        const base = existing ? JSON.parse(existing) : {}
        const pending = {
          ...base,
          fullName,
          email,
          packageTier,
          couponCode: couponCode.trim().toUpperCase() || null,
        }
        localStorage.setItem('pendingRegistration', JSON.stringify(pending))
      } catch {}

      router.push('/auth/verify?mode=check-email')
    } catch (err) {
      setError('An unexpected error occurred')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/5 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary mb-4">
            <Building2 className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Jackisa Office</h1>
          <p className="text-muted-foreground">Create your account</p>
        </div>

        <div className="bg-card rounded-lg shadow-lg border border-border p-8">
          {error && (
            <div className="mb-6 flex items-gap-3 rounded-lg bg-destructive/10 p-4 text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {step === 'company' ? (
            <form onSubmit={handleCompanySubmit} className="space-y-4">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-foreground">Company Information</h2>
                <p className="text-sm text-muted-foreground mt-1">Tell us about your company</p>
              </div>

              <div>
                <label htmlFor="company" className="block text-sm font-medium text-foreground mb-2">Company Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="company" placeholder="Your Company Ltd" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className="pl-10" />
                </div>
              </div>

              <div>
                <label htmlFor="comp-email" className="block text-sm font-medium text-foreground mb-2">Company Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="comp-email" type="email" placeholder="company@example.com" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} required className="pl-10" />
                </div>
              </div>

              <div>
                <label htmlFor="industry" className="block text-sm font-medium text-foreground mb-2">Industry</label>
                <Input id="industry" placeholder="e.g., Technology, Finance, Education" value={industry} onChange={(e) => setIndustry(e.target.value)} required />
              </div>

              <Button type="submit" className="w-full h-10 text-base font-medium">Continue</Button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-foreground">Account Details</h2>
                <p className="text-sm text-muted-foreground mt-1">Create your administrator account</p>
              </div>

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="name" placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="pl-10" disabled={loading} />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="pl-10" disabled={loading} />
                </div>
              </div>

              <div>
                <label htmlFor="package" className="block text-sm font-medium text-foreground mb-2">Choose Package</label>
                <select
                  id="package"
                  value={packageTier}
                  onChange={(e) => setPackageTier(e.target.value as 'basic' | 'pro' | 'platinum')}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  disabled={loading}
                >
                  {TIERS.map((tier) => <option key={tier.value} value={tier.value}>{tier.label}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="coupon" className="block text-sm font-medium text-foreground mb-2">Coupon (optional)</label>
                <Input id="coupon" placeholder="ENTER-CODE" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} disabled={loading} />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="pl-10" disabled={loading} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">At least 8 characters</p>
              </div>

              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-foreground mb-2">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="confirm" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="pl-10" disabled={loading} />
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1 h-10" onClick={() => setStep('company')} disabled={loading}>Back</Button>
                <Button type="submit" disabled={loading} className="flex-1 h-10 text-base font-medium">{loading ? 'Creating Account...' : 'Sign Up'}</Button>
              </div>
            </form>
          )}

          <p className="text-center text-sm text-foreground mt-6">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-primary hover:underline font-medium">Sign in here</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
