'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { useLicense } from '@/lib/lic/useLicense'
import { recallPlan, clearPlan } from '@/lib/lic/planMemory'
import { apiFetch } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { CreditCard, Phone, ShieldCheck, Clock, XCircle, Check } from 'lucide-react'

type Plan = {
  code: string
  name: string
  tier: string
  interval_months: number
  price: number
  currency: string
  max_employees: number
  max_students: number
  storage_gb: number
}

const INTERVALS = [1, 3, 6, 12, 24, 36]

/** What each tier unlocks — mirrors lib/lic/features.ts minTier mapping. */
const TIER_BENEFITS: Record<string, string[]> = {
  basic: [
    'Accounting, invoicing & expenses',
    'VAT and bookkeeping',
    'HR, payroll, PAYE & attendance',
    'Sales, orders & help desk',
  ],
  pro: [
    'Everything in Basic',
    'Education: students, coursework & grades',
    'Performance, HR points & commissions',
    'Investment & funds, affiliate program',
    'Legal documents, CMS & WhatsApp alerts',
  ],
  platinum: [
    'Everything in Pro',
    'Unit Trust with full NAV & dividends',
    'Income Tax Evaluator (URA-ready CSV)',
    'KYC verification & API access',
    'Gold company verification badge',
  ],
}

function intervalLabel(months: number): string {
  if (months === 12) return '1 year'
  if (months === 24) return '2 years'
  if (months === 36) return '3 years'
  return `${months} month${months === 1 ? '' : 's'}`
}

/** How much a longer commitment saves against paying monthly. */
function savingsPercent(monthlyPrice: number, intervalMonths: number, planPrice: number): number {
  if (intervalMonths <= 1 || monthlyPrice <= 0) return 0
  const full = monthlyPrice * intervalMonths
  if (planPrice >= full) return 0
  return Math.round((1 - planPrice / full) * 100)
}

export default function BillingPage() {
  const license = useLicense()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [tier, setTier] = useState<'basic' | 'pro' | 'platinum'>('basic')
  const [intervalMonths, setIntervalMonths] = useState(1)
  const [msisdn, setMsisdn] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [quote, setQuote] = useState<any | null>(null)

  useEffect(() => {
    const load = async () => {
      const ctx = await getSessionContext()
      if (!ctx?.companyId) return
      setCompanyId(ctx.companyId)

      const plansRes = await fetch('/api/lic/plans').then((r) => r.json()).catch(() => null)
      if (plansRes?.plans) setPlans(plansRes.plans)

      // Pre-select the plan the visitor chose on the landing/register page.
      const remembered = recallPlan()
      if (remembered) {
        setTier(remembered.tier)
        setIntervalMonths(remembered.intervalMonths)
      }

      const { data: history } = await supabase
        .from('license_payments')
        .select('*')
        .eq('company_id', ctx.companyId)
        .order('created_at', { ascending: false })
        .limit(10)
      setPayments(history || [])
    }
    load()
  }, [])

  // Once a licence is live the remembered choice has done its job.
  useEffect(() => {
    if (license.valid && license.status !== 'trial') clearPlan()
  }, [license.valid, license.status])

  // Pick the plan row that matches tier + interval, falling back to a derived
  // price when a longer interval has no explicit row.
  const selectedPlan = useMemo(() => {
    const exact = plans.find((p) => p.tier === tier && p.interval_months === intervalMonths)
    if (exact) return exact
    const monthly = plans.find((p) => p.tier === tier && p.interval_months === 1)
    if (monthly) {
      const discount = intervalMonths >= 12 ? 0.12 : intervalMonths >= 6 ? 0.08 : intervalMonths >= 3 ? 0.04 : 0
      return { ...monthly, code: `${tier}_${intervalMonths}m`, interval_months: intervalMonths, price: Math.round(monthly.price * intervalMonths * (1 - discount)) }
    }
    return null
  }, [plans, tier, intervalMonths])

  // A live quote for moving to the selected plan (credit for unused time).
  useEffect(() => {
    if (!companyId || !selectedPlan?.code) return
    let active = true
    apiFetch('/api/lic/license', {
      method: 'POST',
      body: JSON.stringify({ action: 'change-quote', companyId, planCode: selectedPlan.code }),
    })
      .then((r) => r.json())
      .then((j) => { if (active && j?.ok) setQuote(j.data?.quote || null) })
      .catch(() => {})
    return () => { active = false }
  }, [companyId, selectedPlan?.code])

  const pollStatus = async (ref: string) => {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 6000))
      const res = await apiFetch('/api/lic/payments', {
        method: 'POST',
        body: JSON.stringify({ action: 'status', companyId, paymentId: ref }),
      }).then((r) => r.json()).catch(() => null)
      if (res?.data?.status === 'paid') {
        setMessage({ kind: 'ok', text: 'Payment confirmed. Your licence is now active.' })
        await license.refresh()
        return
      }
      if (res?.data?.status === 'failed' || res?.data?.status === 'expired') {
        setMessage({ kind: 'error', text: 'The payment did not go through. Please try again.' })
        return
      }
    }
  }

  const startTrial = async () => {
    if (!companyId) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await apiFetch('/api/trial', {
        method: 'POST',
        body: JSON.stringify({ action: 'start', companyId, msisdn: msisdn || undefined, planCode: selectedPlan?.code, intervalMonths }),
      })
      const json = await res.json()
      if (json.ok && json.granted === false) {
        setMessage({ kind: 'error', text: 'A free trial has already been used from this device or network. Please choose a plan to continue.' })
        await license.refresh()
      } else if (json.ok) {
        setMessage({ kind: 'ok', text: `Trial started — ${json.days} days. We will remind you 2 days before it ends.` })
        await license.refresh()
      } else {
        setMessage({ kind: 'error', text: json.error || 'Could not start a trial' })
      }
    } finally {
      setBusy(false)
    }
  }

  const pay = async () => {
    if (!companyId || !selectedPlan) return
    if (!msisdn || msisdn.replace(/\D/g, '').length < 9) {
      setMessage({ kind: 'error', text: 'Enter a valid mobile money number (e.g. 256700000000).' })
      return
    }
    const due = quote?.amount_due !== undefined ? Number(quote.amount_due) : Number(selectedPlan.price)
    const isChange = Boolean(quote?.current) && due < Number(selectedPlan.price) + 0.001
    // A change fully covered by credit needs no mobile-money step.
    if (isChange && due <= 0) {
      setBusy(true)
      setMessage(null)
      try {
        const res = await apiFetch('/api/lic/license', {
          method: 'POST',
          body: JSON.stringify({ action: 'change', companyId, planCode: selectedPlan.code, paid: true }),
        })
        const json = await res.json()
        setMessage(json.ok
          ? { kind: 'ok', text: 'Plan changed. Your new plan is active.' }
          : { kind: 'error', text: json.error || 'Could not change the plan' })
        if (json.ok) await license.refresh()
      } finally {
        setBusy(false)
      }
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await apiFetch('/api/lic/payments', {
        method: 'POST',
        body: JSON.stringify({
          action: 'initiate',
          companyId,
          amount: due,
          msisdn,
          planCode: selectedPlan.code,
          intervalMonths,
          purpose: isChange ? 'change' : 'license',
          description: isChange ? `Change to ${selectedPlan.name}` : `${selectedPlan.name} licence`,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        const ref = json.data?.payment_id || json.data?.merchant_ref || null
        setMessage({ kind: 'ok', text: 'Check your phone and approve the payment prompt. Your plan activates as soon as it is confirmed.' })
        if (ref) pollStatus(ref)
      } else {
        setMessage({ kind: 'error', text: json.error || 'Payment could not be started' })
      }
    } finally {
      setBusy(false)
    }
  }

  const cancelTrial = async () => {
    if (!companyId) return
    setBusy(true)
    const res = await apiFetch('/api/trial', {
      method: 'POST',
      body: JSON.stringify({ action: 'cancel', companyId }),
    }).then((r) => r.json()).catch(() => null)
    setBusy(false)
    if (res?.ok) {
      setMessage({ kind: 'ok', text: 'Trial cancelled. You will not be charged.' })
      await license.refresh()
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Billing & Licence</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Choose your plan, pay by mobile money, and manage renewals.</p>
      </div>

      {/* Current licence summary */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-[11px] text-muted-foreground font-medium mb-1">Plan</p>
          <p className="text-lg font-bold text-foreground capitalize">{license.tier}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] text-muted-foreground font-medium mb-1">Status</p>
          <p className={`text-lg font-bold capitalize ${license.valid ? 'text-emerald-500' : 'text-destructive'}`}>{license.status}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] text-muted-foreground font-medium mb-1">Expires</p>
          <p className="text-lg font-bold text-foreground">{license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : '—'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] text-muted-foreground font-medium mb-1">Days left</p>
          <p className="text-lg font-bold text-foreground">{license.daysRemaining ?? '—'}</p>
        </Card>
      </div>

      {license.trial?.active && (
        <Card className="p-5 border-amber-400/30 bg-amber-500/[0.04]">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Free trial active — {license.trial.daysLeft} day{license.trial.daysLeft === 1 ? '' : 's'} left</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add a payment number below to continue seamlessly when the trial ends. You can cancel any time.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={cancelTrial} disabled={busy}>
              <XCircle className="w-3.5 h-3.5 mr-1.5" /> Cancel trial
            </Button>
          </div>
        </Card>
      )}

      {message && (
        <div className={`rounded-xl p-4 text-sm border ${message.kind === 'ok' ? 'bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-destructive/[0.06] border-destructive/20 text-destructive'}`}>
          {message.text}
        </div>
      )}

      {/* Plan picker */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border/30">
          <h2 className="text-sm font-semibold text-foreground">Choose your plan</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Pay monthly, quarterly, biannually, annually, or up to 3 years upfront.</p>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {(['basic', 'pro', 'platinum'] as const).map((t) => {
              const monthly = plans.find((p) => p.tier === t && p.interval_months === 1)
              const benefits = TIER_BENEFITS[t] || []
              return (
                <button
                  key={t}
                  onClick={() => setTier(t)}
                  className={`rounded-xl border p-4 text-left transition-all duration-200 ${tier === t ? 'border-primary/50 bg-primary/[0.06]' : 'border-border/60 hover:border-border'}`}
                >
                  <p className="text-sm font-bold text-foreground capitalize">{t}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {monthly ? `${Number(monthly.price).toLocaleString()} UGX/mo` : '—'}
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {benefits.map((b) => (
                      <li key={b} className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
                        <Check className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" /> {b}
                      </li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {INTERVALS.map((m) => {
              const monthly = plans.find((p) => p.tier === tier && p.interval_months === 1)
              const exact = plans.find((p) => p.tier === tier && p.interval_months === m)
              const save = exact && monthly ? savingsPercent(Number(monthly.price), m, Number(exact.price)) : 0
              return (
                <button
                  key={m}
                  onClick={() => setIntervalMonths(m)}
                  className={`relative rounded-lg px-3.5 py-2 text-xs font-medium border transition-all duration-200 ${intervalMonths === m ? 'border-primary/50 bg-primary/[0.06] text-foreground' : 'border-border/60 text-muted-foreground hover:border-border'}`}
                >
                  {intervalLabel(m)}
                  {save > 0 && (
                    <span className="ml-1.5 text-[10px] font-bold text-emerald-600">−{save}%</span>
                  )}
                </button>
              )
            })}
          </div>

          {selectedPlan && (
            <div className="rounded-xl bg-muted/40 border border-border/50 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground capitalize">{tier} · {intervalLabel(intervalMonths)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedPlan.max_employees === 0 ? 'Unlimited' : selectedPlan.max_employees} employees ·{' '}
                    {selectedPlan.max_students === 0 ? 'Unlimited' : selectedPlan.max_students} students · {selectedPlan.storage_gb} GB
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-foreground tabular-nums">{Number(selectedPlan.price).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{selectedPlan.currency}</p>
                </div>
              </div>
              {quote?.current && (
                <div className="border-t border-border/40 pt-3 space-y-1 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="capitalize">{quote.direction} from {String(quote.current.plan_code || '').replace('_', ' ')}</span>
                    <span>Credit −{Number(quote.credit).toLocaleString()} {quote.currency}</span>
                  </div>
                  <div className="flex items-center justify-between font-semibold text-foreground">
                    <span>Due today</span>
                    <span className="tabular-nums">{Number(quote.amount_due).toLocaleString()} {quote.currency}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Mobile money number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <Input className="pl-10" placeholder="256700000000" value={msisdn} onChange={(e) => setMsisdn(e.target.value)} />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Button className="flex-1 h-10 shadow-glow-primary" onClick={pay} disabled={busy || !selectedPlan}>
                {busy ? <Spinner className="w-4 h-4" /> : <CreditCard className="w-4 h-4 mr-2" />}
                {quote?.current && Number(quote.amount_due) <= 0 ? 'Switch plan (no charge)' : 'Pay with mobile money'}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Secured by JPesa</span>
            {!license.trial?.active && (
              <button className="text-primary font-medium" onClick={startTrial} disabled={busy}>
                Start a 7-day free trial instead
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Payment history */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border/30">
          <h2 className="text-sm font-semibold text-foreground">Payment history</h2>
        </div>
        <div className="divide-y divide-border/30">
          {payments.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground text-center">No payments yet</p>
          ) : (
            payments.map((p) => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-foreground capitalize">{p.plan_code?.replace('_', ' ') || p.purpose}</p>
                  <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground tabular-nums">{Number(p.amount).toLocaleString()} {p.currency}</p>
                  <span className={`badge ${p.status === 'paid' ? 'badge-success' : p.status === 'failed' ? 'badge-destructive' : 'badge-warning'}`}>{p.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}
