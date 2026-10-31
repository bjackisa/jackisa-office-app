'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Package, Plus, Power, RefreshCw } from 'lucide-react'

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
  is_active: boolean
}
type Feature = { slug: string; name: string; category: string; min_tier: string; is_active: boolean }

const TIERS = ['basic', 'pro', 'platinum', 'enterprise']
const INTERVALS = [1, 3, 6, 12, 24, 36]

async function authedFetch(body: any) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/admin/catalog', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

/**
 * Package manager. Super-admin only — this is where new plans and features are
 * created for the whole platform, exactly like jackisa.com's package screen.
 */
export default function CatalogConsolePage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'plans' | 'features'>('plans')

  const [planForm, setPlanForm] = useState({
    code: '',
    name: '',
    tier: 'basic',
    interval_months: 1,
    price: 0,
    max_employees: 10,
    max_students: 0,
    storage_gb: 5,
  })
  const [featureForm, setFeatureForm] = useState({ slug: '', name: '', category: 'core', min_tier: 'basic' })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [p, f] = await Promise.all([
      authedFetch({ kind: 'plans', action: 'list' }),
      authedFetch({ kind: 'features', action: 'list' }),
    ])
    if (!p.ok) setError(p.error || 'Could not load the catalogue')
    setPlans(p.data?.plans || [])
    setFeatures(f.data?.features || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const run = async (body: any) => {
    setBusy(true)
    setError(null)
    const res = await authedFetch(body)
    if (!res.ok) setError(res.error || 'Request failed')
    setBusy(false)
    await load()
  }

  const createPlan = async () => {
    if (!planForm.code || !planForm.name) {
      setError('Plan code and name are required')
      return
    }
    await run({ kind: 'plans', action: 'create', ...planForm })
    setPlanForm({ code: '', name: '', tier: 'basic', interval_months: 1, price: 0, max_employees: 10, max_students: 0, storage_gb: 5 })
  }

  const createFeature = async () => {
    if (!featureForm.slug) {
      setError('Feature slug is required')
      return
    }
    await run({ kind: 'features', action: 'create', ...featureForm })
    setFeatureForm({ slug: '', name: '', category: 'core', min_tier: 'basic' })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" /> Package Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create plans and feature flags for the whole platform. Changes go live on the next sync — no deploy.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading || busy}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-destructive/20 bg-destructive/[0.06] p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {(['plans', 'features'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === t ? 'bg-primary text-white' : 'bg-muted/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'plans' ? 'Plans' : 'Features'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner /></div>
      ) : tab === 'plans' ? (
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4" /> New plan
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Input placeholder="code (e.g. pro_3m)" value={planForm.code} onChange={(e) => setPlanForm({ ...planForm, code: e.target.value })} />
              <Input placeholder="Name" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} />
              <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={planForm.tier} onChange={(e) => setPlanForm({ ...planForm, tier: e.target.value })}>
                {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={planForm.interval_months} onChange={(e) => setPlanForm({ ...planForm, interval_months: Number(e.target.value) })}>
                {INTERVALS.map((m) => <option key={m} value={m}>{m} month{m === 1 ? '' : 's'}</option>)}
              </select>
              <Input type="number" placeholder="Price" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: Number(e.target.value) })} />
              <Input type="number" placeholder="Max employees" value={planForm.max_employees} onChange={(e) => setPlanForm({ ...planForm, max_employees: Number(e.target.value) })} />
              <Input type="number" placeholder="Max students" value={planForm.max_students} onChange={(e) => setPlanForm({ ...planForm, max_students: Number(e.target.value) })} />
              <Input type="number" placeholder="Storage GB" value={planForm.storage_gb} onChange={(e) => setPlanForm({ ...planForm, storage_gb: Number(e.target.value) })} />
            </div>
            <Button className="mt-4" onClick={createPlan} disabled={busy}>Create plan</Button>
          </Card>

          <Card className="divide-y divide-border/50">
            {plans.map((p) => (
              <div key={p.code} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{p.name} <span className="text-muted-foreground font-normal">· {p.code}</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.tier} · {p.interval_months}m · {p.currency} {Number(p.price).toLocaleString()} · {p.max_employees || '∞'} emp · {p.max_students || '—'} students · {p.storage_gb} GB
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${p.is_active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                    {p.is_active ? 'active' : 'inactive'}
                  </span>
                  {p.is_active && (
                    <Button variant="ghost" size="sm" onClick={() => run({ kind: 'plans', action: 'deactivate', code: p.code })} disabled={busy}>
                      <Power className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {plans.length === 0 && <p className="p-6 text-sm text-muted-foreground">No plans yet.</p>}
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4" /> New feature flag
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Input placeholder="slug (e.g. unit_trust)" value={featureForm.slug} onChange={(e) => setFeatureForm({ ...featureForm, slug: e.target.value })} />
              <Input placeholder="Name" value={featureForm.name} onChange={(e) => setFeatureForm({ ...featureForm, name: e.target.value })} />
              <Input placeholder="Category" value={featureForm.category} onChange={(e) => setFeatureForm({ ...featureForm, category: e.target.value })} />
              <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={featureForm.min_tier} onChange={(e) => setFeatureForm({ ...featureForm, min_tier: e.target.value })}>
                {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <Button className="mt-4" onClick={createFeature} disabled={busy}>Create feature</Button>
          </Card>

          <Card className="divide-y divide-border/50">
            {features.map((f) => (
              <div key={f.slug} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{f.name} <span className="text-muted-foreground font-normal">· {f.slug}</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.category} · needs {f.min_tier}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${f.is_active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                    {f.is_active ? 'active' : 'inactive'}
                  </span>
                  {f.is_active && (
                    <Button variant="ghost" size="sm" onClick={() => run({ kind: 'features', action: 'deactivate', slug: f.slug })} disabled={busy}>
                      <Power className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {features.length === 0 && <p className="p-6 text-sm text-muted-foreground">No features yet.</p>}
          </Card>
        </div>
      )}
    </div>
  )
}
