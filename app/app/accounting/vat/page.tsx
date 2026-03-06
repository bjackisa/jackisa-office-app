'use client'

import { useEffect, useState } from 'react'
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

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight mb-1">VAT Management</h1>
          <p className="text-sm text-muted-foreground">Calculate and track VAT for Uganda (18% standard rate)</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-muted-foreground">
            <Download className="w-4 h-4 mr-1.5" />
            Export
          </Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-1.5" />
            New VAT Period
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Output VAT', value: formatUGX(totalOutput), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Total Input VAT', value: formatUGX(totalInput), icon: TrendingDown, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Net VAT Payable', value: formatUGX(totalNet), icon: DollarSign, color: totalNet >= 0 ? 'text-red-600' : 'text-emerald-600', bg: totalNet >= 0 ? 'bg-red-50' : 'bg-emerald-50' },
          { label: 'VAT Rate', value: '18%', icon: Percent, color: 'text-foreground', bg: 'bg-muted/50' },
        ].map(stat => (
          <Card key={stat.label} className="p-4 border border-border/50 bg-card">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-foreground truncate">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* VAT Records Table */}
      <Card className="p-3 border border-border/50"><Input placeholder="Search period or status..." value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} /></Card>
        <div className="lg:col-span-2">
          <Card className="border border-border/50 bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">VAT Period Records</h3>
              <span className="text-xs text-muted-foreground/60">{records.length} records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30 bg-muted/30">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Period</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sales</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Output VAT</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Purchases</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Input VAT</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net VAT</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {loading ? (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground/60">Loading VAT records...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center">
                        <Percent className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground/60 font-medium">No VAT records yet</p>
                        <p className="text-xs text-muted-foreground/40 mt-1">Create a VAT period to start tracking</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r) => {
                      const vat = calcVAT(r.total_sales || 0, r.total_purchases || 0)
                      const cfg = statusCfg[r.status] || statusCfg.draft
                      return (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <td className="px-5 py-3 text-sm font-medium text-foreground">
                            {r.period_start ? new Date(r.period_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}
                          </td>
                          <td className="px-5 py-3 text-sm text-muted-foreground text-right font-mono">{formatUGX(r.total_sales || 0)}</td>
                          <td className="px-5 py-3 text-sm text-blue-600 text-right font-mono font-medium">{formatUGX(vat.outputVAT)}</td>
                          <td className="px-5 py-3 text-sm text-muted-foreground text-right font-mono">{formatUGX(r.total_purchases || 0)}</td>
                          <td className="px-5 py-3 text-sm text-emerald-600 text-right font-mono font-medium">{formatUGX(vat.inputVAT)}</td>
                          <td className={`px-5 py-3 text-sm text-right font-mono font-bold ${vat.netVAT >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {formatUGX(vat.netVAT)}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
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
