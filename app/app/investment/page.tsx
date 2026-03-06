'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { getEffectiveFundNav } from '@/lib/investment-metrics'
import { Card } from '@/components/ui/card'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Landmark,
  Activity,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  PieChart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreateFundCard } from '@/components/create-fund-card'

interface FundData {
  id: string
  fund_name: string
  currency: string
  nav_per_unit: number
  total_units_outstanding: number
  total_assets: number
  total_liabilities: number
  cash_pool: number
  trailing_annual_return: number
  inception_date: string
  leverage_warning_threshold: number
}

export default function FundDashboardPage() {
  const [fund, setFund] = useState<FundData | null>(null)
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [assets, setAssets] = useState<any[]>([])
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (!companyId || !fund?.id) return

    const channel = supabase
      .channel(`investment-dashboard-${companyId}-${fund.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'workspace_funds',
        filter: `company_id=eq.${companyId}`,
      }, loadData)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'nav_snapshots',
        filter: `fund_id=eq.${fund.id}`,
      }, loadData)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'fund_transactions',
        filter: `fund_id=eq.${fund.id}`,
      }, loadData)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'fund_assets',
        filter: `fund_id=eq.${fund.id}`,
      }, loadData)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'fund_liabilities',
        filter: `fund_id=eq.${fund.id}`,
      }, loadData)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'company_employees',
        filter: `company_id=eq.${companyId}`,
      }, loadData)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [companyId, fund?.id])

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) { setLoading(false); return }
    setCompanyId(ctx.companyId)
    setUserId(ctx.userId)

    const { data: fundData } = await supabase
      .from('workspace_funds')
      .select('*')
      .eq('company_id', ctx.companyId)
      .maybeSingle()

    if (!fundData) { setLoading(false); return }
    setFund(fundData)

    const [snapRes, txRes, assetRes, memberRes] = await Promise.all([
      supabase.from('nav_snapshots').select('*').eq('fund_id', fundData.id).order('snapshot_date', { ascending: true }).limit(365),
      supabase.from('fund_transactions').select('*, fund_member_positions(company_employees(users(full_name)))').eq('fund_id', fundData.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('fund_assets').select('*').eq('fund_id', fundData.id).eq('is_active', true),
      supabase.from('company_employees').select('id', { count: 'exact', head: true }).eq('company_id', ctx.companyId).eq('status', 'active'),
    ])

    setSnapshots(snapRes.data || [])
    setTransactions(txRes.data || [])
    setAssets(assetRes.data || [])
    setMemberCount(memberRes.count || 0)
    setLoading(false)
  }

  const nav = fund ? getEffectiveFundNav(fund) : 1
  const totalValue = (fund?.total_assets || 0) - (fund?.total_liabilities || 0)
  const leverageRatio = fund?.total_assets && fund.total_assets > 0
    ? (fund.total_liabilities || 0) / fund.total_assets
    : 0

  const yesterdayNav = snapshots.length >= 2 ? snapshots[snapshots.length - 2]?.closing_nav : null
  const navChange = yesterdayNav ? ((nav - yesterdayNav) / yesterdayNav) * 100 : 0
  const nav7d = snapshots.length >= 8 ? snapshots[snapshots.length - 8]?.closing_nav : null
  const change7d = nav7d ? ((nav - nav7d) / nav7d) * 100 : 0
  const inceptionNav = snapshots.length > 0 ? snapshots[0]?.opening_nav || 1 : 1
  const changeInception = ((nav - inceptionNav) / inceptionNav) * 100

  const assetComposition = useMemo(() => {
    const groups: Record<string, number> = {}
    for (const a of assets) {
      const t = a.asset_type || 'other'
      groups[t] = (groups[t] || 0) + Number(a.current_value || 0)
    }
    if (fund?.cash_pool) groups['cash'] = (groups['cash'] || 0) + fund.cash_pool
    return Object.entries(groups).map(([type, value]) => ({ type, value })).sort((a, b) => b.value - a.value)
  }, [assets, fund])

  const totalComposition = assetComposition.reduce((s, c) => s + c.value, 0)

  const compositionColors: Record<string, string> = {
    business: 'bg-blue-500', land: 'bg-emerald-500', equipment: 'bg-amber-500',
    external_investment: 'bg-purple-500', cash: 'bg-cyan-500', other: 'bg-gray-400',
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground/40" />
        </div>
      </div>
    )
  }

  if (!fund) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Investment & Wealth</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Set up your workspace investment fund to get started</p>
        </div>
        {companyId && userId && (
          <CreateFundCard companyId={companyId} userId={userId} onCreated={loadData} />
        )}
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{fund.fund_name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Live NAV, fund composition, and activity feed</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-medium">Since {fund.inception_date}</span>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
          </Button>
        </div>
      </div>

      {/* NAV Hero */}
      <Card className="p-6 border border-primary/15 bg-gradient-to-br from-primary/[0.04] to-transparent">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Net Asset Value per Unit</p>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold text-foreground tracking-tight font-mono tabular-nums">
                {fund.currency} {nav.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </span>
              <span className={`text-sm font-semibold flex items-center gap-1 ${navChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {navChange >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {navChange >= 0 ? '+' : ''}{navChange.toFixed(2)}% today
              </span>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="text-center">
              <p className="text-muted-foreground text-[10px] uppercase tracking-wider">7-Day</p>
              <p className={`font-bold font-mono ${change7d >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {change7d >= 0 ? '+' : ''}{change7d.toFixed(2)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Since Inception</p>
              <p className={`font-bold font-mono ${changeInception >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {changeInception >= 0 ? '+' : ''}{changeInception.toFixed(2)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Annual Return</p>
              <p className="font-bold font-mono text-foreground">{(fund.trailing_annual_return * 100).toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 stagger-children">
        {[
          { label: 'Total Fund Value', value: `${fund.currency} ${totalValue.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Assets', value: `${fund.currency} ${(fund.total_assets || 0).toLocaleString()}`, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Total Liabilities', value: `${fund.currency} ${(fund.total_liabilities || 0).toLocaleString()}`, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Units Outstanding', value: (fund.total_units_outstanding || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }), icon: PieChart, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Active Members', value: memberCount, icon: Users, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map((stat) => (
          <Card key={stat.label} className="stat-card p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-foreground tracking-tight truncate">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Leverage Warning */}
      {leverageRatio > (fund.leverage_warning_threshold || 0.6) && (
        <Card className="p-4 border-red-200 bg-red-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-100"><TrendingDown className="w-4 h-4 text-red-600" /></div>
            <div>
              <p className="text-sm font-semibold text-red-700">High Leverage Warning</p>
              <p className="text-xs text-red-600/70">Loan-to-asset ratio is {(leverageRatio * 100).toFixed(1)}%, exceeding the {((fund.leverage_warning_threshold || 0.6) * 100).toFixed(0)}% threshold.</p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* NAV History Chart (simplified bar representation) */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />NAV History
          </h3>
          {snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground/60 text-center py-8">No NAV history yet. Data appears after the first daily snapshot.</p>
          ) : (
            <div className="space-y-1">
              {snapshots.slice(-14).map((s: any) => {
                const maxNav = Math.max(...snapshots.slice(-14).map((x: any) => Number(x.closing_nav || 1)))
                const pct = maxNav > 0 ? (Number(s.closing_nav || 1) / maxNav) * 100 : 50
                return (
                  <div key={s.id} className="flex items-center gap-2 group">
                    <span className="text-[10px] text-muted-foreground/50 w-16 font-mono shrink-0">{s.snapshot_date?.slice(5)}</span>
                    <div className="flex-1 h-5 bg-muted/30 rounded-full overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground w-14 text-right">{Number(s.closing_nav).toFixed(4)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Fund Composition */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-primary" />Fund Composition
          </h3>
          {assetComposition.length === 0 ? (
            <p className="text-sm text-muted-foreground/60 text-center py-8">No assets in the fund yet.</p>
          ) : (
            <div className="space-y-3">
              {/* Stacked bar */}
              <div className="h-6 rounded-full overflow-hidden flex">
                {assetComposition.map((c) => (
                  <div
                    key={c.type}
                    className={`${compositionColors[c.type] || 'bg-gray-400'} transition-all duration-500`}
                    style={{ width: `${totalComposition > 0 ? (c.value / totalComposition) * 100 : 0}%` }}
                    title={`${c.type}: ${c.value.toLocaleString()}`}
                  />
                ))}
              </div>
              {/* Legend */}
              <div className="grid grid-cols-2 gap-2">
                {assetComposition.map((c) => (
                  <div key={c.type} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-sm ${compositionColors[c.type] || 'bg-gray-400'}`} />
                    <span className="text-xs text-muted-foreground capitalize">{c.type.replace('_', ' ')}</span>
                    <span className="text-xs font-mono font-bold ml-auto">{fund?.currency} {c.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              {fund?.total_liabilities && fund.total_liabilities > 0 ? (
                <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                  <span className="text-xs text-red-600 font-medium">Less: Liabilities</span>
                  <span className="text-xs font-mono font-bold text-red-600">-{fund.currency} {fund.total_liabilities.toLocaleString()}</span>
                </div>
              ) : null}
            </div>
          )}
        </Card>
      </div>

      {/* Recent Activity Feed */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border/30 bg-muted/20">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />Live Activity Feed
          </h3>
        </div>
        <div className="divide-y divide-border/20">
          {transactions.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground/60">No fund activity yet.</div>
          ) : (
            transactions.map((tx: any) => {
              const isPositive = ['contribution', 'revenue_alloc', 'revaluation'].includes(tx.tx_type)
              return (
                <div key={tx.id} className="px-5 py-3 flex items-center gap-3 hover:bg-muted/10 transition-colors">
                  <div className={`p-1.5 rounded-lg ${isPositive ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    {isPositive
                      ? <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-600" />
                      : <ArrowDownCircle className="w-3.5 h-3.5 text-red-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground capitalize">{tx.tx_type.replace('_', ' ')}</p>
                    <p className="text-[10px] text-muted-foreground/50 truncate">
                      {tx.description || tx.fund_member_positions?.company_employees?.users?.full_name || '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-bold font-mono ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                      {isPositive ? '+' : '-'}{fund?.currency} {Math.abs(tx.net_amount || 0).toLocaleString()}
                    </p>
                    <p className="text-[9px] text-muted-foreground/40 font-mono">NAV {Number(tx.nav_at_transaction || 0).toFixed(4)}</p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>
    </div>
  )
}
