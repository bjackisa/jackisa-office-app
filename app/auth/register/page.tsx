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
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 dot-pattern opacity-20" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl" />
      <div className="w-full max-w-md relative animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[hsl(224,40%,8%)] p-2 mb-5 ring-1 ring-white/10 shadow-elevated">
            <img
              src="https://res.cloudinary.com/dsijcu1om/image/upload/v1772089694/2_en3tei.png"
              alt="Jackisa Office logo"
              className="h-full w-full object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1.5 tracking-tight">Create your workspace</h1>
          <p className="text-muted-foreground text-sm">Get started with Jackisa Office</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 'company' ? 'w-8 bg-primary' : 'w-4 bg-primary/30'}`} />
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 'account' ? 'w-8 bg-primary' : 'w-4 bg-primary/30'}`} />
        </div>

        <div className="bg-card rounded-2xl shadow-elevated border border-border/50 p-8">
          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-xl bg-destructive/[0.06] border border-destructive/15 p-4 text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {step === 'company' ? (
            <form onSubmit={handleCompanySubmit} className="space-y-5">
              <div className="mb-2">
                <h2 className="text-base font-semibold text-foreground">Company Information</h2>
                <p className="text-sm text-muted-foreground/60 mt-1">Tell us about your company</p>
              </div>

              <div>
                <label htmlFor="company" className="block text-sm font-semibold text-foreground mb-2">Company Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <Input id="company" placeholder="Your Company Ltd" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className="pl-10" />
                </div>
              </div>

              <div>
                <label htmlFor="comp-email" className="block text-sm font-semibold text-foreground mb-2">Company Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <Input id="comp-email" type="email" placeholder="company@example.com" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} required className="pl-10" />
                </div>
              </div>

              <div>
                <label htmlFor="industry" className="block text-sm font-semibold text-foreground mb-2">Industry</label>
                <Input id="industry" placeholder="e.g., Technology, Finance, Education" value={industry} onChange={(e) => setIndustry(e.target.value)} required />
              </div>

              <Button type="submit" className="w-full h-11 text-sm font-semibold shadow-glow-primary">Continue</Button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="mb-2">
                <h2 className="text-base font-semibold text-foreground">Account Details</h2>
                <p className="text-sm text-muted-foreground/60 mt-1">Create your administrator account</p>
              </div>

              <div>
                <label htmlFor="name" className="block text-sm font-semibold text-foreground mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <Input id="name" placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="pl-10" disabled={loading} />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-foreground mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="pl-10" disabled={loading} />
                </div>
              </div>

              <div>
                <label htmlFor="package" className="block text-sm font-semibold text-foreground mb-2">Choose Package</label>
                <select
                  id="package"
                  value={packageTier}
                  onChange={(e) => setPackageTier(e.target.value as 'basic' | 'pro' | 'platinum')}
                  className="w-full h-10 rounded-xl border border-input bg-background px-3.5 text-sm transition-all duration-200 focus:ring-2 focus:ring-ring/30 focus:border-primary/40 outline-none"
                  disabled={loading}
                >
                  {TIERS.map((tier) => <option key={tier.value} value={tier.value}>{tier.label}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="coupon" className="block text-sm font-semibold text-foreground mb-2">Coupon (optional)</label>
                <Input id="coupon" placeholder="ENTER-CODE" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} disabled={loading} />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-foreground mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="pl-10" disabled={loading} />
                </div>
                <p className="text-xs text-muted-foreground/50 mt-1.5">At least 8 characters</p>
              </div>

              <div>
                <label htmlFor="confirm" className="block text-sm font-semibold text-foreground mb-2">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <Input id="confirm" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="pl-10" disabled={loading} />
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => setStep('company')} disabled={loading}>Back</Button>
                <Button type="submit" disabled={loading} className="flex-1 h-11 text-sm font-semibold shadow-glow-primary">{loading ? 'Creating...' : 'Create Account'}</Button>
              </div>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground mt-7">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-primary font-semibold hover:text-primary/80 transition-colors">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
