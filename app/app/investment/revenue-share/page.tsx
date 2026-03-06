'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  GitBranch,
  RefreshCw,
  Settings,
  DollarSign,
  TrendingUp,
  ArrowRight,
  Save,
} from 'lucide-react'

export default function RevenueSharePage() {
  const [fund, setFund] = useState<any>(null)
  const [allocations, setAllocations] = useState<any[]>([])
  const [rules, setRules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState({ sales_profit_alloc_pct: '', min_daily_sales_threshold: '' })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) { setLoading(false); return }

    const { data: fundData } = await supabase
      .from('workspace_funds').select('*').eq('company_id', ctx.companyId).maybeSingle()
    if (!fundData) { setLoading(false); return }
    setFund(fundData)
    setConfig({
      sales_profit_alloc_pct: ((fundData.sales_profit_alloc_pct || 0) * 100).toString(),
      min_daily_sales_threshold: (fundData.min_daily_sales_threshold || 0).toString(),
    })

    const [allocRes, rulesRes] = await Promise.all([
      supabase.from('fund_daily_sales_allocations').select('*').eq('fund_id', fundData.id).order('alloc_date', { ascending: false }).limit(30),
      supabase.from('fund_revenue_share_rules').select('*').eq('fund_id', fundData.id).order('created_at', { ascending: false }),
    ])

    setAllocations(allocRes.data || [])
    setRules(rulesRes.data || [])
    setLoading(false)
  }

  const saveConfig = async () => {
    if (!fund) return
    setSaving(true)
    setMessage(null)
    try {
      const { error } = await supabase.from('workspace_funds').update({
        sales_profit_alloc_pct: Number(config.sales_profit_alloc_pct) / 100,
        min_daily_sales_threshold: Number(config.min_daily_sales_threshold) || 0,
        updated_at: new Date().toISOString(),
      }).eq('id', fund.id)
      if (error) throw error
      setMessage({ type: 'success', text: 'Revenue share configuration saved.' })
      await loadData()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save.' })
    } finally {
      setSaving(false)
    }
  }

  const totalAllocated = allocations.reduce((s, a) => s + Number(a.net_to_fund || 0), 0)
  const totalJackisaFees = allocations.reduce((s, a) => s + Number(a.jackisa_fee || 0), 0)
  const totalSales = allocations.reduce((s, a) => s + Number(a.total_sales || 0), 0)

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in">
        <div className="flex items-center justify-center py-20"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground/40" /></div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Revenue Share</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure how business revenue flows into the investment fund</p>
      </div>

      {/* How it works */}
      <Card className="p-5 border border-border/30 bg-muted/10">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />How the Sales Bridge Works
        </h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-medium">Sale Confirmed</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40" />
          <span className="px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 font-medium">Profit × Alloc %</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40" />
          <span className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-medium">− Jackisa Fee</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40" />
          <span className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 font-medium">− Mgmt Fee</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40" />
          <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-medium">Net → Fund Cash Pool</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40" />
          <span className="px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 font-medium">NAV ↑</span>
        </div>
      </Card>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Sales (30d)', value: `${fund?.currency || 'UGX'} ${totalSales.toLocaleString()}`, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Net Allocated to Fund (30d)', value: `${fund?.currency || 'UGX'} ${totalAllocated.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Jackisa Fees (30d)', value: `${fund?.currency || 'UGX'} ${totalJackisaFees.toLocaleString()}`, icon: GitBranch, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(s => (
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

      {/* Configuration */}
      <Card className="p-5 border border-primary/15 bg-primary/[0.02] space-y-4">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Settings className="w-4 h-4 text-primary" /></div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Revenue Share Configuration</h3>
            <p className="text-[11px] text-muted-foreground/60">Set what percentage of daily net profit flows into the fund</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Profit Allocation Percentage (%)</label>
            <Input
              type="number"
              value={config.sales_profit_alloc_pct}
              onChange={(e) => setConfig({ ...config, sales_profit_alloc_pct: e.target.value })}
              placeholder="e.g. 10"
              min={0} max={100} step={0.1}
            />
            <p className="text-[10px] text-muted-foreground/50 mt-1">What % of estimated profit from each confirmed sale goes to the fund</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Minimum Daily Sales Threshold ({fund?.currency || 'UGX'})</label>
            <Input
              type="number"
              value={config.min_daily_sales_threshold}
              onChange={(e) => setConfig({ ...config, min_daily_sales_threshold: e.target.value })}
              placeholder="0 = no minimum"
              min={0}
            />
            <p className="text-[10px] text-muted-foreground/50 mt-1">Below this amount, no allocation is made (to avoid fragmentation)</p>
          </div>
        </div>
        <div className="pt-3 border-t border-border/30">
          <Button size="sm" onClick={saveConfig} disabled={saving}>
            {saving ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            Save Configuration
          </Button>
        </div>
      </Card>

      {/* Allocation History */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border/30 bg-muted/20">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />Daily Allocation History
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">Total Sales</th>
                <th className="text-right">Est. Profit</th>
                <th>Alloc %</th>
                <th className="text-right">Gross Alloc</th>
                <th className="text-right">Jackisa Fee</th>
                <th className="text-right">Mgmt Fee</th>
                <th className="text-right">Net to Fund</th>
              </tr>
            </thead>
            <tbody>
              {allocations.length === 0 ? (
                <tr><td colSpan={8} className="!py-12 text-center text-muted-foreground/60">No allocations yet. Allocations happen automatically when sales are confirmed.</td></tr>
              ) : (
                allocations.map((a: any) => (
                  <tr key={a.id} className="group">
                    <td className="text-xs text-muted-foreground">{a.alloc_date}</td>
                    <td className="text-right font-mono tabular-nums">{Number(a.total_sales || 0).toLocaleString()}</td>
                    <td className="text-right font-mono tabular-nums">{Number(a.total_profit || 0).toLocaleString()}</td>
                    <td className="font-mono text-xs">{((a.alloc_pct || 0) * 100).toFixed(1)}%</td>
                    <td className="text-right font-mono tabular-nums">{Number(a.gross_allocation || 0).toLocaleString()}</td>
                    <td className="text-right font-mono tabular-nums text-red-500 text-xs">{Number(a.jackisa_fee || 0).toLocaleString()}</td>
                    <td className="text-right font-mono tabular-nums text-amber-600 text-xs">{Number(a.mgmt_fee || 0).toLocaleString()}</td>
                    <td className="text-right font-mono tabular-nums font-bold text-emerald-600">{Number(a.net_to_fund || 0).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
