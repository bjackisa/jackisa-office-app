'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Download, Trash2, FileText, DollarSign, Clock, CheckCircle, AlertTriangle } from 'lucide-react'

const statusConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
  draft: { label: 'Draft', bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
  sent: { label: 'Sent', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
  paid: { label: 'Paid', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  overdue: { label: 'Overdue', bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
  cancelled: { label: 'Cancelled', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  partially_paid: { label: 'Partially Paid', bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200' },
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
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Invoices</h1>
          <p className="text-sm text-gray-500">Create, manage, and track customer invoices.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-gray-600" onClick={exportCsv}><Download className="w-4 h-4 mr-1.5" />Export</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowForm(!showForm)}><Plus className="w-4 h-4 mr-1.5" />New Invoice</Button>
        </div>
      </div>

      {showForm && (
        <Card className="mb-5 p-4 border border-blue-200 bg-blue-50/30">
          <div className="grid md:grid-cols-3 gap-3">
            <Input placeholder="Customer name" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            <Input placeholder="Customer email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
            <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            <Input type="number" placeholder="Subtotal" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: e.target.value })} />
            <Input type="number" placeholder="Tax amount" value={form.tax_amount} onChange={(e) => setForm({ ...form, tax_amount: e.target.value })} />
            <select className="px-3 py-2 border rounded-md" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="draft">Draft</option><option value="sent">Sent</option><option value="paid">Paid</option><option value="overdue">Overdue</option>
            </select>
          </div>
          <Input className="mt-3" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="mt-3 flex gap-2"><Button onClick={createInvoice}>Save Invoice</Button><Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button></div>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[{ label: 'Total Invoiced', value: formatUGX(totals.total), icon: FileText, color: 'text-gray-900', bg: 'bg-gray-50' }, { label: 'Paid', value: formatUGX(totals.paid), icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' }, { label: 'Pending', value: formatUGX(totals.pending), icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' }, { label: 'Overdue', value: formatUGX(totals.overdue), icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' }].map((stat) => (
          <Card key={stat.label} className="p-4 border border-gray-200/60 bg-white"><div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${stat.bg}`}><stat.icon className={`w-4 h-4 ${stat.color}`} /></div><div className="min-w-0"><p className="text-lg font-bold text-gray-900 truncate">{stat.value}</p><p className="text-xs text-gray-500">{stat.label}</p></div></div></Card>
        ))}
      </div>

      <Card className="border border-gray-200/60 bg-white overflow-hidden">
        <div className="p-4 border-b flex gap-3">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input className="pl-10" placeholder="Search invoice number or customer..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <select className="px-3 py-2 border rounded-md" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option>{Object.keys(statusConfig).map((s) => <option key={s} value={s}>{statusConfig[s].label}</option>)}</select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b bg-gray-50/50 text-xs uppercase text-gray-500"><th className="px-5 py-3 text-left">Invoice</th><th className="px-5 py-3 text-left">Customer</th><th className="px-5 py-3 text-left">Dates</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3 text-left">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
            <tbody className="divide-y">
              {loading ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">Loading invoices...</td></tr> : filtered.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">No invoices found.</td></tr> : filtered.map((invoice) => {
                const cfg = statusConfig[invoice.status] || statusConfig.draft
                return (
                  <tr key={invoice.id} className="hover:bg-gray-50/40">
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{invoice.invoice_number}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{invoice.customer_name}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">Issued: {invoice.invoice_date}<br />Due: {invoice.due_date}</td>
                    <td className="px-5 py-3 text-sm text-right font-mono font-semibold">{formatUGX(invoice.total_amount || 0)}</td>
                    <td className="px-5 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>{cfg.label}</span></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => deleteInvoice(invoice.id)} className="p-1.5 hover:bg-red-50 rounded-md"><Trash2 className="w-4 h-4 text-gray-500 hover:text-red-500" /></button></td>
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
