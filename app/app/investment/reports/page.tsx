'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FileText,
  Download,
  RefreshCw,
  Calendar,
  DollarSign,
  TrendingUp,
  Shield,
} from 'lucide-react'

export default function InvestmentReportsPage() {
  const [fund, setFund] = useState<any>(null)
  const [position, setPosition] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3)
    return d.toISOString().split('T')[0]
  })
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().split('T')[0])

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

    const { data: posData } = await supabase
      .from('fund_member_positions').select('*').eq('fund_id', fundData.id).eq('employee_id', empData.id).maybeSingle()
    setPosition(posData)

    if (posData) {
      const { data: txData } = await supabase
        .from('fund_transactions').select('*').eq('member_position_id', posData.id)
        .gte('created_at', periodStart + 'T00:00:00')
        .lte('created_at', periodEnd + 'T23:59:59')
        .order('created_at', { ascending: true })
      setTransactions(txData || [])
    }

    setLoading(false)
  }

  const loadPeriod = async () => {
    if (!position) return
    setLoading(true)
    const { data: txData } = await supabase
      .from('fund_transactions').select('*').eq('member_position_id', position.id)
      .gte('created_at', periodStart + 'T00:00:00')
      .lte('created_at', periodEnd + 'T23:59:59')
      .order('created_at', { ascending: true })
    setTransactions(txData || [])
    setLoading(false)
  }

  const summary = useMemo(() => {
    const contributions = transactions.filter(t => t.tx_type === 'contribution')
    const redemptions = transactions.filter(t => t.tx_type === 'redemption')
    const totalContributed = contributions.reduce((s, t) => s + Number(t.net_amount || 0), 0)
    const totalRedeemed = redemptions.reduce((s, t) => s + Number(t.net_amount || 0), 0)
    const totalFees = transactions.reduce((s, t) => s + Number(t.jackisa_fee || 0) + Number(t.mgmt_fee || 0), 0)
    const totalTax = transactions.reduce((s, t) => s + Number(t.withholding_tax || 0), 0)
    const unitsBought = contributions.reduce((s, t) => s + Number(t.units_transacted || 0), 0)
    const unitsSold = redemptions.reduce((s, t) => s + Number(t.units_transacted || 0), 0)
    return { totalContributed, totalRedeemed, totalFees, totalTax, unitsBought, unitsSold, txCount: transactions.length }
  }, [transactions])

  const currentValue = position ? (position.total_units || 0) * (fund?.nav_per_unit || 1) : 0
  const currency = fund?.currency || 'UGX'

  const exportCSV = () => {
    const headers = ['Date', 'Type', 'Gross', 'Jackisa Fee', 'Mgmt Fee', 'WHT', 'Net', 'Units', 'NAV']
    const rows = transactions.map(t => [
      new Date(t.created_at).toLocaleDateString(),
      t.tx_type,
      t.gross_amount,
      t.jackisa_fee || 0,
      t.mgmt_fee || 0,
      t.withholding_tax || 0,
      t.net_amount,
      t.units_transacted || 0,
      t.nav_at_transaction,
    ].map(v => JSON.stringify(v ?? '')).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `investment-statement-${periodStart}-to-${periodEnd}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in">
        <div className="flex items-center justify-center py-20"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground/40" /></div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Reports & Statements</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Generate your investment statement for any period</p>
        </div>
        {transactions.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1.5" />Export CSV
          </Button>
        )}
      </div>

      {/* Period Selector */}
      <Card className="p-5 border border-primary/15 bg-primary/[0.02] space-y-3">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Calendar className="w-4 h-4 text-primary" /></div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Statement Period</h3>
            <p className="text-[11px] text-muted-foreground/60">Select a date range to generate your statement</p>
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">From</label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">To</label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <Button size="sm" onClick={loadPeriod}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Generate</Button>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {[
          { label: 'Total Contributed', value: `${currency} ${summary.totalContributed.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Redeemed', value: `${currency} ${summary.totalRedeemed.toLocaleString()}`, icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Total Fees Paid', value: `${currency} ${summary.totalFees.toLocaleString()}`, icon: Shield, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Withholding Tax', value: `${currency} ${summary.totalTax.toLocaleString()}`, icon: FileText, color: 'text-red-600', bg: 'bg-red-50' },
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

      {/* Current Position Summary */}
      {position && (
        <Card className="p-5 bg-muted/10">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Current Position</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-[9px] text-muted-foreground/50 uppercase">Units Held</p>
              <p className="text-sm font-bold font-mono">{(position.total_units || 0).toFixed(4)}</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground/50 uppercase">Avg Cost Basis</p>
              <p className="text-sm font-bold font-mono">{currency} {(position.avg_cost_basis || 0).toFixed(4)}</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground/50 uppercase">Current NAV</p>
              <p className="text-sm font-bold font-mono">{currency} {(fund?.nav_per_unit || 1).toFixed(4)}</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground/50 uppercase">Portfolio Value</p>
              <p className="text-sm font-bold font-mono text-emerald-600">{currency} {currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground/50 uppercase">Total Return</p>
              <p className={`text-sm font-bold font-mono ${currentValue - (position.total_invested || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {((currentValue - (position.total_invested || 0)) / Math.max(1, position.total_invested || 1) * 100).toFixed(2)}%
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Transaction Detail Table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border/30 bg-muted/20">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />Transaction Detail ({summary.txCount} transactions)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Jackisa Fee</th>
                <th className="text-right">Mgmt Fee</th>
                <th className="text-right">WHT</th>
                <th className="text-right">Net</th>
                <th className="text-right">Units</th>
                <th className="text-right">NAV</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={9} className="!py-12 text-center text-muted-foreground/60">No transactions in this period.</td></tr>
              ) : (
                transactions.map((t: any) => {
                  const isPositive = ['contribution', 'revenue_alloc', 'revaluation'].includes(t.tx_type)
                  return (
                    <tr key={t.id} className="group">
                      <td className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
                      <td><span className={`badge ${isPositive ? 'badge-success' : 'badge-warning'} capitalize text-[10px]`}>{t.tx_type.replace('_', ' ')}</span></td>
                      <td className="text-right font-mono tabular-nums">{Number(t.gross_amount || 0).toLocaleString()}</td>
                      <td className="text-right font-mono tabular-nums text-red-500 text-xs">{Number(t.jackisa_fee || 0).toLocaleString()}</td>
                      <td className="text-right font-mono tabular-nums text-amber-600 text-xs">{Number(t.mgmt_fee || 0).toLocaleString()}</td>
                      <td className="text-right font-mono tabular-nums text-red-500 text-xs">{Number(t.withholding_tax || 0).toLocaleString()}</td>
                      <td className={`text-right font-mono tabular-nums font-bold ${isPositive ? 'text-emerald-600' : 'text-foreground'}`}>
                        {Number(t.net_amount || 0).toLocaleString()}
                      </td>
                      <td className="text-right font-mono tabular-nums text-muted-foreground text-xs">{Number(t.units_transacted || 0).toFixed(4)}</td>
                      <td className="text-right font-mono tabular-nums text-muted-foreground text-xs">{Number(t.nav_at_transaction || 0).toFixed(4)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Tax Summary */}
      {summary.totalTax > 0 && (
        <Card className="p-5 border border-amber-200 bg-amber-50/30">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-600" />Tax Summary (Uganda Revenue Authority)
          </h3>
          <p className="text-xs text-muted-foreground mb-3">Withholding tax on capital gains deducted at source at 15% per the Income Tax Act.</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[9px] text-muted-foreground/50 uppercase">Total Capital Gains</p>
              <p className="text-sm font-bold font-mono">{currency} {transactions.filter(t => t.tx_type === 'redemption').reduce((s, t) => s + Number(t.capital_gain || 0), 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground/50 uppercase">WHT Rate</p>
              <p className="text-sm font-bold font-mono">15%</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground/50 uppercase">Total WHT Deducted</p>
              <p className="text-sm font-bold font-mono text-red-600">{currency} {summary.totalTax.toLocaleString()}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
