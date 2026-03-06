'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Download, Trash2, FileText, DollarSign, Clock, CheckCircle, AlertTriangle } from 'lucide-react'

const statusBadge: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'badge-neutral' },
  sent: { label: 'Sent', cls: 'badge-info' },
  paid: { label: 'Paid', cls: 'badge-success' },
  overdue: { label: 'Overdue', cls: 'badge-danger' },
  cancelled: { label: 'Cancelled', cls: 'badge-warning' },
  partially_paid: { label: 'Partially Paid', cls: 'badge-info' },
}

export default function InvoicesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ customer_name: '', customer_email: '', subtotal: '', tax_amount: '', due_date: '', status: 'draft', notes: '' })

  const loadInvoices = async () => {
    try {
      const ctx = await getSessionContext()
      if (!ctx?.companyId) return
      setCompanyId(ctx.companyId)
      setUserId(ctx.userId)

      const { data } = await supabase
        .from('invoices')
        .select('*')
        .eq('company_id', ctx.companyId)
        .order('created_at', { ascending: false })

      setInvoices(data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInvoices()
  }, [])

  const filtered = useMemo(() => invoices.filter(inv => {
    const q = search.toLowerCase()
    const matchSearch = !search || inv.invoice_number?.toLowerCase().includes(q) || inv.customer_name?.toLowerCase().includes(q)
    const matchStatus = !statusFilter || inv.status === statusFilter
    return matchSearch && matchStatus
  }), [invoices, search, statusFilter])

  const totals = {
    total: invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0),
    paid: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total_amount || 0), 0),
    pending: invoices.filter(i => ['sent', 'partially_paid'].includes(i.status)).reduce((s, i) => s + Number(i.total_amount || 0), 0),
    overdue: invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.total_amount || 0), 0),
  }

  const formatUGX = (n: number) => `UGX ${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`

  const createInvoice = async () => {
    if (!companyId || !userId || !form.customer_name || !form.subtotal || !form.due_date) return
    const subtotal = Number(form.subtotal)
    const tax = Number(form.tax_amount || 0)
    const total = subtotal + tax
    const number = `INV-${Date.now()}`

    await supabase.from('invoices').insert({
      company_id: companyId,
      invoice_number: number,
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: form.due_date,
      customer_name: form.customer_name,
      customer_email: form.customer_email || null,
      subtotal,
      tax_amount: tax,
      total_amount: total,
      paid_amount: 0,
      status: form.status,
      notes: form.notes || null,
      created_by: userId,
    })

    setForm({ customer_name: '', customer_email: '', subtotal: '', tax_amount: '', due_date: '', status: 'draft', notes: '' })
    setShowForm(false)
    await loadInvoices()
  }

  const deleteInvoice = async (id: string) => {
    await supabase.from('invoices').delete().eq('id', id)
    await loadInvoices()
  }

  const exportCsv = () => {
    const headers = ['invoice_number', 'customer_name', 'invoice_date', 'due_date', 'status', 'subtotal', 'tax_amount', 'total_amount', 'paid_amount']
    const rows = filtered.map((i) => headers.map((h) => JSON.stringify(i[h] ?? '')).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create, manage, and track customer invoices.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1.5" />Export CSV</Button>
          <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus className="w-4 h-4 mr-1.5" />New Invoice</Button>
        </div>
      </div>

      {showForm && (
        <Card className="mb-6 p-5 border border-primary/15 bg-primary/[0.02]">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Create Invoice</h3>
              <p className="text-[11px] text-muted-foreground/60">Fill in the details below</p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <Input placeholder="Customer name *" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            <Input placeholder="Customer email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
            <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            <Input type="number" placeholder="Subtotal *" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: e.target.value })} />
            <Input type="number" placeholder="Tax amount" value={form.tax_amount} onChange={(e) => setForm({ ...form, tax_amount: e.target.value })} />
            <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="draft">Draft</option><option value="sent">Sent</option><option value="paid">Paid</option><option value="overdue">Overdue</option>
            </select>
          </div>
          <Input className="mt-3" placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="mt-4 flex items-center gap-2 pt-4 border-t border-border/30">
            <Button size="sm" onClick={createInvoice}>Save Invoice</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger-children">
        {[
          { label: 'Total Invoiced', value: formatUGX(totals.total), icon: FileText, gradient: 'from-slate-500 to-slate-600' },
          { label: 'Paid', value: formatUGX(totals.paid), icon: CheckCircle, gradient: 'from-emerald-500 to-green-600' },
          { label: 'Pending', value: formatUGX(totals.pending), icon: Clock, gradient: 'from-blue-500 to-blue-600' },
          { label: 'Overdue', value: formatUGX(totals.overdue), icon: AlertTriangle, gradient: 'from-red-500 to-rose-600' },
        ].map((stat) => (
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

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border/30 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input className="pl-10" placeholder="Search invoice number or customer..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {Object.keys(statusBadge).map((s) => <option key={s} value={s}>{statusBadge[s].label}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Dates</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="!py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading invoices...</p>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="!py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-6 h-6 text-muted-foreground/25" />
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">No invoices found</p>
                  <p className="text-xs text-muted-foreground/40 mt-1">Create your first invoice to get started</p>
                </td></tr>
              ) : filtered.map((invoice) => {
                const sb = statusBadge[invoice.status] || statusBadge.draft
                return (
                  <tr key={invoice.id} className="group">
                    <td className="font-semibold text-foreground">{invoice.invoice_number}</td>
                    <td className="text-muted-foreground">{invoice.customer_name}</td>
                    <td>
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">Issued: {invoice.invoice_date}</p>
                        <p className="text-xs text-muted-foreground/50">Due: {invoice.due_date}</p>
                      </div>
                    </td>
                    <td className="text-right font-mono font-bold tabular-nums">{formatUGX(invoice.total_amount || 0)}</td>
                    <td><span className={`badge ${sb.cls}`}>{sb.label}</span></td>
                    <td className="text-right">
                      <button onClick={() => deleteInvoice(invoice.id)} className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border/20 bg-muted/10">
            <p className="text-xs text-muted-foreground/50">Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {invoices.length} invoices</p>
          </div>
        )}
      </Card>
    </div>
  )
}
