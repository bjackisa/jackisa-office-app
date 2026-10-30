'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { ContinueWithJackisa } from '@/components/continue-with-jackisa'
import { AlertCircle, Building2, Lock, Mail, User } from 'lucide-react'

const TIERS = [
  { value: 'basic', label: 'Basic - UGX 25,000/mo' },
  { value: 'pro', label: 'Pro - UGX 75,000/mo' },
  { value: 'platinum', label: 'Platinum - UGX 150,000/mo' },
]

/** plan code (e.g. pro_12m) -> tier + interval */
function parsePlan(code: string | null): { tier: 'basic' | 'pro' | 'platinum'; months: number } | null {
  if (!code) return null
  const m = code.match(/^(basic|pro|platinum)_(\d+)m$/)
  if (!m) return null
  return { tier: m[1] as any, months: Number(m[2]) }
}

function RegisterInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<'company' | 'account'>('company')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Company Form State
  const [companyName, setCompanyName] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')
  const [industry, setIndustry] = useState('')
  const [companyKind, setCompanyKind] = useState<'company' | 'institution' | 'ngo' | 'cooperative' | 'individual'>('company')

  // Account Form State
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [packageTier, setPackageTier] = useState<'basic' | 'pro' | 'platinum'>('basic')
  const [planCode, setPlanCode] = useState<string>('basic_1m')
  const [intervalMonths, setIntervalMonths] = useState<number>(1)
  const [couponCode, setCouponCode] = useState('')

  // Remember the plan the visitor chose on the pricing page, so the choice
  // survives the whole signup round-trip (including email verification).
  useEffect(() => {
    const fromUrl = searchParams.get('plan')
    const remembered = (() => {
      try {
        const raw = localStorage.getItem('pendingRegistration')
        return raw ? JSON.parse(raw)?.planCode : null
      } catch {
        return null
      }
    })()
    const chosen = fromUrl || remembered
    const parsed = parsePlan(chosen)
    if (parsed) {
      setPackageTier(parsed.tier)
      setPlanCode(chosen as string)
      setIntervalMonths(parsed.months)
    }
  }, [searchParams])

  const selectPlan = (tier: 'basic' | 'pro' | 'platinum') => {
    const code = `${tier}_${intervalMonths === 12 ? 12 : intervalMonths}m`
    setPackageTier(tier)
    setPlanCode(code)
  }

  const selectInterval = (months: number) => {
    setIntervalMonths(months)
    setPlanCode(`${packageTier}_${months}m`)
  }

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
        companyKind,
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
          planCode,
          intervalMonths,
          companyKind,
          couponCode: couponCode.trim().toUpperCase() || null,
        }
        localStorage.setItem('pendingRegistration', JSON.stringify(pending))
        // Persist the chosen plan on the server so it is remembered even if the
        // visitor verifies email on another device.
        fetch('/api/signup-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, planCode, intervalMonths, tier: packageTier, companyName, companyEmail, industry, companyKind, intent: companyKind === 'institution' ? 'create_institution' : 'create_company' }),
        }).catch(() => {})
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

          <div className="mb-6">
            <ContinueWithJackisa />
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-border/60" />
              <span className="text-[11px] text-muted-foreground/50 uppercase tracking-wide">or</span>
              <div className="flex-1 h-px bg-border/60" />
            </div>
          </div>

          {step === 'company' ? (
            <form onSubmit={handleCompanySubmit} className="space-y-5">
              <div className="mb-2">
                <h2 className="text-base font-semibold text-foreground">Company Information</h2>
                <p className="text-sm text-muted-foreground/60 mt-1">Tell us about your company</p>
              </div>

              {planCode && (
                <div className="rounded-xl bg-primary/[0.06] border border-primary/15 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Selected plan: </span>
                  <span className="font-semibold text-foreground capitalize">{packageTier}</span>
                  <span className="text-muted-foreground"> · {intervalMonths} month{intervalMonths === 1 ? '' : 's'}</span>
                  <span className="text-muted-foreground/60"> — change it on the next step</span>
                </div>
              )}

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

              <div>
                <label htmlFor="kind" className="block text-sm font-semibold text-foreground mb-2">What are you setting up?</label>
                <select
                  id="kind"
                  value={companyKind}
                  onChange={(e) => setCompanyKind(e.target.value as any)}
                  className="w-full h-10 rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground outline-none focus:border-primary/40"
                >
                  <option value="company">A business (company)</option>
                  <option value="institution">A school or institution</option>
                  <option value="ngo">An NGO or non-profit</option>
                  <option value="cooperative">A cooperative or SACCO</option>
                  <option value="individual">Just me (individual)</option>
                </select>
                <p className="text-xs text-muted-foreground/60 mt-1.5">
                  This decides which modules your workspace starts with — you can change it later.
                </p>
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
                <label className="block text-sm font-semibold text-foreground mb-2">Choose Package</label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {TIERS.map((tier) => (
                    <button
                      key={tier.value}
                      type="button"
                      onClick={() => selectPlan(tier.value as any)}
                      disabled={loading}
                      className={`rounded-xl border px-2 py-2.5 text-xs font-medium transition-all duration-200 ${
                        packageTier === tier.value
                          ? 'border-primary/50 bg-primary/10 text-foreground'
                          : 'border-border/60 text-muted-foreground hover:border-border'
                      }`}
                    >
                      <span className="block capitalize">{tier.value}</span>
                      <span className="block text-[10px] text-muted-foreground/70 mt-0.5">{tier.label.split(' - ')[1]}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {[1, 3, 6, 12, 24, 36].map((months) => (
                    <button
                      key={months}
                      type="button"
                      onClick={() => selectInterval(months)}
                      disabled={loading}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-all duration-200 ${
                        intervalMonths === months
                          ? 'border-primary/50 bg-primary/10 text-foreground'
                          : 'border-border/60 text-muted-foreground hover:border-border'
                      }`}
                    >
                      {months === 12 ? '1 yr' : months === 24 ? '2 yrs' : months === 36 ? '3 yrs' : `${months} mo`}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground/60 mt-2">
                  Pay monthly, quarterly, biannually, annually, or up to 3 years upfront.
                </p>
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

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner className="w-6 h-6 text-primary" /></div>}>
      <RegisterInner />
    </Suspense>
  )
}
