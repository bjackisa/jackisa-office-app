'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpCircle,
  ArrowDownCircle,
  Target,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Shield,
} from 'lucide-react'
import Link from 'next/link'

const signalConfig: Record<string, { label: string; color: string; bg: string; description: string }> = {
  strong_buy: { label: 'Strong Buy', color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-300', description: 'Multiple factors strongly favour buying more units now.' },
  consider_buy: { label: 'Consider Buying', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', description: 'Conditions are generally favourable for additional investment.' },
  hold: { label: 'Hold', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', description: 'Current conditions suggest maintaining your position.' },
  consider_sell: { label: 'Consider Selling', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', description: 'Some factors suggest it may be a good time to take profits.' },
  strong_sell: { label: 'Strong Sell', color: 'text-red-700', bg: 'bg-red-100 border-red-300', description: 'Multiple factors strongly suggest taking profits now.' },
}

export default function MyPortfolioPage() {
  const [fund, setFund] = useState<any>(null)
  const [position, setPosition] = useState<any>(null)
  const [signal, setSignal] = useState<any>(null)
  const [contributions, setContributions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [signalExpanded, setSignalExpanded] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

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

    if (!posData) { setLoading(false); return }
    setPosition(posData)

    const [sigRes, contRes] = await Promise.all([
      supabase.from('fund_member_signals').select('*').eq('member_position_id', posData.id).order('signal_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('fund_transactions').select('*').eq('member_position_id', posData.id).eq('tx_type', 'contribution').order('created_at', { ascending: false }).limit(20),
    ])

    setSignal(sigRes.data)
    setContributions(contRes.data || [])
    setLoading(false)
  }

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
        <h2 className="text-lg font-semibold text-foreground mb-1">No Investment Position</h2>
        <p className="text-sm text-muted-foreground mb-4">You don&apos;t have an investment position in this fund yet.</p>
        <Link href="/app/investment/buy">
          <Button size="sm"><ArrowUpCircle className="w-4 h-4 mr-1.5" />Buy Your First Units</Button>
        </Link>
      </div>
    )
  }

  const nav = fund.nav_per_unit || 1
  const currentValue = position.total_units * nav
  const totalInvested = position.total_invested || 0
  const profitLoss = currentValue - totalInvested
  const returnPct = totalInvested > 0 ? (profitLoss / totalInvested) * 100 : 0
  const fundReturnPct = fund.trailing_annual_return ? fund.trailing_annual_return * 100 : 0
  const sig = signal ? signalConfig[signal.signal] || signalConfig.hold : null

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">My Investment</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Personal portfolio, signal, and sell calculator</p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/investment/buy"><Button size="sm"><ArrowUpCircle className="w-4 h-4 mr-1.5" />Buy Units</Button></Link>
          <Link href="/app/investment/sell"><Button size="sm" variant="outline"><ArrowDownCircle className="w-4 h-4 mr-1.5" />Sell Units</Button></Link>
        </div>
      </div>

      {/* Portfolio Hero */}
      <Card className="p-6 border border-primary/15 bg-gradient-to-br from-primary/[0.04] to-transparent">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Current Portfolio Value</p>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="text-4xl font-bold text-foreground tracking-tight font-mono tabular-nums">
            {fund.currency} {currentValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Total Invested</p>
            <p className="text-sm font-bold font-mono tabular-nums">{fund.currency} {totalInvested.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Profit / Loss</p>
            <p className={`text-sm font-bold font-mono tabular-nums ${profitLoss >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {profitLoss >= 0 ? '+' : ''}{fund.currency} {profitLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Your Return</p>
            <p className={`text-sm font-bold font-mono tabular-nums ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Fund Return (Annual)</p>
            <p className="text-sm font-bold font-mono tabular-nums text-foreground">{fundReturnPct.toFixed(1)}%</p>
          </div>
        </div>
      </Card>

      {/* Position Details */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="stat-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-50"><DollarSign className="w-4 h-4 text-blue-600" /></div>
            <div>
              <p className="text-lg font-bold font-mono tabular-nums">{position.total_units?.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Units Held</p>
            </div>
          </div>
        </Card>
        <Card className="stat-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-50"><Target className="w-4 h-4 text-purple-600" /></div>
            <div>
              <p className="text-lg font-bold font-mono tabular-nums">{fund.currency} {position.avg_cost_basis?.toFixed(4)}</p>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Avg Cost Basis</p>
            </div>
          </div>
        </Card>
        <Card className="stat-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-50"><Shield className="w-4 h-4 text-amber-600" /></div>
            <div>
              <p className="text-lg font-bold font-mono tabular-nums">{fund.currency} {(position.total_fees_paid || 0).toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Total Fees Paid</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Signal */}
      {sig && signal && (
        <Card className={`p-5 border ${sig.bg}`}>
          <button onClick={() => setSignalExpanded(!signalExpanded)} className="w-full text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-white/80">
                  <Target className={`w-5 h-5 ${sig.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Today&apos;s Signal</p>
                  <p className={`text-lg font-bold ${sig.color}`}>{sig.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground/60">Composite Score</p>
                  <p className={`text-sm font-bold font-mono ${sig.color}`}>{signal.composite_score}</p>
                </div>
                {signalExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
          </button>
          {signalExpanded && (
            <div className="mt-4 pt-4 border-t border-border/20 space-y-3">
              <p className="text-sm text-muted-foreground">{sig.description}</p>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: 'Target Return', value: signal.factor_target_return, weight: 30 },
                  { label: '7-Day Momentum', value: signal.factor_7d_momentum, weight: 20 },
                  { label: '30-Day Momentum', value: signal.factor_30d_momentum, weight: 20 },
                  { label: '52W High', value: signal.factor_52w_high_proximity, weight: 15 },
                  { label: '52W Low', value: signal.factor_52w_low_proximity, weight: 15 },
                ].map((f) => (
                  <div key={f.label} className="text-center p-2 rounded-lg bg-white/50">
                    <p className="text-[10px] text-muted-foreground/60 truncate">{f.label}</p>
                    <p className={`text-sm font-bold font-mono ${Number(f.value) > 0 ? 'text-emerald-600' : Number(f.value) < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {Number(f.value) > 0 ? '+' : ''}{f.value}
                    </p>
                    <p className="text-[9px] text-muted-foreground/40">weight: {f.weight}</p>
                  </div>
                ))}
              </div>
              {/* Hypothetical sell */}
              {signal.hypothetical_sell_gross > 0 && (
                <div className="p-4 rounded-xl bg-white/60 border border-border/20">
                  <p className="text-xs font-semibold text-foreground mb-2">If you sold all units today:</p>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground/60">Gross</p>
                      <p className="text-xs font-bold font-mono">{fund.currency} {Number(signal.hypothetical_sell_gross).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground/60">Exit Fee</p>
                      <p className="text-xs font-bold font-mono text-red-500">-{fund.currency} {Number(signal.hypothetical_sell_fee).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground/60">WHT (15%)</p>
                      <p className="text-xs font-bold font-mono text-red-500">-{fund.currency} {Number(signal.hypothetical_sell_tax).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground/60 font-semibold">Net Payout</p>
                      <p className="text-sm font-bold font-mono text-emerald-600">{fund.currency} {Number(signal.hypothetical_sell_net).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Contribution History */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border/30 bg-muted/20">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4 text-primary" />Contribution History
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Fees</th>
                <th className="text-right">Net Invested</th>
                <th className="text-right">Units Bought</th>
                <th className="text-right">NAV at Buy</th>
                <th className="text-right">Current Value</th>
              </tr>
            </thead>
            <tbody>
              {contributions.length === 0 ? (
                <tr><td colSpan={7} className="!py-12 text-center text-muted-foreground/60">No contributions yet.</td></tr>
              ) : (
                contributions.map((c: any) => {
                  const currentVal = (c.units_transacted || 0) * nav
                  const pnl = currentVal - (c.net_amount || 0)
                  return (
                    <tr key={c.id} className="group">
                      <td className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
                      <td className="text-right font-mono tabular-nums">{fund.currency} {Number(c.gross_amount || 0).toLocaleString()}</td>
                      <td className="text-right font-mono tabular-nums text-red-500 text-xs">{fund.currency} {(Number(c.jackisa_fee || 0) + Number(c.mgmt_fee || 0)).toLocaleString()}</td>
                      <td className="text-right font-mono tabular-nums font-medium">{fund.currency} {Number(c.net_amount || 0).toLocaleString()}</td>
                      <td className="text-right font-mono tabular-nums text-muted-foreground">{Number(c.units_transacted || 0).toFixed(4)}</td>
                      <td className="text-right font-mono tabular-nums text-muted-foreground text-xs">{Number(c.nav_at_transaction || 0).toFixed(4)}</td>
                      <td className={`text-right font-mono tabular-nums font-bold ${pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {fund.currency} {currentVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
  )
}
