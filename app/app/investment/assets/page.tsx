'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  PieChart,
  Plus,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  DollarSign,
  Building2,
  MapPin,
  Wrench,
  Briefcase,
  Banknote,
  Box,
} from 'lucide-react'

const assetTypes = ['business', 'land', 'equipment', 'external_investment', 'cash', 'other'] as const
const assetIcons: Record<string, any> = {
  business: Building2, land: MapPin, equipment: Wrench,
  external_investment: Briefcase, cash: Banknote, other: Box,
}
const assetColors: Record<string, string> = {
  business: 'text-blue-600 bg-blue-50', land: 'text-emerald-600 bg-emerald-50',
  equipment: 'text-amber-600 bg-amber-50', external_investment: 'text-purple-600 bg-purple-50',
  cash: 'text-cyan-600 bg-cyan-50', other: 'text-gray-600 bg-gray-50',
}

export default function PortfolioManagerPage() {
  const [fund, setFund] = useState<any>(null)
  const [assets, setAssets] = useState<any[]>([])
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showEntryForm, setShowEntryForm] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [form, setForm] = useState({ asset_name: '', asset_type: 'business', description: '', acquisition_cost: '' })
  const [entryForm, setEntryForm] = useState({ entry_type: 'revenue', amount: '', description: '' })

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) { setLoading(false); return }
    setUserId(ctx.userId)

    const { data: fundData } = await supabase
      .from('workspace_funds').select('*').eq('company_id', ctx.companyId).maybeSingle()
    if (!fundData) { setLoading(false); return }
    setFund(fundData)

    const [assetRes, entryRes] = await Promise.all([
      supabase.from('fund_assets').select('*').eq('fund_id', fundData.id).eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('fund_asset_entries').select('*, fund_assets(asset_name)').eq('fund_assets.fund_id', fundData.id).order('created_at', { ascending: false }).limit(50),
    ])

    setAssets(assetRes.data || [])
    setEntries(entryRes.data || [])
    setLoading(false)
  }

  const createAsset = async () => {
    if (!fund || !form.asset_name || !form.acquisition_cost) return
    await supabase.from('fund_assets').insert({
      fund_id: fund.id,
      asset_name: form.asset_name,
      asset_type: form.asset_type,
      description: form.description || null,
      acquisition_cost: Number(form.acquisition_cost),
      current_value: Number(form.acquisition_cost),
    })
    setForm({ asset_name: '', asset_type: 'business', description: '', acquisition_cost: '' })
    setShowForm(false)
    await loadData()
  }

  const addEntry = async (assetId: string) => {
    if (!entryForm.amount || !entryForm.entry_type) return
    const amount = Number(entryForm.amount)

    await supabase.from('fund_asset_entries').insert({
      asset_id: assetId,
      entry_type: entryForm.entry_type,
      amount,
      description: entryForm.description || null,
      recorded_by: userId,
    })

    const asset = assets.find(a => a.id === assetId)
    if (asset) {
      const delta = entryForm.entry_type === 'revenue' ? amount
        : entryForm.entry_type === 'expense' ? -amount
        : 0
      const newValue = entryForm.entry_type === 'revaluation' ? amount : Number(asset.current_value || 0) + delta
      const updates: any = { current_value: newValue, updated_at: new Date().toISOString() }
      if (entryForm.entry_type === 'revenue') updates.total_revenue = Number(asset.total_revenue || 0) + amount
      if (entryForm.entry_type === 'expense') updates.total_expenses = Number(asset.total_expenses || 0) + amount
      if (entryForm.entry_type === 'revaluation') updates.last_revaluation_date = new Date().toISOString().split('T')[0]
      await supabase.from('fund_assets').update(updates).eq('id', assetId)
    }

    setEntryForm({ entry_type: 'revenue', amount: '', description: '' })
    setShowEntryForm(null)
    await loadData()
  }

  const totalAssetValue = assets.reduce((s, a) => s + Number(a.current_value || 0), 0)
  const totalRevenue = assets.reduce((s, a) => s + Number(a.total_revenue || 0), 0)
  const totalExpenses = assets.reduce((s, a) => s + Number(a.total_expenses || 0), 0)

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
        <div className="flex items-center justify-center py-20"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground/40" /></div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Portfolio Manager</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage fund assets, log revenue &amp; expenses, revalue holdings</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-1.5" />Add Asset
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 stagger-children">
        {[
          { label: 'Total Asset Value', value: `${fund?.currency || 'UGX'} ${totalAssetValue.toLocaleString()}`, icon: PieChart, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Total Revenue Logged', value: `${fund?.currency || 'UGX'} ${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Expenses Logged', value: `${fund?.currency || 'UGX'} ${totalExpenses.toLocaleString()}`, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
        ].map((s) => (
          <Card key={s.label} className="stat-card p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${s.bg}`}><s.icon className={`w-4 h-4 ${s.color}`} /></div>
              <div>
                <p className="text-lg font-bold text-foreground tracking-tight">{s.value}</p>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{s.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* New Asset Form */}
      {showForm && (
        <Card className="p-5 border border-primary/15 bg-primary/[0.02] space-y-3">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Plus className="w-4 h-4 text-primary" /></div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Add Fund Asset</h3>
              <p className="text-[11px] text-muted-foreground/60">Register a new asset in the fund portfolio</p>
            </div>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            <Input placeholder="Asset name *" value={form.asset_name} onChange={(e) => setForm({ ...form, asset_name: e.target.value })} />
            <select className="form-select" value={form.asset_type} onChange={(e) => setForm({ ...form, asset_type: e.target.value })}>
              {assetTypes.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
            <Input type="number" placeholder="Acquisition cost *" value={form.acquisition_cost} onChange={(e) => setForm({ ...form, acquisition_cost: e.target.value })} />
            <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="pt-3 border-t border-border/30 flex gap-2">
            <Button size="sm" onClick={createAsset}>Save Asset</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Assets Grid */}
      {assets.length === 0 ? (
        <Card className="p-12 text-center">
          <PieChart className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground/60">No assets in the fund yet. Add your first asset above.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {assets.map((asset: any) => {
            const Icon = assetIcons[asset.asset_type] || Box
            const color = assetColors[asset.asset_type] || 'text-gray-600 bg-gray-50'
            const [iconColor, iconBg] = color.split(' ')
            const profit = Number(asset.total_revenue || 0) - Number(asset.total_expenses || 0)
            const costGrowth = Number(asset.acquisition_cost) > 0
              ? ((Number(asset.current_value) - Number(asset.acquisition_cost)) / Number(asset.acquisition_cost)) * 100
              : 0

            return (
              <Card key={asset.id} className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${iconBg}`}><Icon className={`w-5 h-5 ${iconColor}`} /></div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">{asset.asset_name}</h4>
                      <p className="text-[10px] text-muted-foreground/50 capitalize">{asset.asset_type.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold font-mono tabular-nums">{fund?.currency} {Number(asset.current_value || 0).toLocaleString()}</p>
                    <p className={`text-[10px] font-mono ${costGrowth >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {costGrowth >= 0 ? '+' : ''}{costGrowth.toFixed(1)}% from cost
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center py-2 bg-muted/20 rounded-lg">
                  <div>
                    <p className="text-[9px] text-muted-foreground/50 uppercase">Cost</p>
                    <p className="text-xs font-mono">{Number(asset.acquisition_cost || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted-foreground/50 uppercase">Revenue</p>
                    <p className="text-xs font-mono text-emerald-600">{Number(asset.total_revenue || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted-foreground/50 uppercase">Net P&L</p>
                    <p className={`text-xs font-mono font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{profit.toLocaleString()}</p>
                  </div>
                </div>

                {/* Entry form for this asset */}
                {showEntryForm === asset.id ? (
                  <div className="space-y-2 p-3 rounded-lg bg-muted/10 border border-border/20">
                    <div className="grid grid-cols-3 gap-2">
                      <select className="form-select text-xs" value={entryForm.entry_type} onChange={(e) => setEntryForm({ ...entryForm, entry_type: e.target.value })}>
                        <option value="revenue">Revenue</option>
                        <option value="expense">Expense</option>
                        <option value="revaluation">Revaluation</option>
                      </select>
                      <Input type="number" placeholder="Amount" className="text-xs" value={entryForm.amount} onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })} />
                      <Input placeholder="Description" className="text-xs" value={entryForm.description} onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => addEntry(asset.id)}>Log Entry</Button>
                      <Button size="sm" variant="outline" onClick={() => setShowEntryForm(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setShowEntryForm(asset.id)}>
                    <DollarSign className="w-3.5 h-3.5 mr-1.5" />Log Revenue / Expense / Revalue
                  </Button>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
