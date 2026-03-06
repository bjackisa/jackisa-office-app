'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertTriangle,
  Plus,
  RefreshCw,
  DollarSign,
  TrendingDown,
  Calendar,
  Percent,
  CheckCircle,
} from 'lucide-react'

const statusColors: Record<string, string> = {
  active: 'badge-warning',
  repaid: 'badge-success',
  defaulted: 'badge-danger',
  restructured: 'badge-info',
}

export default function LiabilitiesPage() {
  const [fund, setFund] = useState<any>(null)
  const [liabilities, setLiabilities] = useState<any[]>([])
  const [repayments, setRepayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showRepayForm, setShowRepayForm] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [form, setForm] = useState({ liability_name: '', lender: '', principal: '', annual_interest_rate: '', start_date: new Date().toISOString().split('T')[0], maturity_date: '' })
  const [repayForm, setRepayForm] = useState({ total_amount: '' })

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) { setLoading(false); return }
    setUserId(ctx.userId)

    const { data: fundData } = await supabase
      .from('workspace_funds').select('*').eq('company_id', ctx.companyId).maybeSingle()
    if (!fundData) { setLoading(false); return }
    setFund(fundData)

    const [liabRes, repRes] = await Promise.all([
      supabase.from('fund_liabilities').select('*').eq('fund_id', fundData.id).order('created_at', { ascending: false }),
      supabase.from('liability_repayments').select('*, fund_liabilities(liability_name)').order('repayment_date', { ascending: false }).limit(30),
    ])

    setLiabilities(liabRes.data || [])
    setRepayments(repRes.data?.filter((r: any) => liabRes.data?.some((l: any) => l.id === r.liability_id)) || [])
    setLoading(false)
  }

  const createLiability = async () => {
    if (!fund || !form.liability_name || !form.principal || !form.annual_interest_rate) return
    const rate = Number(form.annual_interest_rate) / 100
    const dailyRate = Math.pow(1 + rate, 1 / 365) - 1

    await supabase.from('fund_liabilities').insert({
      fund_id: fund.id,
      liability_name: form.liability_name,
      lender: form.lender || null,
      principal: Number(form.principal),
      outstanding_balance: Number(form.principal),
      annual_interest_rate: rate,
      daily_rate: dailyRate,
      start_date: form.start_date,
      maturity_date: form.maturity_date || null,
    })

    setForm({ liability_name: '', lender: '', principal: '', annual_interest_rate: '', start_date: new Date().toISOString().split('T')[0], maturity_date: '' })
    setShowForm(false)
    await loadData()
  }

  const recordRepayment = async (liabilityId: string) => {
    const amount = Number(repayForm.total_amount)
    if (!amount || amount <= 0) return

    const liability = liabilities.find(l => l.id === liabilityId)
    if (!liability) return

    const interestPortion = Math.min(amount, Number(liability.accrued_interest || 0))
    const principalPortion = amount - interestPortion
    const balanceAfter = Math.max(0, Number(liability.outstanding_balance) - principalPortion)

    await supabase.from('liability_repayments').insert({
      liability_id: liabilityId,
      total_amount: amount,
      interest_portion: interestPortion,
      principal_portion: principalPortion,
      balance_after: balanceAfter,
      recorded_by: userId,
    })

    const updates: any = {
      outstanding_balance: balanceAfter,
      accrued_interest: Math.max(0, Number(liability.accrued_interest || 0) - interestPortion),
      updated_at: new Date().toISOString(),
    }
    if (balanceAfter <= 0) updates.status = 'repaid'

    await supabase.from('fund_liabilities').update(updates).eq('id', liabilityId)
    setRepayForm({ total_amount: '' })
    setShowRepayForm(null)
    await loadData()
  }

  const totalOutstanding = liabilities.filter(l => l.status === 'active').reduce((s, l) => s + Number(l.outstanding_balance || 0), 0)
  const totalAccrued = liabilities.filter(l => l.status === 'active').reduce((s, l) => s + Number(l.accrued_interest || 0), 0)
  const totalLiability = totalOutstanding + totalAccrued
  const leverageRatio = fund?.total_assets && fund.total_assets > 0 ? totalLiability / fund.total_assets : 0

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
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Fund Liabilities</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Loans, daily interest accrual, and repayment tracking</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus className="w-4 h-4 mr-1.5" />Add Loan</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {[
          { label: 'Outstanding Principal', value: `${fund?.currency || 'UGX'} ${totalOutstanding.toLocaleString()}`, icon: DollarSign, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Accrued Interest', value: `${fund?.currency || 'UGX'} ${totalAccrued.toLocaleString()}`, icon: Percent, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Total Liability', value: `${fund?.currency || 'UGX'} ${totalLiability.toLocaleString()}`, icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-50' },
          { label: 'Leverage Ratio', value: `${(leverageRatio * 100).toFixed(1)}%`, icon: AlertTriangle, color: leverageRatio > 0.6 ? 'text-red-600' : 'text-blue-600', bg: leverageRatio > 0.6 ? 'bg-red-50' : 'bg-blue-50' },
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

      {/* Add Loan Form */}
      {showForm && (
        <Card className="p-5 border border-primary/15 bg-primary/[0.02] space-y-3">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Plus className="w-4 h-4 text-primary" /></div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Add Loan / Liability</h3>
              <p className="text-[11px] text-muted-foreground/60">Interest accrues daily using compound formula</p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <Input placeholder="Loan name *" value={form.liability_name} onChange={(e) => setForm({ ...form, liability_name: e.target.value })} />
            <Input placeholder="Lender" value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })} />
            <Input type="number" placeholder="Principal amount *" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
            <Input type="number" placeholder="Annual rate % *" value={form.annual_interest_rate} onChange={(e) => setForm({ ...form, annual_interest_rate: e.target.value })} />
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            <Input type="date" placeholder="Maturity date" value={form.maturity_date} onChange={(e) => setForm({ ...form, maturity_date: e.target.value })} />
          </div>
          <div className="pt-3 border-t border-border/30 flex gap-2">
            <Button size="sm" onClick={createLiability}>Create Loan</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Liabilities Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Loan</th>
                <th>Lender</th>
                <th className="text-right">Principal</th>
                <th className="text-right">Outstanding</th>
                <th className="text-right">Accrued Int.</th>
                <th>Rate</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {liabilities.length === 0 ? (
                <tr><td colSpan={8} className="!py-12 text-center text-muted-foreground/60">No liabilities recorded.</td></tr>
              ) : (
                liabilities.map((l: any) => (
                  <tr key={l.id} className="group">
                    <td className="font-medium text-foreground">{l.liability_name}</td>
                    <td className="text-muted-foreground text-xs">{l.lender || '—'}</td>
                    <td className="text-right font-mono tabular-nums">{Number(l.principal || 0).toLocaleString()}</td>
                    <td className="text-right font-mono tabular-nums font-bold text-red-600">{Number(l.outstanding_balance || 0).toLocaleString()}</td>
                    <td className="text-right font-mono tabular-nums text-amber-600">{Number(l.accrued_interest || 0).toLocaleString()}</td>
                    <td className="font-mono text-xs">{((l.annual_interest_rate || 0) * 100).toFixed(1)}%</td>
                    <td><span className={`badge ${statusColors[l.status] || 'badge-neutral'} capitalize`}>{l.status}</span></td>
                    <td>
                      {l.status === 'active' && (
                        showRepayForm === l.id ? (
                          <div className="flex gap-1">
                            <Input type="number" placeholder="Amount" className="w-24 text-xs" value={repayForm.total_amount} onChange={(e) => setRepayForm({ total_amount: e.target.value })} />
                            <Button size="sm" onClick={() => recordRepayment(l.id)}>Pay</Button>
                            <Button size="sm" variant="outline" onClick={() => setShowRepayForm(null)}>×</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setShowRepayForm(l.id)}>Repay</Button>
                        )
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recent Repayments */}
      {repayments.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border/30 bg-muted/20">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-600" />Recent Repayments</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="premium-table">
              <thead><tr><th>Loan</th><th>Date</th><th className="text-right">Total</th><th className="text-right">Interest</th><th className="text-right">Principal</th><th className="text-right">Balance After</th></tr></thead>
              <tbody>
                {repayments.map((r: any) => (
                  <tr key={r.id} className="group">
                    <td className="font-medium text-foreground text-xs">{r.fund_liabilities?.liability_name || '—'}</td>
                    <td className="text-xs text-muted-foreground">{r.repayment_date}</td>
                    <td className="text-right font-mono tabular-nums font-bold">{Number(r.total_amount || 0).toLocaleString()}</td>
                    <td className="text-right font-mono tabular-nums text-amber-600 text-xs">{Number(r.interest_portion || 0).toLocaleString()}</td>
                    <td className="text-right font-mono tabular-nums text-xs">{Number(r.principal_portion || 0).toLocaleString()}</td>
                    <td className="text-right font-mono tabular-nums text-xs">{Number(r.balance_after || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
