'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Compass,
  TrendingUp,
  DollarSign,
  Clock,
  RefreshCw,
  Target,
  Zap,
} from 'lucide-react'

export default function ProjectionsPage() {
  const [fund, setFund] = useState<any>(null)
  const [position, setPosition] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [annualReturn, setAnnualReturn] = useState('8')
  const [monthlyContrib, setMonthlyContrib] = useState('100000')
  const [years, setYears] = useState('10')
  const [inflationRate, setInflationRate] = useState('5')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId || !ctx.userId) { setLoading(false); return }

    const { data: fundData } = await supabase
      .from('workspace_funds').select('*').eq('company_id', ctx.companyId).maybeSingle()
    if (fundData) {
      setFund(fundData)
      setAnnualReturn(((fundData.trailing_annual_return || 0.08) * 100).toString())
    }

    const { data: empData } = await supabase
      .from('company_employees').select('id').eq('company_id', ctx.companyId).eq('user_id', ctx.userId).maybeSingle()
    if (empData && fundData) {
      const { data: posData } = await supabase
        .from('fund_member_positions').select('*').eq('fund_id', fundData.id).eq('employee_id', empData.id).maybeSingle()
      setPosition(posData)
    }
    setLoading(false)
  }

  const currentValue = position ? (position.total_units || 0) * (fund?.nav_per_unit || 1) : 0
  const rate = (Number(annualReturn) || 0) / 100
  const monthly = Number(monthlyContrib) || 0
  const horizon = Number(years) || 10
  const inflation = (Number(inflationRate) || 0) / 100

  const projections = useMemo(() => {
    const scenarios = [
      { label: 'Pessimistic', rate: Math.max(0.01, rate * 0.5), color: 'text-red-600', bg: 'bg-red-50' },
      { label: 'Base Case', rate, color: 'text-blue-600', bg: 'bg-blue-50' },
      { label: 'Optimistic', rate: rate * 1.5, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    ]

    return scenarios.map((s) => {
      const monthlyRate = Math.pow(1 + s.rate, 1 / 12) - 1
      const months = horizon * 12
      let nominal = currentValue
      const yearlyData: { year: number; nominal: number; real: number }[] = []

      for (let m = 1; m <= months; m++) {
        nominal = nominal * (1 + monthlyRate) + monthly
        if (m % 12 === 0) {
          const yearNum = m / 12
          const real = nominal / Math.pow(1 + inflation, yearNum)
          yearlyData.push({ year: yearNum, nominal: Math.round(nominal), real: Math.round(real) })
        }
      }

      return { ...s, finalNominal: Math.round(nominal), finalReal: Math.round(nominal / Math.pow(1 + inflation, horizon)), yearlyData }
    })
  }, [currentValue, rate, monthly, horizon, inflation])

  const rule72Years = rate > 0 ? 72 / (rate * 100) : Infinity
  const bankRate = 0.03
  const rule72Bank = 72 / (bankRate * 100)

  const totalContributions = currentValue + monthly * 12 * horizon
  const baseProjection = projections.find(p => p.label === 'Base Case')
  const wealthMultiplier = baseProjection && totalContributions > 0 ? baseProjection.finalNominal / totalContributions : 1

  const currency = fund?.currency || 'UGX'

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
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Investment Projections</h1>
        <p className="text-sm text-muted-foreground mt-0.5">See how your wealth could grow under different scenarios</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <Card className="stat-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-50"><DollarSign className="w-4 h-4 text-blue-600" /></div>
            <div>
              <p className="text-lg font-bold font-mono tabular-nums">{currency} {currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Current Value</p>
            </div>
          </div>
        </Card>
        <Card className="stat-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-50"><Clock className="w-4 h-4 text-emerald-600" /></div>
            <div>
              <p className="text-lg font-bold font-mono tabular-nums">{rule72Years.toFixed(1)} yrs</p>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Doubling Time (Fund)</p>
            </div>
          </div>
        </Card>
        <Card className="stat-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-50"><Clock className="w-4 h-4 text-amber-600" /></div>
            <div>
              <p className="text-lg font-bold font-mono tabular-nums">{rule72Bank.toFixed(1)} yrs</p>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Doubling Time (Bank @3%)</p>
            </div>
          </div>
        </Card>
        <Card className="stat-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-50"><Zap className="w-4 h-4 text-purple-600" /></div>
            <div>
              <p className="text-lg font-bold font-mono tabular-nums">{wealthMultiplier.toFixed(2)}×</p>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Wealth Multiplier</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Controls */}
      <Card className="p-5 border border-primary/15 bg-primary/[0.02] space-y-3">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Compass className="w-4 h-4 text-primary" /></div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Projection Parameters</h3>
            <p className="text-[11px] text-muted-foreground/60">Adjust assumptions to see different outcomes</p>
          </div>
        </div>
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Annual Return (%)</label>
            <Input type="number" value={annualReturn} onChange={(e) => setAnnualReturn(e.target.value)} min={0} max={100} step={0.5} />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Monthly Contribution ({currency})</label>
            <Input type="number" value={monthlyContrib} onChange={(e) => setMonthlyContrib(e.target.value)} min={0} step={10000} />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Time Horizon (Years)</label>
            <Input type="number" value={years} onChange={(e) => setYears(e.target.value)} min={1} max={50} />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Inflation Rate (%)</label>
            <Input type="number" value={inflationRate} onChange={(e) => setInflationRate(e.target.value)} min={0} max={30} step={0.5} />
          </div>
        </div>
      </Card>

      {/* Scenario Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        {projections.map((p) => (
          <Card key={p.label} className={`p-5 border ${p.bg.replace('bg-', 'border-').replace('50', '200')}`}>
            <div className="flex items-center gap-2 mb-3">
              <Target className={`w-4 h-4 ${p.color}`} />
              <h4 className={`text-sm font-semibold ${p.color}`}>{p.label}</h4>
              <span className="text-[10px] text-muted-foreground/50 ml-auto">{(p.rate * 100).toFixed(1)}% p.a.</span>
            </div>
            <div className="space-y-2 mb-4">
              <div>
                <p className="text-[9px] text-muted-foreground/50 uppercase">Nominal Value in {horizon} years</p>
                <p className={`text-2xl font-bold font-mono tracking-tight ${p.color}`}>{currency} {p.finalNominal.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground/50 uppercase">Real Value (inflation-adjusted)</p>
                <p className="text-sm font-bold font-mono text-muted-foreground">{currency} {p.finalReal.toLocaleString()}</p>
              </div>
            </div>
            {/* Mini chart */}
            <div className="space-y-0.5">
              {p.yearlyData.filter((_, i) => i % Math.max(1, Math.floor(p.yearlyData.length / 8)) === 0 || i === p.yearlyData.length - 1).map((d) => {
                const maxVal = p.finalNominal
                const pct = maxVal > 0 ? (d.nominal / maxVal) * 100 : 0
                return (
                  <div key={d.year} className="flex items-center gap-1.5">
                    <span className="text-[9px] text-muted-foreground/40 w-8 text-right font-mono">Y{d.year}</span>
                    <div className="flex-1 h-3 bg-white/50 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${p.bg.replace('50', '400').replace('bg-', 'bg-')} opacity-60`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[8px] font-mono text-muted-foreground/40 w-20 text-right">{d.nominal.toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        ))}
      </div>

      {/* Comparison */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />Fund vs Bank Savings Comparison
        </h3>
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Year</th>
                <th className="text-right">Total Contributions</th>
                <th className="text-right">Fund Value ({(rate * 100).toFixed(1)}%)</th>
                <th className="text-right">Bank Savings (3%)</th>
                <th className="text-right">Fund Advantage</th>
              </tr>
            </thead>
            <tbody>
              {projections[1]?.yearlyData.filter((_, i) => i % Math.max(1, Math.floor(horizon / 10)) === 0 || i === projections[1].yearlyData.length - 1).map((d) => {
                const monthlyBankRate = Math.pow(1 + bankRate, 1 / 12) - 1
                let bankVal = currentValue
                for (let m = 1; m <= d.year * 12; m++) bankVal = bankVal * (1 + monthlyBankRate) + monthly
                const totalContrib = currentValue + monthly * 12 * d.year
                const advantage = d.nominal - Math.round(bankVal)

                return (
                  <tr key={d.year} className="group">
                    <td className="font-medium text-foreground">{d.year}</td>
                    <td className="text-right font-mono tabular-nums text-muted-foreground">{currency} {totalContrib.toLocaleString()}</td>
                    <td className="text-right font-mono tabular-nums font-bold text-blue-600">{currency} {d.nominal.toLocaleString()}</td>
                    <td className="text-right font-mono tabular-nums text-muted-foreground">{currency} {Math.round(bankVal).toLocaleString()}</td>
                    <td className={`text-right font-mono tabular-nums font-bold ${advantage > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {advantage > 0 ? '+' : ''}{currency} {advantage.toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
