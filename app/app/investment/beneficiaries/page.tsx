'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { ensureFundMemberPosition } from '@/lib/investment-membership'
import { getEffectiveFundNav } from '@/lib/investment-metrics'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Heart,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  Shield,
  AlertTriangle,
  Wallet,
} from 'lucide-react'
import Link from 'next/link'

export default function BeneficiariesPage() {
  const [fund, setFund] = useState<any>(null)
  const [position, setPosition] = useState<any>(null)
  const [beneficiaries, setBeneficiaries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    full_name: '', relationship: '', national_id: '', phone: '', email: '',
    share_pct: '', is_minor: false, guardian_name: '', guardian_national_id: '', guardian_phone: '',
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId || !ctx.userId) { setLoading(false); return }

    const { data: fundData } = await supabase
      .from('workspace_funds').select('*').eq('company_id', ctx.companyId).maybeSingle()
    if (!fundData) { setLoading(false); return }
    setFund(fundData)

    const { data: empData } = await supabase
      .from('company_employees').select('id').eq('company_id', ctx.companyId).eq('user_id', ctx.userId).maybeSingle()
    if (!empData) { setLoading(false); return }

    const posData = await ensureFundMemberPosition(ctx.companyId, ctx.userId, fundData.id)
    if (!posData) { setLoading(false); return }
    setPosition(posData)

    const { data: benData } = await supabase
      .from('fund_beneficiaries').select('*').eq('member_position_id', posData.id).order('share_pct', { ascending: false })
    setBeneficiaries(benData || [])
    setLoading(false)
  }

  const totalSharePct = beneficiaries.reduce((s, b) => s + Number(b.share_pct || 0), 0)
  const remainingPct = 100 - totalSharePct

  const addBeneficiary = async () => {
    if (!position || !form.full_name || !form.relationship || !form.share_pct) return
    setError(null)

    const sharePct = Number(form.share_pct)
    if (sharePct <= 0 || sharePct > remainingPct) {
      setError(`Share must be between 0.01% and ${remainingPct.toFixed(2)}% (remaining).`)
      return
    }

    await supabase.from('fund_beneficiaries').insert({
      member_position_id: position.id,
      full_name: form.full_name,
      relationship: form.relationship,
      national_id: form.national_id || null,
      phone: form.phone || null,
      email: form.email || null,
      share_pct: sharePct,
      is_minor: form.is_minor,
      guardian_name: form.is_minor ? form.guardian_name || null : null,
      guardian_national_id: form.is_minor ? form.guardian_national_id || null : null,
      guardian_phone: form.is_minor ? form.guardian_phone || null : null,
    })

    setForm({ full_name: '', relationship: '', national_id: '', phone: '', email: '', share_pct: '', is_minor: false, guardian_name: '', guardian_national_id: '', guardian_phone: '' })
    setShowForm(false)
    await loadData()
  }

  const removeBeneficiary = async (id: string) => {
    await supabase.from('fund_beneficiaries').delete().eq('id', id)
    await loadData()
  }

  const currentNav = fund ? getEffectiveFundNav(fund) : 1
  const portfolioValue = position ? (position.total_units || 0) * currentNav : 0

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in">
        <div className="flex items-center justify-center py-20"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground/40" /></div>
      </div>
    )
  }

  if (!fund || !position) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in text-center py-20">
        <Wallet className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold">No Investment Position</h2>
        <p className="text-sm text-muted-foreground mb-4">You need an investment position before designating beneficiaries.</p>
        <Link href="/app/investment/buy"><Button size="sm">Buy Units First</Button></Link>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Beneficiaries</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Designate who inherits your investment units</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} disabled={remainingPct <= 0}>
          <Plus className="w-4 h-4 mr-1.5" />Add Beneficiary
        </Button>
      </div>

      {/* Allocation Summary */}
      <Card className="p-5 border border-primary/15 bg-primary/[0.02]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Allocation Summary</p>
          <p className="text-xs text-muted-foreground">Portfolio: <span className="font-bold font-mono">{fund.currency} {portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></p>
        </div>
        <div className="h-4 rounded-full overflow-hidden flex bg-muted/30 mb-2">
          {beneficiaries.map((b, i) => {
            const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-cyan-500', 'bg-rose-500']
            return (
              <div key={b.id} className={`${colors[i % colors.length]} transition-all duration-500`} style={{ width: `${b.share_pct}%` }} title={`${b.full_name}: ${b.share_pct}%`} />
            )
          })}
          {remainingPct > 0 && (
            <div className="bg-muted/20" style={{ width: `${remainingPct}%` }} title={`Unallocated: ${remainingPct}%`} />
          )}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Allocated: <span className="font-bold">{totalSharePct.toFixed(1)}%</span></span>
          <span className={`font-medium ${remainingPct > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {remainingPct > 0 ? `${remainingPct.toFixed(1)}% unallocated` : 'Fully allocated'}
          </span>
        </div>
      </Card>

      {totalSharePct > 0 && totalSharePct < 100 && (
        <div className="flex items-center gap-2 text-amber-700 bg-amber-50 px-4 py-3 rounded-xl border border-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <p className="text-xs">Your beneficiary allocations total {totalSharePct.toFixed(1)}%. The remaining {remainingPct.toFixed(1)}% is undesignated.</p>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-600 border border-red-200">{error}</div>
      )}

      {/* Add Form */}
      {showForm && (
        <Card className="p-5 space-y-4 border border-primary/15 bg-primary/[0.02]">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Heart className="w-4 h-4 text-primary" /></div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Add Beneficiary</h3>
              <p className="text-[11px] text-muted-foreground/60">Remaining allocation: {remainingPct.toFixed(1)}%</p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <Input placeholder="Full name *" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <select className="form-select" value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })}>
              <option value="">Relationship *</option>
              <option value="spouse">Spouse</option>
              <option value="child">Child</option>
              <option value="parent">Parent</option>
              <option value="sibling">Sibling</option>
              <option value="other">Other</option>
            </select>
            <Input type="number" placeholder={`Share % (max ${remainingPct.toFixed(1)}%) *`} value={form.share_pct} onChange={(e) => setForm({ ...form, share_pct: e.target.value })} min={0.01} max={remainingPct} step={0.01} />
            <Input placeholder="National ID / Passport" value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} />
            <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_minor} onChange={(e) => setForm({ ...form, is_minor: e.target.checked })} className="rounded" />
            <span className="text-xs text-muted-foreground">This beneficiary is a minor</span>
          </label>
          {form.is_minor && (
            <div className="grid md:grid-cols-3 gap-3 p-3 rounded-lg bg-amber-50/50 border border-amber-100">
              <Input placeholder="Guardian name" value={form.guardian_name} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} />
              <Input placeholder="Guardian ID" value={form.guardian_national_id} onChange={(e) => setForm({ ...form, guardian_national_id: e.target.value })} />
              <Input placeholder="Guardian phone" value={form.guardian_phone} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} />
            </div>
          )}
          <div className="pt-3 border-t border-border/30 flex gap-2">
            <Button size="sm" onClick={addBeneficiary}>Save Beneficiary</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Beneficiaries List */}
      {beneficiaries.length === 0 ? (
        <Card className="p-12 text-center">
          <Heart className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground/60">No beneficiaries designated yet.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {beneficiaries.map((b: any, i: number) => {
            const colors = ['border-blue-200 bg-blue-50/30', 'border-emerald-200 bg-emerald-50/30', 'border-purple-200 bg-purple-50/30', 'border-amber-200 bg-amber-50/30']
            const inheritanceValue = portfolioValue * (b.share_pct / 100)
            return (
              <Card key={b.id} className={`p-5 border ${colors[i % colors.length]}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center text-sm font-bold text-foreground border border-border/30">
                      {b.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">{b.full_name}</h4>
                      <p className="text-[10px] text-muted-foreground/60 capitalize">{b.relationship}{b.is_minor ? ' (Minor)' : ''}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeBeneficiary(b.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 rounded-lg bg-white/60">
                    <p className="text-[9px] text-muted-foreground/50 uppercase">Share</p>
                    <p className="text-lg font-bold font-mono">{b.share_pct}%</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/60">
                    <p className="text-[9px] text-muted-foreground/50 uppercase">Inheritance Value</p>
                    <p className="text-lg font-bold font-mono text-emerald-600">{fund.currency} {inheritanceValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
                {b.is_minor && b.guardian_name && (
                  <div className="mt-2 p-2 rounded-lg bg-amber-50/50 border border-amber-100">
                    <p className="text-[9px] text-amber-700 uppercase font-medium">Guardian: {b.guardian_name}</p>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
