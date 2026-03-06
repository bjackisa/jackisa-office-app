'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Search, Download, ArrowUpRight, ArrowDownRight,
  Landmark, CheckCircle, Clock, AlertTriangle,
  Smartphone, Banknote, CreditCard, RefreshCw,
} from 'lucide-react'

const methodIcon: Record<string, any> = {
  cash: Banknote,
  mtn_mobile_money: Smartphone,
  airtel_money: Smartphone,
  jackisa_pay: Landmark,
  visa_mastercard: CreditCard,
  bank_transfer: Landmark,
  internal_transfer: RefreshCw,
}

const methodLabel: Record<string, string> = {
  cash: 'Cash',
  mtn_mobile_money: 'MTN MoMo',
  airtel_money: 'Airtel Money',
  jackisa_pay: 'Jackisa Pay',
  visa_mastercard: 'Visa / MC',
  bank_transfer: 'Bank Transfer',
  internal_transfer: 'Internal',
}

const statusBadge: Record<string, { cls: string; label: string }> = {
  pending: { cls: 'badge-warning', label: 'Pending' },
  processing: { cls: 'badge-info', label: 'Processing' },
  success: { cls: 'badge-success', label: 'Success' },
  failed: { cls: 'badge-danger', label: 'Failed' },
  timed_out: { cls: 'badge-danger', label: 'Timed Out' },
  cancelled: { cls: 'badge-neutral', label: 'Cancelled' },
  refunded: { cls: 'badge-warning', label: 'Refunded' },
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dirFilter, setDirFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const ctx = await getSessionContext()
      if (!ctx?.companyId) return
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('company_id', ctx.companyId)
        .order('initiated_at', { ascending: false })
        .limit(200)
      setPayments(data || [])
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => payments.filter((p) => {
    const q = search.toLowerCase()
    const matchSearch = !search || p.description?.toLowerCase().includes(q) || p.our_reference?.includes(q) || p.msisdn?.includes(q) || p.module?.includes(q)
    const matchDir = !dirFilter || p.direction === dirFilter
    const matchStatus = !statusFilter || p.status === statusFilter
    return matchSearch && matchDir && matchStatus
  }), [payments, search, dirFilter, statusFilter])

  const totals = useMemo(() => ({
    collected: payments.filter(p => p.direction === 'collection' && p.status === 'success').reduce((s, p) => s + Number(p.gross_amount || 0), 0),
    disbursed: payments.filter(p => p.direction === 'disbursement' && p.status === 'success').reduce((s, p) => s + Number(p.gross_amount || 0), 0),
    pending: payments.filter(p => ['pending', 'processing'].includes(p.status)).length,
    failed: payments.filter(p => ['failed', 'timed_out'].includes(p.status)).length,
  }), [payments])

  const formatUGX = (n: number) => `UGX ${n.toLocaleString()}`
  const formatTime = (d: string) => {
    if (!d) return '—'
    const dt = new Date(d)
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  const exportCsv = () => {
    const headers = ['initiated_at', 'direction', 'module', 'payment_method', 'gross_amount', 'currency', 'status', 'msisdn', 'description', 'our_reference']
    const rows = filtered.map(p => headers.map(h => JSON.stringify(p[h] ?? '')).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Payments Hub</h1>
          <p className="text-sm text-muted-foreground mt-0.5">All transactions across every module — Cash &amp; Jackisa Pay</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1.5" />Export CSV</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger-children">
        {[
          { label: 'Collected', value: formatUGX(totals.collected), icon: ArrowDownRight, gradient: 'from-emerald-500 to-green-600', text: 'text-emerald-600' },
          { label: 'Disbursed', value: formatUGX(totals.disbursed), icon: ArrowUpRight, gradient: 'from-blue-500 to-blue-600', text: 'text-blue-600' },
          { label: 'Pending', value: totals.pending, icon: Clock, gradient: 'from-amber-500 to-orange-500', text: 'text-amber-600' },
          { label: 'Failed', value: totals.failed, icon: AlertTriangle, gradient: 'from-red-500 to-rose-600', text: 'text-red-600' },
        ].map((s) => (
          <Card key={s.label} className="stat-card p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.gradient} flex items-center justify-center shadow-sm flex-shrink-0`}>
                <s.icon className="w-4.5 h-4.5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-foreground truncate tracking-tight">{s.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium">{s.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input className="pl-10" placeholder="Search by description, phone, ref..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="form-select w-auto" value={dirFilter} onChange={(e) => setDirFilter(e.target.value)}>
            <option value="">All directions</option>
            <option value="collection">Collections</option>
            <option value="disbursement">Disbursements</option>
          </select>
          <select className="form-select w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(statusBadge).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Direction</th>
                <th>Module</th>
                <th>Method</th>
                <th>Phone / Ref</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="!py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading payments...</p>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="!py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                    <Landmark className="w-6 h-6 text-muted-foreground/25" />
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">No payments found</p>
                  <p className="text-xs text-muted-foreground/40 mt-1">Payments from invoices, sales, payroll, and investments will appear here</p>
                </td></tr>
              ) : filtered.map((p) => {
                const MethodIcon = methodIcon[p.payment_method] || Landmark
                const sb = statusBadge[p.status] || statusBadge.pending
                return (
                  <tr key={p.id} className="group">
                    <td className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(p.initiated_at)}</td>
                    <td>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${p.direction === 'collection' ? 'text-emerald-600' : 'text-blue-600'}`}>
                        {p.direction === 'collection' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                        {p.direction === 'collection' ? 'In' : 'Out'}
                      </span>
                    </td>
                    <td><span className="badge badge-neutral capitalize text-[10px]">{p.module}</span></td>
                    <td>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MethodIcon className="w-3 h-3" />
                        {methodLabel[p.payment_method] || p.payment_method}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-muted-foreground">{p.msisdn || p.our_reference?.slice(0, 8) || '—'}</td>
                    <td className="text-right font-mono font-bold tabular-nums">{p.currency} {Number(p.gross_amount || 0).toLocaleString()}</td>
                    <td><span className={`badge ${sb.cls}`}>{sb.label}</span></td>
                    <td className="text-xs text-muted-foreground max-w-[200px] truncate">{p.description || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border/20 bg-muted/10">
            <p className="text-xs text-muted-foreground/50">Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {payments.length} payments</p>
          </div>
        )}
      </Card>
    </div>
  )
}
