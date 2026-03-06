'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Plus, Download, Eye, Calculator, Info,
  TrendingUp, TrendingDown, DollarSign, Percent,
} from 'lucide-react'


const VAT_RATE = 0.18

const statusCfg: Record<string, { label: string; bg: string; text: string; border: string }> = {
  draft: { label: 'Draft', bg: 'bg-muted/50', text: 'text-muted-foreground', border: 'border-border' },
  submitted: { label: 'Submitted', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  filed: { label: 'Filed', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
}

export default function VATPage() {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Quick calculator state
  const [calcSales, setCalcSales] = useState('')
  const [calcPurchases, setCalcPurchases] = useState('')

  useEffect(() => {
    loadRecords()
  }, [])

  const loadRecords = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: empData } = await supabase
        .from('company_employees')
        .select('company_id')
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .limit(1)
        .single()

      if (!empData) return

      const { data, error } = await supabase
        .from('vat_records')
        .select('*')
        .eq('company_id', empData.company_id)
        .order('period_start', { ascending: false })

      if (!error && data) setRecords(data)
    } catch (err) {
      console.error('Failed to load VAT records:', err)
    } finally {
      setLoading(false)
    }
  }

  const calcVAT = (sales: number, purchases: number) => {
    const outputVAT = sales * VAT_RATE
    const inputVAT = purchases * VAT_RATE
    return { outputVAT, inputVAT, netVAT: outputVAT - inputVAT }
  }

  const totalSales = records.reduce((s, r) => s + (r.total_sales || 0), 0)
  const totalPurchases = records.reduce((s, r) => s + (r.total_purchases || 0), 0)
  const totalOutput = totalSales * VAT_RATE
  const totalInput = totalPurchases * VAT_RATE
  const totalNet = totalOutput - totalInput

  const formatUGX = (n: number) => `UGX ${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`

  // Quick calculator
  const qSales = parseFloat(calcSales) || 0
  const qPurchases = parseFloat(calcPurchases) || 0
  const qCalc = calcVAT(qSales, qPurchases)

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return records.filter(r => {
      if (!q) return true
      const period = r.period_start ? new Date(r.period_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toLowerCase() : ''
      return period.includes(q) || (r.status || '').toLowerCase().includes(q)
    })
  }, [records, searchQuery])

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">VAT Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Calculate and track VAT for Uganda (18% standard rate)</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1.5" />
            Export
          </Button>
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New VAT Period
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger-children">
        {[
          { label: 'Output VAT', value: formatUGX(totalOutput), icon: TrendingUp, gradient: 'from-blue-500 to-blue-600' },
          { label: 'Input VAT', value: formatUGX(totalInput), icon: TrendingDown, gradient: 'from-emerald-500 to-green-600' },
          { label: 'Net Payable', value: formatUGX(totalNet), icon: DollarSign, gradient: totalNet >= 0 ? 'from-red-500 to-rose-600' : 'from-emerald-500 to-green-600' },
          { label: 'VAT Rate', value: '18%', icon: Percent, gradient: 'from-slate-500 to-slate-600' },
        ].map(stat => (
          <Card key={stat.label} className="stat-card p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-sm flex-shrink-0`}>
                <stat.icon className="w-4.5 h-4.5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-foreground truncate tracking-tight">{stat.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* VAT Records Table */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-3">
            <Input placeholder="Search period or status..." value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} />
          </Card>
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">VAT Period Records</h3>
              <span className="badge badge-neutral">{records.length} records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th className="text-right">Sales</th>
                    <th className="text-right">Output VAT</th>
                    <th className="text-right">Purchases</th>
                    <th className="text-right">Input VAT</th>
                    <th className="text-right">Net VAT</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="!py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <p className="text-sm text-muted-foreground">Loading VAT records...</p>
                      </div>
                    </td></tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="!py-16 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                          <Percent className="w-6 h-6 text-muted-foreground/25" />
                        </div>
                        <p className="text-sm text-muted-foreground font-medium">No VAT records yet</p>
                        <p className="text-xs text-muted-foreground/40 mt-1">Create a VAT period to start tracking</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r) => {
                      const vat = calcVAT(r.total_sales || 0, r.total_purchases || 0)
                      const cfg = statusCfg[r.status] || statusCfg.draft
                      return (
                        <tr key={r.id} className="group">
                          <td className="font-medium text-foreground whitespace-nowrap">
                            {r.period_start ? new Date(r.period_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}
                          </td>
                          <td className="text-right font-mono text-muted-foreground tabular-nums">{formatUGX(r.total_sales || 0)}</td>
                          <td className="text-right font-mono text-blue-600 font-medium tabular-nums">{formatUGX(vat.outputVAT)}</td>
                          <td className="text-right font-mono text-muted-foreground tabular-nums">{formatUGX(r.total_purchases || 0)}</td>
                          <td className="text-right font-mono text-emerald-600 font-medium tabular-nums">{formatUGX(vat.inputVAT)}</td>
                          <td className={`text-right font-mono font-bold tabular-nums ${vat.netVAT >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {formatUGX(vat.netVAT)}
                          </td>
                          <td>
                            <span className={`badge ${
                              r.status === 'filed' ? 'badge-success' :
                              r.status === 'pending' ? 'badge-warning' :
                              r.status === 'overdue' ? 'badge-danger' : 'badge-neutral'
                            }`}>
                              {cfg.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div className="px-5 py-3 border-t border-border/20 bg-muted/10">
                <p className="text-xs text-muted-foreground/50">Showing <span className="font-semibold text-foreground">{filtered.length}</span> records</p>
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar: Quick Calculator + Formula */}
        <div className="lg:col-span-1 space-y-4">
          {/* Quick Calculator */}
          <Card className="border border-border/50 bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-blue-50">
                <Calculator className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Quick VAT Calculator</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Total Sales (UGX)</label>
                <Input
                  type="number"
                  placeholder="e.g. 10,000,000"
                  value={calcSales}
                  onChange={(e) => setCalcSales(e.target.value)}
                  className="bg-muted/50 border-border"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Total Purchases (UGX)</label>
                <Input
                  type="number"
                  placeholder="e.g. 4,000,000"
                  value={calcPurchases}
                  onChange={(e) => setCalcPurchases(e.target.value)}
                  className="bg-muted/50 border-border"
                />
              </div>
              {(qSales > 0 || qPurchases > 0) && (
                <div className="pt-3 border-t border-border/30 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Output VAT (18%)</span>
                    <span className="font-mono font-medium text-blue-600">{formatUGX(qCalc.outputVAT)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Input VAT (18%)</span>
                    <span className="font-mono font-medium text-emerald-600">{formatUGX(qCalc.inputVAT)}</span>
                  </div>
                  <div className="border-t border-border/30 pt-2 flex justify-between text-sm">
                    <span className="font-medium text-foreground">Net VAT</span>
                    <span className={`font-mono font-bold ${qCalc.netVAT >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatUGX(qCalc.netVAT)}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60">
                    {qCalc.netVAT >= 0 ? 'Payable to URA' : 'Refund from URA'}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Formula Reference */}
          <Card className="border border-border/50 bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-foreground">VAT Formula</h3>
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-foreground font-mono font-medium">Output VAT = Sales × 18%</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">VAT charged on sales to customers</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-foreground font-mono font-medium">Input VAT = Purchases × 18%</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">VAT paid on business purchases</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs text-blue-800 font-mono font-semibold">Net VAT = Output - Input</p>
                <p className="text-[10px] text-blue-600 mt-0.5">Positive = payable to URA | Negative = refund</p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border/30">
              <p className="text-[10px] text-muted-foreground/60">
                Based on Uganda Revenue Authority (URA) guidelines. Standard rate: <span className="font-semibold text-muted-foreground">18%</span>. Exemptions apply to certain goods and services.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
