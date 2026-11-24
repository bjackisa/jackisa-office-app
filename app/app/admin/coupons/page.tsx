'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Ticket, Plus, RefreshCw, Trash2, Check, Clock } from 'lucide-react'

type Coupon = {
  id: string
  code: string | null
  name: string
  description: string | null
  benefit_type: 'percent' | 'amount' | 'waiver' | 'free_days'
  discount_percent: number
  discount_amount: number
  free_days: number
  duration: 'once' | 'cycles' | 'forever'
  duration_cycles: number
  applies_plan_codes: string[] | null
  applies_intervals: number[] | null
  audience_type: string
  audience_value: any
  audience_tenants?: string[]
  auto_apply: boolean
  max_uses: number | null
  max_uses_per_tenant: number
  current_uses: number
  starts_at: string | null
  expires_at: string | null
  status: 'draft' | 'active' | 'paused' | 'archived'
}

type PlanOption = {
  code: string
  name: string
  tier: string
  interval_months: number
  price: number
  currency: string
  is_active?: boolean
}

type AccountOption = {
  id: string
  tenant_id: string
  name: string
  email: string | null
  owner_name: string | null
  owner_email: string | null
  industry: string | null
  country: string | null
  kind: string | null
  tier: string | null
  plan_code: string | null
  license_status: string | null
}

const TIERS = ['basic', 'pro', 'platinum', 'enterprise']
const INTERVALS = [1, 3, 6, 12, 24, 36]
const BENEFITS = [
  { value: 'percent', label: 'Percentage off' },
  { value: 'amount', label: 'Flat amount off' },
  { value: 'waiver', label: 'Full waiver (100% free)' },
  { value: 'free_days', label: 'Bonus free days' },
]
const AUDIENCES = [
  { value: 'all', label: 'Any account' },
  { value: 'list', label: 'Specific accounts (pick from the list)' },
  { value: 'new', label: 'New accounts' },
  { value: 'legacy', label: 'Legacy accounts (before a date)' },
  { value: 'country', label: 'Accounts in a country' },
  { value: 'industry', label: 'Accounts in an industry' },
  { value: 'kind', label: 'Company or institution' },
  { value: 'tier', label: 'Accounts on a tier' },
]
const DURATIONS = [
  { value: 'once', label: 'First payment only' },
  { value: 'cycles', label: 'For N payments' },
  { value: 'forever', label: 'Every payment' },
]

async function authedFetch(body: any) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/admin/coupons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function adminFetch(path: string, body: any) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(body),
  })
  return res.json()
}

/** Keep the per-account cap aligned with the duration the operator picked. */
function perTenantForDuration(duration: string, cycles: number): number {
  if (duration === 'forever') return 0
  if (duration === 'cycles') return Math.max(1, cycles || 1)
  return 1
}

const EMPTY = {
  name: '', code: '', description: '',
  benefit_type: 'percent', discount_percent: 10, discount_amount: 0, free_days: 0,
  duration: 'once', duration_cycles: 1,
  audience_type: 'all', audience_value: '', audience_tenants: '',
  applies_plan_codes: [] as string[], applies_intervals: [] as number[],
  auto_apply: true, max_uses: '', max_uses_per_tenant: 1,
  starts_at: '', expires_at: '', status: 'active',
}

function parseTenantIds(value: string): string[] {
  return value.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean)
}

function planScopeLabel(c: Coupon): string {
  const plans = c.applies_plan_codes || []
  if (plans.length === 0) return 'any plan'
  return plans.map((p) => p.replace(/_/g, ' ')).join(', ')
}

function benefitLabel(c: Coupon): string {
  switch (c.benefit_type) {
    case 'waiver': return '100% waiver'
    case 'percent': return `${c.discount_percent}% off`
    case 'amount': return `UGX ${Number(c.discount_amount).toLocaleString()} off`
    case 'free_days': return `+${c.free_days} free days`
    default: return c.benefit_type
  }
}

function audienceLabel(c: Coupon): string {
  const v = c.audience_value || {}
  switch (c.audience_type) {
    case 'all': return 'Any account'
    case 'list': return `${(c.audience_tenants || []).length} specific account(s)`
    case 'new': return `New accounts (≤${v.max_days ?? 30} days)`
    case 'legacy': return `Legacy accounts (before ${v.before ?? '—'})`
    case 'country': return `Countries: ${(v.countries || []).join(', ') || '—'}`
    case 'industry': return `Industries: ${(v.industries || []).join(', ') || '—'}`
    case 'kind': return `Kinds: ${(v.kinds || []).join(', ') || '—'}`
    case 'tier': return `Tiers: ${(v.tiers || []).join(', ') || '—'}`
    default: return c.audience_type
  }
}

function durationLabel(c: Coupon): string {
  if (c.duration === 'forever') return 'every payment'
  if (c.duration === 'cycles') return `${c.duration_cycles} payments`
  return 'first payment'
}

/**
 * Coupon console. Super-admin only — create account-targeted coupons (a code,
 * an auto-apply campaign, or a full waiver) and see every redemption.
 */
export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [redemptions, setRedemptions] = useState<any[] | null>(null)
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [accountQuery, setAccountQuery] = useState('')
  const [manualAccountId, setManualAccountId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await authedFetch({ action: 'list' })
    if (!res.ok) setError(res.error || 'Could not load coupons')
    setCoupons(res.data?.coupons || [])
    setLoading(false)
  }, [])

  const loadPlans = useCallback(async () => {
    const res = await adminFetch('/api/admin/catalog', { kind: 'plans', action: 'list' })
    if (res.ok) setPlans((res.data?.plans || []).filter((p: PlanOption) => p.is_active !== false))
  }, [])

  const loadAccounts = useCallback(async (search = '') => {
    setAccountsLoading(true)
    const res = await adminFetch('/api/admin/companies', { action: 'list', search })
    if (res.ok) {
      const fetched: AccountOption[] = res.data?.companies || []
      setAccounts((prev) => {
        const merged = new Map(prev.map((a) => [a.id, a]))
        fetched.forEach((a) => merged.set(a.id, a))
        return Array.from(merged.values())
      })
    }
    setAccountsLoading(false)
  }, [])

  const resolveAccounts = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    const res = await adminFetch('/api/admin/companies', { action: 'list', ids })
    if (!res.ok) return
    const fetched: AccountOption[] = res.data?.companies || []
    setAccounts((prev) => {
      const merged = new Map(prev.map((a) => [a.id, a]))
      fetched.forEach((a) => merged.set(a.id, a))
      return Array.from(merged.values())
    })
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadPlans(); loadAccounts() }, [loadPlans, loadAccounts])

  const openCreate = () => {
    setEditId(null)
    setForm({ ...EMPTY })
    setAccountQuery('')
    setManualAccountId('')
    setError(null)
    setOpen(true)
  }

  const openEdit = (c: Coupon) => {
    setEditId(c.id)
    const v = c.audience_value || {}
    let audienceValue = ''
    if (c.audience_type === 'new') audienceValue = String(v.max_days ?? 30)
    else if (c.audience_type === 'legacy') audienceValue = String(v.before ?? '')
    else if (c.audience_type === 'country') audienceValue = (v.countries || []).join(', ')
    else if (c.audience_type === 'industry') audienceValue = (v.industries || []).join(', ')
    else if (c.audience_type === 'kind') audienceValue = (v.kinds || []).join(', ')
    else if (c.audience_type === 'tier') audienceValue = (v.tiers || []).join(', ')

    setForm({
      name: c.name, code: c.code || '', description: c.description || '',
      benefit_type: c.benefit_type, discount_percent: c.discount_percent, discount_amount: c.discount_amount,
      free_days: c.free_days, duration: c.duration, duration_cycles: c.duration_cycles,
      audience_type: c.audience_type, audience_value: audienceValue,
      audience_tenants: (c.audience_tenants || []).join('\n'),
      applies_plan_codes: c.applies_plan_codes || [], applies_intervals: c.applies_intervals || [],
      auto_apply: c.auto_apply, max_uses: c.max_uses === null ? '' : String(c.max_uses),
      max_uses_per_tenant: c.max_uses_per_tenant === 1 && c.duration !== 'once' ? 0 : c.max_uses_per_tenant,
      starts_at: c.starts_at ? c.starts_at.slice(0, 16).replace(' ', 'T') : '',
      expires_at: c.expires_at ? c.expires_at.slice(0, 16).replace(' ', 'T') : '',
      status: c.status,
    })
    setAccountQuery('')
    setManualAccountId('')
    void resolveAccounts(c.audience_tenants || [])
    setError(null)
    setOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) { setError('Give the coupon a name.'); return }
    if (form.benefit_type === 'percent' && (form.discount_percent <= 0 || form.discount_percent > 100)) {
      setError('Enter a discount between 0 and 100.'); return
    }
    if (form.benefit_type === 'amount' && form.discount_amount <= 0) { setError('Enter an amount above zero.'); return }
    if (form.benefit_type === 'free_days' && form.free_days <= 0) { setError('Enter at least one free day.'); return }
    if (!form.code.trim() && !form.auto_apply) {
      setError('Add a code or turn on auto-apply, otherwise the coupon cannot be used.'); return
    }
    if (form.audience_type === 'list' && parseTenantIds(form.audience_tenants).length === 0) {
      setError('Pick at least one account for this coupon.'); return
    }
    if (!['all', 'list'].includes(form.audience_type) && !form.audience_value.trim()) {
      setError('Fill in the audience value for the group you selected.'); return
    }

    setBusy(true)
    setError(null)
    const payload: any = {
      action: editId ? 'update' : 'create',
      id: editId || undefined,
      name: form.name.trim(),
      code: form.code.trim() || null,
      description: form.description.trim() || null,
      benefit_type: form.benefit_type,
      discount_percent: form.benefit_type === 'percent' ? Number(form.discount_percent) : 0,
      discount_amount: form.benefit_type === 'amount' ? Number(form.discount_amount) : 0,
      free_days: form.benefit_type === 'free_days' ? Number(form.free_days) : 0,
      duration: form.duration,
      duration_cycles: Number(form.duration_cycles),
      audience_type: form.audience_type,
      audience_value: form.audience_type === 'all' || form.audience_type === 'list'
        ? null
        : form.audience_value.split(',').map((s) => s.trim()).filter(Boolean),
      audience_tenant_ids: form.audience_type === 'list'
        ? parseTenantIds(form.audience_tenants)
        : undefined,
      applies_plan_codes: form.applies_plan_codes,
      applies_intervals: form.applies_intervals,
      auto_apply: form.auto_apply,
      max_uses: form.max_uses === '' ? null : Number(form.max_uses),
      max_uses_per_tenant: Number(form.max_uses_per_tenant),
      starts_at: form.starts_at || null,
      expires_at: form.expires_at || null,
      status: form.status,
    }
    const res = await authedFetch(payload)
    setBusy(false)
    if (!res.ok) { setError(res.error || 'Could not save the coupon'); return }
    setOpen(false)
    setNotice(editId ? 'Coupon updated.' : 'Coupon created.')
    await load()
  }

  const archive = async (c: Coupon) => {
    setBusy(true)
    const res = await authedFetch({ action: 'archive', id: c.id })
    setBusy(false)
    if (!res.ok) { setError(res.error || 'Could not archive'); return }
    setNotice('Coupon archived.')
    await load()
  }

  const showRedemptions = async (c: Coupon) => {
    setBusy(true)
    const res = await authedFetch({ action: 'redemptions', id: c.id })
    setBusy(false)
    if (!res.ok) { setError(res.error || 'Could not load redemptions'); return }
    setRedemptions(res.data?.redemptions || [])
  }

  const liveCount = useMemo(() => coupons.filter((c) => c.status === 'active').length, [coupons])

  const tenantIds = useMemo(() => parseTenantIds(form.audience_tenants), [form.audience_tenants])
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const filteredAccounts = useMemo(() => {
    const q = accountQuery.trim().toLowerCase()
    const rows = q
      ? accounts.filter((a) => [a.name, a.email, a.owner_name, a.owner_email, a.id]
          .some((value) => (value || '').toLowerCase().includes(q)))
      : accounts
    return rows.slice(0, 40)
  }, [accounts, accountQuery])

  const tierOptions = useMemo(() => {
    const fromPlans = Array.from(new Set(plans.map((p) => p.tier).filter(Boolean)))
    return fromPlans.length ? fromPlans : TIERS
  }, [plans])

  const planGroups = useMemo(() => {
    const groups = new Map<string, PlanOption[]>()
    for (const plan of plans) {
      const tier = plan.tier || 'other'
      if (!groups.has(tier)) groups.set(tier, [])
      groups.get(tier)!.push(plan)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [plans])

  const togglePlanCode = (value: string) => {
    setForm((f) => {
      const set = new Set(f.applies_plan_codes)
      if (set.has(value)) set.delete(value)
      else set.add(value)
      return { ...f, applies_plan_codes: Array.from(set) }
    })
  }

  const toggleTenant = (id: string) => {
    setForm((f) => {
      const set = new Set(parseTenantIds(f.audience_tenants))
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return { ...f, audience_tenants: Array.from(set).join('\n') }
    })
  }

  const addManualAccount = () => {
    const id = manualAccountId.trim()
    if (!id) return
    toggleTenant(id)
    setManualAccountId('')
    void resolveAccounts([id])
  }

  const generateCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const bytes = new Uint32Array(8)
    crypto.getRandomValues(bytes)
    const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
    setForm((f) => ({ ...f, code }))
  }

  const changeDuration = (duration: string) => {
    setForm((f) => ({
      ...f,
      duration,
      max_uses_per_tenant: perTenantForDuration(duration, f.duration_cycles),
    }))
  }

  const changeCycles = (cycles: number) => {
    setForm((f) => ({
      ...f,
      duration_cycles: cycles,
      max_uses_per_tenant: f.duration === 'cycles' ? perTenantForDuration('cycles', cycles) : f.max_uses_per_tenant,
    }))
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Ticket className="w-6 h-6 text-primary" /> Coupons
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discounts and waivers for specific accounts or groups — {liveCount} live.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading || busy}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button size="sm" onClick={openCreate} disabled={busy}>
            <Plus className="w-4 h-4 mr-2" /> New coupon
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-destructive/20 bg-destructive/[0.06] p-4 text-sm text-destructive">{error}</div>
      )}
      {notice && (
        <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner /></div>
      ) : (
        <Card className="divide-y divide-border/50">
          {coupons.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-4 gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                  {c.code ? (
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted text-foreground">{c.code}</span>
                  ) : (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">auto-apply</span>
                  )}
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${c.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>{c.status}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {benefitLabel(c)} · {durationLabel(c)} · {audienceLabel(c)} · {planScopeLabel(c)}
                  {c.expires_at ? ` · expires ${new Date(c.expires_at).toLocaleDateString()}` : ''}
                  {c.max_uses ? ` · ${c.current_uses}/${c.max_uses} used` : ` · ${c.current_uses} used`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Button variant="ghost" size="sm" onClick={() => showRedemptions(c)} disabled={busy}>
                  <Clock className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEdit(c)} disabled={busy}>Edit</Button>
                {c.status !== 'archived' && (
                  <Button variant="ghost" size="sm" onClick={() => archive(c)} disabled={busy}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {coupons.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">No coupons yet. Create one to give an account a discount or a full waiver.</p>
          )}
        </Card>
      )}

      {/* Create / edit */}
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit coupon' : 'New coupon'}</DialogTitle>
            <DialogDescription>
              Target a single account, a list, or a group. The licence hub decides who qualifies and the exact price.
            </DialogDescription>
          </DialogHeader>

          {error && <div className="rounded-lg border border-destructive/20 bg-destructive/[0.06] px-3 py-2 text-sm text-destructive">{error}</div>}

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Name *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Uganda launch — 50% off" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Code (optional)</label>
              <div className="flex gap-2">
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="UG-LAUNCH50" />
                <Button type="button" variant="outline" size="sm" onClick={generateCode}>Generate</Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Leave blank only when auto-apply is on.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Benefit</label>
              <select className="form-select w-full" value={form.benefit_type} onChange={(e) => setForm({ ...form, benefit_type: e.target.value })}>
                {BENEFITS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-3">
              {form.benefit_type === 'percent' && (
                <div className="flex-1">
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Percent off</label>
                  <Input type="number" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: Number(e.target.value) })} />
                </div>
              )}
              {form.benefit_type === 'amount' && (
                <div className="flex-1">
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Amount off (UGX)</label>
                  <Input type="number" value={form.discount_amount} onChange={(e) => setForm({ ...form, discount_amount: Number(e.target.value) })} />
                </div>
              )}
              {form.benefit_type === 'free_days' && (
                <div className="flex-1">
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Free days</label>
                  <Input type="number" value={form.free_days} onChange={(e) => setForm({ ...form, free_days: Number(e.target.value) })} />
                </div>
              )}
              {form.benefit_type === 'waiver' && (
                <p className="text-xs text-muted-foreground pb-2">The account pays nothing — the licence is granted in full.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Lasts for</label>
              <select className="form-select w-full" value={form.duration} onChange={(e) => changeDuration(e.target.value)}>
                {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            {form.duration === 'cycles' && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Number of payments</label>
                <Input type="number" min={1} value={form.duration_cycles} onChange={(e) => changeCycles(Number(e.target.value))} />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Who can use it</label>
              <select className="form-select w-full" value={form.audience_type} onChange={(e) => setForm({ ...form, audience_type: e.target.value, audience_value: '' })}>
                {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              {form.audience_type === 'new' && (
                <>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Within how many days of signup</label>
                  <Input type="number" value={form.audience_value} onChange={(e) => setForm({ ...form, audience_value: e.target.value })} placeholder="30" />
                </>
              )}
              {form.audience_type === 'legacy' && (
                <>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Created before</label>
                  <Input type="date" value={form.audience_value} onChange={(e) => setForm({ ...form, audience_value: e.target.value })} />
                </>
              )}
              {['country', 'industry', 'kind', 'tier'].includes(form.audience_type) && (
                <>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    {form.audience_type === 'country' ? 'Countries (comma separated)' :
                     form.audience_type === 'industry' ? 'Industries (comma separated)' :
                     form.audience_type === 'kind' ? 'Company, institution' : 'Tiers (comma separated)'}
                  </label>
                  {form.audience_type === 'tier' ? (
                    <div className="flex flex-wrap gap-1.5">
                      {tierOptions.map((t) => {
                        const on = form.audience_value.split(',').map((s) => s.trim()).includes(t)
                        return (
                          <button key={t} type="button"
                            onClick={() => {
                              const set = new Set(form.audience_value.split(',').map((s) => s.trim()).filter(Boolean))
                              on ? set.delete(t) : set.add(t)
                              setForm({ ...form, audience_value: Array.from(set).join(', ') })
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs border ${on ? 'border-primary/50 bg-primary/[0.06]' : 'border-border/60 text-muted-foreground'}`}>
                            {on && <Check className="w-3 h-3 inline mr-1" />}{t}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <Input value={form.audience_value} onChange={(e) => setForm({ ...form, audience_value: e.target.value })}
                      placeholder={form.audience_type === 'country' ? 'Uganda, Kenya' : form.audience_type === 'industry' ? 'Education, Retail' : 'company'} />
                  )}
                </>
              )}
              {form.audience_type === 'all' && <p className="text-xs text-muted-foreground pt-6">Any account may use this coupon.</p>}
            </div>

            {form.audience_type === 'list' && (
              <div className="md:col-span-2 rounded-xl border border-border/60 p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <label className="block text-xs font-medium text-muted-foreground">Accounts that can use this coupon</label>
                  <span className="text-[11px] text-muted-foreground">{tenantIds.length} selected</span>
                </div>

                {tenantIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {tenantIds.map((id) => {
                      const account = accountById.get(id)
                      return (
                        <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-primary/[0.08] px-2.5 py-1 text-[11px] text-foreground">
                          <span className="max-w-[220px] truncate">{account ? account.name : id}</span>
                          {account?.owner_email && <span className="text-muted-foreground max-w-[160px] truncate">{account.owner_email}</span>}
                          <button type="button" onClick={() => toggleTenant(id)} className="text-muted-foreground hover:text-destructive" aria-label="Remove account">×</button>
                        </span>
                      )
                    })}
                  </div>
                )}

                <div className="flex gap-2 mb-2">
                  <Input
                    value={accountQuery}
                    onChange={(e) => setAccountQuery(e.target.value)}
                    placeholder="Search accounts by name, owner or email"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => loadAccounts(accountQuery)} disabled={accountsLoading}>
                    {accountsLoading ? 'Searching…' : 'Search'}
                  </Button>
                </div>

                <div className="max-h-44 overflow-y-auto divide-y divide-border/40 rounded-lg border border-border/40">
                  {filteredAccounts.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">No accounts matched. Paste an account id below.</p>
                  ) : filteredAccounts.map((account) => {
                    const on = tenantIds.includes(account.id)
                    return (
                      <button key={account.id} type="button" onClick={() => toggleTenant(account.id)}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 hover:bg-muted/50 ${on ? 'bg-primary/[0.05]' : ''}`}>
                        <span className="min-w-0">
                          <span className="block text-sm text-foreground truncate">{account.name}</span>
                          <span className="block text-[11px] text-muted-foreground truncate">
                            {[account.owner_email || account.email, account.tier ? `${account.tier} plan` : null, account.country]
                              .filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className={`text-[11px] flex-shrink-0 ${on ? 'text-primary' : 'text-muted-foreground'}`}>{on ? 'Selected' : 'Add'}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="flex gap-2 mt-2">
                  <Input
                    value={manualAccountId}
                    onChange={(e) => setManualAccountId(e.target.value)}
                    placeholder="Or paste an account id"
                    className="font-mono text-xs"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManualAccount() } }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addManualAccount}>Add id</Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">The coupon is valid only for the accounts selected here.</p>
              </div>
            )}

            <div className="md:col-span-2 rounded-xl border border-border/60 p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <label className="block text-xs font-medium text-muted-foreground">Which packages can use it</label>
                <span className="text-[11px] text-muted-foreground">
                  {form.applies_plan_codes.length === 0 ? 'Any plan' : `${form.applies_plan_codes.length} selected`}
                </span>
              </div>

              <p className="text-[11px] text-muted-foreground mb-1.5">Package (covers every billing period)</p>
              <div className="flex flex-wrap gap-1.5">
                {tierOptions.map((tier) => {
                  const on = form.applies_plan_codes.includes(tier)
                  return (
                    <button key={tier} type="button" onClick={() => togglePlanCode(tier)}
                      className={`px-2.5 py-1 rounded-lg text-xs border capitalize ${on ? 'border-primary/50 bg-primary/[0.06]' : 'border-border/60 text-muted-foreground'}`}>
                      {on && <Check className="w-3 h-3 inline mr-1" />}{tier}
                    </button>
                  )
                })}
              </div>

              {plans.length > 0 && (
                <>
                  <p className="text-[11px] text-muted-foreground mt-3 mb-1.5">Or pin an exact plan</p>
                  <div className="max-h-36 overflow-y-auto space-y-2 rounded-lg border border-border/40 p-2">
                    {planGroups.map(([tier, rows]) => (
                      <div key={tier}>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{tier}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {rows.map((plan) => {
                            const on = form.applies_plan_codes.includes(plan.code)
                            return (
                              <button key={plan.code} type="button" onClick={() => togglePlanCode(plan.code)}
                                className={`px-2 py-0.5 rounded-md text-[11px] border ${on ? 'border-primary/50 bg-primary/[0.06] text-foreground' : 'border-border/60 text-muted-foreground'}`}>
                                {plan.name} · {plan.interval_months}m
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <p className="text-[11px] text-muted-foreground mt-3 mb-1.5">Billing period (optional — blank = any)</p>
              <div className="flex flex-wrap gap-1.5">
                {INTERVALS.map((m) => {
                  const on = form.applies_intervals.includes(m)
                  return (
                    <button key={m} type="button"
                      onClick={() => {
                        const set = new Set(form.applies_intervals)
                        if (on) set.delete(m)
                        else set.add(m)
                        setForm({ ...form, applies_intervals: Array.from(set) })
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs border ${on ? 'border-primary/50 bg-primary/[0.06]' : 'border-border/60 text-muted-foreground'}`}>
                      {on && <Check className="w-3 h-3 inline mr-1" />}{m}m
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Leave both blank to let the coupon work on every plan.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Total uses (blank = unlimited)</label>
              <Input type="number" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} placeholder="unlimited" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Uses per account (0 = no limit)</label>
              <Input type="number" min={0} value={form.max_uses_per_tenant} onChange={(e) => setForm({ ...form, max_uses_per_tenant: Number(e.target.value) })} />
              <p className="text-[11px] text-muted-foreground mt-1">Set automatically from “Lasts for”; raise it only if you need a hard cap.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Starts</label>
              <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Expires</label>
              <Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
              <p className="text-[11px] text-muted-foreground mt-1">A coupon is only valid inside its window.</p>
            </div>

            <div className="md:col-span-2 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={form.auto_apply} onChange={(e) => setForm({ ...form, auto_apply: e.target.checked })} />
                Apply automatically (no code needed)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status</span>
                <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {['draft', 'active', 'paused', 'archived'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="md:col-span-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Summary: </span>
              {form.benefit_type === 'waiver' ? '100% off' :
               form.benefit_type === 'percent' ? `${form.discount_percent}% off` :
               form.benefit_type === 'amount' ? `UGX ${Number(form.discount_amount).toLocaleString()} off` :
               `+${form.free_days} free days`}
              {' for '}
              {form.audience_type === 'list'
                ? `${tenantIds.length} selected account${tenantIds.length === 1 ? '' : 's'}`
                : (AUDIENCES.find((a) => a.value === form.audience_type)?.label || 'any account')}
              {' on '}
              {form.applies_plan_codes.length === 0 ? 'any plan' : form.applies_plan_codes.map((p) => p.replace(/_/g, ' ')).join(', ')}
              {', lasting '}
              {form.duration === 'forever' ? 'every payment' : form.duration === 'cycles' ? `${form.duration_cycles} payments` : 'the first payment'}.
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Create coupon'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redemptions */}
      <Dialog open={redemptions !== null} onOpenChange={(o) => !o && setRedemptions(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Redemptions</DialogTitle>
            <DialogDescription>Every time this coupon was applied.</DialogDescription>
          </DialogHeader>
          {(redemptions || []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No redemptions yet.</p>
          ) : (
            <div className="divide-y divide-border/40">
              {(redemptions || []).map((r) => (
                <div key={r.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-mono text-xs text-foreground">{r.tenant_id}</p>
                    <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()} · cycle {r.cycle_index}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums text-foreground">
                      {Number(r.amount_before).toLocaleString()} → {Number(r.amount_after).toLocaleString()}
                    </p>
                    <Badge variant="secondary" className="text-[10px]">{r.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
