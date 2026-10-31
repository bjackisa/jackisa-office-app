'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { useLicense } from '@/lib/lic/useLicense'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ShieldCheck, ShieldAlert, BadgeCheck, Building2, FileText, Copy, RefreshCw, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default function LicensePage() {
  const license = useLicense()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [company, setCompany] = useState<any | null>(null)
  const [validations, setValidations] = useState<any[]>([])
  const [kyc, setKyc] = useState<any | null>(null)
  const [jackisa, setJackisa] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const ctx = await getSessionContext()
      if (!ctx?.companyId) return
      setCompanyId(ctx.companyId)

      const [{ data: co }, { data: vals }, kycJson] = await Promise.all([
        supabase.from('companies').select('*').eq('id', ctx.companyId).maybeSingle(),
        supabase.from('license_validations').select('*').eq('company_id', ctx.companyId).order('checked_at', { ascending: false }).limit(10),
        // KYC state is read through the server so the browser never touches the
        // verification table directly.
        fetch(`/api/kyc?companyId=${encodeURIComponent(ctx.companyId)}&userId=${encodeURIComponent(ctx.userId)}`)
          .then((r) => r.json())
          .catch(() => null),
      ])
      setCompany(co)
      setValidations(vals || [])
      setKyc(kycJson?.company || null)

      // Jackisa One: what this plan unlocks on jackisa.com.
      fetch(`/api/jackisa?companyId=${encodeURIComponent(ctx.companyId)}`)
        .then((r) => r.json())
        .then((j) => { if (j?.ok) setJackisa(j.data) })
        .catch(() => {})
    }
    load()
  }, [])

  const revalidate = async () => {
    if (!companyId) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/lic/license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate', companyId, licenseKey: license.licenseKey }),
      })
      const json = await res.json()
      if (json.ok) {
        setMessage(json.data?.valid ? 'Licence is valid and within your plan limits.' : 'Licence is not valid.')
        await license.refresh()
      } else {
        setMessage(json.error || 'Could not validate the licence')
      }
    } finally {
      setBusy(false)
    }
  }

  const requestKyc = async () => {
    if (!companyId) return
    setBusy(true)
    setMessage(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/kyc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'request_company', companyId }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Could not request verification')
      setKyc({ status: 'pending', verified: false })
      setMessage('Company verification requested. We will email you when it is reviewed.')
    } catch (e: any) {
      setMessage(e?.message || 'Could not request verification')
    } finally {
      setBusy(false)
    }
  }

  // Open the tenant's storefront on jackisa.com (created by the plan).
  const openStore = () => {
    window.open(jackisa?.entitlement?.store_url || 'https://jackisa.com/store', '_blank', 'noopener')
  }

  // Re-run the cross-platform materialisation (storefront, badge, seats).
  const materialize = async () => {
    if (!companyId) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/jackisa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'materialize' }),
      })
      const json = await res.json()
      setMessage(json.ok ? 'Cross-platform benefits are up to date.' : json.error || 'Could not refresh benefits')
      const fresh = await fetch(`/api/jackisa?companyId=${encodeURIComponent(companyId)}`).then((r) => r.json()).catch(() => null)
      if (fresh?.ok) setJackisa(fresh.data)
    } finally {
      setBusy(false)
    }
  }

  const badge = company?.verified
    ? { label: 'Verified company', color: 'gold', icon: BadgeCheck }
    : license.badge?.type === 'individual'
    ? { label: 'Verified individual', color: 'blue', icon: BadgeCheck }
    : null

  return (
    <div className="p-6 lg:p-8 max-w-[1000px] mx-auto animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Licence</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your certificate, caps, and verification status.</p>
        </div>
        <Button variant="outline" size="sm" onClick={revalidate} disabled={busy}>
          {busy ? <Spinner className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Re-validate
        </Button>
      </div>

      {message && <div className="rounded-xl p-4 text-sm bg-primary/[0.06] border border-primary/15 text-foreground">{message}</div>}

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-5 md:col-span-2">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${license.valid ? 'bg-emerald-500/10' : 'bg-destructive/10'}`}>
              {license.valid ? <ShieldCheck className="w-6 h-6 text-emerald-500" /> : <ShieldAlert className="w-6 h-6 text-destructive" />}
            </div>
            <div className="flex-1">
              <p className="text-base font-bold text-foreground capitalize">{license.tier} licence</p>
              <p className="text-sm text-muted-foreground capitalize">Status: {license.status}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
                <div>
                  <p className="text-[11px] text-muted-foreground">Starts</p>
                  <p className="font-medium text-foreground">{company?.created_at ? new Date(company.created_at).toLocaleDateString() : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Expires</p>
                  <p className="font-medium text-foreground">{license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Days left</p>
                  <p className="font-medium text-foreground">{license.daysRemaining ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Plan</p>
                  <p className="font-medium text-foreground">{license.planCode || '—'}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-[11px] text-muted-foreground font-medium mb-2">Verification</p>
          {badge ? (
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${badge.color === 'gold' ? 'bg-amber-400/15 text-amber-600' : 'bg-blue-500/15 text-blue-600'}`}>
                <badge.icon className="w-3.5 h-3.5" /> {badge.label}
              </span>
            </div>
          ) : kyc?.status === 'pending' ? (
            <p className="text-sm text-muted-foreground">Verification pending review</p>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-3">Not verified yet. Verified companies get a gold badge.</p>
              <Button size="sm" variant="outline" onClick={requestKyc} disabled={busy}>Request verification</Button>
            </div>
          )}
        </Card>
      </div>

      {/* Jackisa One — cross-platform benefits */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Jackisa One benefits</h2>
            <p className="text-xs text-muted-foreground mt-0.5">What your plan unlocks on jackisa.com — your courses, store, and live minutes carry across.</p>
          </div>
          {jackisa?.entitlement?.tier && (
            <span className="text-xs font-semibold capitalize px-2.5 py-1 rounded-full bg-primary/10 text-primary">{jackisa.entitlement.tier}</span>
          )}
        </div>
        <div className="p-5 space-y-4">
          {jackisa?.benefits?.length ? (
            <ul className="grid sm:grid-cols-2 gap-2.5">
              {jackisa.benefits.map((b: string) => (
                <li key={b} className="flex items-center gap-2 text-sm text-foreground">
                  <BadgeCheck className="w-4 h-4 text-emerald-500 shrink-0" /> {b}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Link your Jackisa account to carry this plan's benefits to jackisa.com. Courses you publish here appear in your Jackisa store.
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={openStore} disabled={busy}>
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open my Jackisa store
            </Button>
            <Button size="sm" variant="ghost" onClick={materialize} disabled={busy}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh cross-platform benefits
            </Button>
          </div>
        </div>
      </Card>

      {/* Certificate */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><FileText className="w-4 h-4" /> Licence certificate</h2>
          {license.licenseKey && (
            <button
              className="text-xs text-primary flex items-center gap-1"
              onClick={() => navigator.clipboard.writeText(license.licenseKey || '')}
            >
              <Copy className="w-3 h-3" /> Copy key
            </button>
          )}
        </div>
        <div className="p-5">
          {license.licenseKey ? (
            <div className="rounded-xl bg-muted/40 border border-border/50 p-4 font-mono text-xs text-foreground break-all">
              {license.licenseKey}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No licence key yet. <Link href="/app/settings/billing" className="text-primary font-medium">Choose a plan</Link></p>
          )}
        </div>
      </Card>

      {/* Validation log */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border/30">
          <h2 className="text-sm font-semibold text-foreground">Licence checks</h2>
          <p className="text-xs text-muted-foreground mt-0.5">The app validates twice a day; recent checks appear here.</p>
        </div>
        <div className="divide-y divide-border/30">
          {validations.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground text-center">No checks recorded yet</p>
          ) : (
            validations.map((v) => (
              <div key={v.id} className="px-5 py-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{new Date(v.checked_at).toLocaleString()}</span>
                <span className={`badge ${v.valid ? 'badge-success' : 'badge-destructive'}`}>{v.valid ? 'valid' : 'invalid'}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}
