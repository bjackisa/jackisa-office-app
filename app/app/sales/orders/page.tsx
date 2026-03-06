'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function SalesOrdersPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState({ customer_name: '', customer_email: '', customer_phone: '', order_date: new Date().toISOString().split('T')[0], subtotal: '', tax_amount: '', notes: '' })

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    setCompanyId(ctx.companyId); setUserId(ctx.userId)
    const { data } = await supabase.from('sales_orders').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false })
    setOrders(data || [])
  }
  useEffect(() => { loadData() }, [])

  const filtered = orders.filter((o)=>{const s=!searchQuery||o.order_number?.toLowerCase().includes(searchQuery.toLowerCase())||o.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()); const st=!statusFilter||o.status===statusFilter; return s&&st})

  const createOrder = async () => {
    if (!companyId || !userId || !form.customer_name || !form.subtotal) return
    const subtotal = Number(form.subtotal), tax = Number(form.tax_amount || 0)
    await supabase.from('sales_orders').insert({
      company_id: companyId,
      order_number: `SO-${Date.now()}`,
      customer_name: form.customer_name,
      customer_email: form.customer_email || null,
      customer_phone: form.customer_phone || null,
      order_date: form.order_date,
      subtotal,
      tax_amount: tax,
      total_amount: subtotal + tax,
      status: 'draft',
      notes: form.notes || null,
      created_by: userId,
    })
    setForm({ customer_name: '', customer_email: '', customer_phone: '', order_date: new Date().toISOString().split('T')[0], subtotal: '', tax_amount: '', notes: '' })
    await loadData()
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1300px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Sales Orders</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Create and manage sales orders</p>
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02]">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Search className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Create Order</h3>
            <p className="text-[11px] text-muted-foreground/60">Add a new sales order</p>
          </div>
        </div>
        <div className="grid md:grid-cols-4 gap-3">
          <Input placeholder="Customer *" value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} />
          <Input placeholder="Email" value={form.customer_email} onChange={e => setForm({ ...form, customer_email: e.target.value })} />
          <Input placeholder="Phone" value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} />
          <Input type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} />
          <Input type="number" placeholder="Subtotal *" value={form.subtotal} onChange={e => setForm({ ...form, subtotal: e.target.value })} />
          <Input type="number" placeholder="Tax" value={form.tax_amount} onChange={e => setForm({ ...form, tax_amount: e.target.value })} />
          <Input className="md:col-span-2" placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="mt-4 pt-4 border-t border-border/30">
          <Button size="sm" onClick={createOrder}>Create Order</Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input className="pl-10" placeholder="Search order or customer..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <select className="form-select w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option><option value="draft">Draft</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th className="text-right">Total</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="!py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4"><Search className="w-6 h-6 text-muted-foreground/25" /></div>
                  <p className="text-sm text-muted-foreground font-medium">No sales orders found</p>
                </td></tr>
              ) : filtered.map((o: any) => (
                <tr key={o.id} className="group">
                  <td className="font-mono text-xs text-muted-foreground">{o.order_number}</td>
                  <td className="font-medium text-foreground">{o.customer_name}</td>
                  <td className="text-xs text-muted-foreground whitespace-nowrap">{o.order_date}</td>
                  <td className="text-right font-mono font-bold tabular-nums text-foreground">{Number(o.total_amount || 0).toLocaleString()}</td>
                  <td><span className={`badge ${o.status === 'paid' ? 'badge-success' : o.status === 'cancelled' ? 'badge-danger' : o.status === 'pending' ? 'badge-warning' : 'badge-neutral'}`}>{o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
