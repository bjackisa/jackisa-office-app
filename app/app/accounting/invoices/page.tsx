'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Plus, Search, Download, Eye, Trash2, FileText,
  DollarSign, Clock, CheckCircle, AlertTriangle, Filter,
} from 'lucide-react'

const statusConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
  draft: { label: 'Draft', bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
  sent: { label: 'Sent', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
  paid: { label: 'Paid', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  overdue: { label: 'Overdue', bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
  cancelled: { label: 'Cancelled', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  partially_paid: { label: 'Partial', bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200' },
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    loadInvoices()
  }, [])

  const loadInvoices = async () => {
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
        .from('invoices')
        .select('*')
        .eq('company_id', empData.company_id)
        .order('created_at', { ascending: false })

      if (!error && data) setInvoices(data)
    } catch (err) {
      console.error('Failed to load invoices:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = invoices.filter(inv => {
    const matchSearch = !search ||
      inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      inv.customer_name?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || inv.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalAmount = invoices.reduce((s, i) => s + (i.total_amount || 0), 0)
  const paidAmount = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total_amount || 0), 0)
  const pendingAmount = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + (i.total_amount || 0), 0)
  const overdueAmount = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + (i.total_amount || 0), 0)

  const formatUGX = (n: number) => `UGX ${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Invoices</h1>
          <p className="text-sm text-gray-500">Create, manage, and track customer invoices</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-gray-600">
            <Download className="w-4 h-4 mr-1.5" />
            Export
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-1.5" />
            New Invoice
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Invoiced', value: formatUGX(totalAmount), icon: FileText, color: 'text-gray-900', bg: 'bg-gray-50' },
          { label: 'Paid', value: formatUGX(paidAmount), icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Pending', value: formatUGX(pendingAmount), icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Overdue', value: formatUGX(overdueAmount), icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(stat => (
          <Card key={stat.label} className="p-4 border border-gray-200/60 bg-white">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-gray-900 truncate">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by invoice # or customer..."
            className="pl-10 bg-white border-gray-200"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-600"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <Card className="border border-gray-200/60 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice #</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Due Date</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-400">Loading invoices...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <FileText className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400 font-medium">No invoices found</p>
                    <p className="text-xs text-gray-300 mt-1">Create your first invoice to get started</p>
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => {
                  const cfg = statusConfig[inv.status] || statusConfig.draft
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <span className="text-sm font-semibold text-blue-600">{inv.invoice_number || '—'}</span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-900 font-medium">{inv.customer_name || '—'}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">
                        {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500">
                        {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-3 text-sm font-bold text-gray-900 text-right font-mono">
                        {formatUGX(inv.total_amount || 0)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button className="p-1.5 hover:bg-gray-100 rounded-md transition-colors" title="View">
                            <Eye className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                          <button className="p-1.5 hover:bg-gray-100 rounded-md transition-colors" title="Download">
                            <Download className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                          <button className="p-1.5 hover:bg-red-50 rounded-md transition-colors" title="Delete">
                            <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/30 text-xs text-gray-400">
            Showing {filtered.length} of {invoices.length} invoices
          </div>
        )}
      </Card>
    </div>
  )
}
