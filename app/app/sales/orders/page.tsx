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

  return <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6"><h1 className="text-2xl font-bold">Sales Orders</h1><Card className="p-4 space-y-3"><div className="grid md:grid-cols-4 gap-3"><Input placeholder="Customer" value={form.customer_name} onChange={e=>setForm({ ...form, customer_name: e.target.value })}/><Input placeholder="Email" value={form.customer_email} onChange={e=>setForm({ ...form, customer_email: e.target.value })}/><Input placeholder="Phone" value={form.customer_phone} onChange={e=>setForm({ ...form, customer_phone: e.target.value })}/><Input type="date" value={form.order_date} onChange={e=>setForm({ ...form, order_date: e.target.value })}/><Input type="number" placeholder="Subtotal" value={form.subtotal} onChange={e=>setForm({ ...form, subtotal: e.target.value })}/><Input type="number" placeholder="Tax" value={form.tax_amount} onChange={e=>setForm({ ...form, tax_amount: e.target.value })}/><Input className="md:col-span-2" placeholder="Notes" value={form.notes} onChange={e=>setForm({ ...form, notes: e.target.value })}/></div><Button onClick={createOrder}>Create Order</Button></Card><Card className="p-3 border border-border/50"><div className="flex flex-col sm:flex-row gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60"/><Input className="pl-10" placeholder="Search order or customer..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}/></div><select className="px-3 py-2 border rounded-lg text-sm" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All Status</option><option value="draft">draft</option><option value="pending">pending</option><option value="paid">paid</option><option value="cancelled">cancelled</option></select></div></Card><Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b text-xs uppercase text-muted-foreground"><th className="px-4 py-2 text-left">Order</th><th className="px-4 py-2 text-left">Customer</th><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-left">Status</th></tr></thead><tbody>{filtered.length===0?<tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground/60">No sales orders</td></tr>:filtered.map((o:any)=><tr key={o.id} className="border-b"><td className="px-4 py-2">{o.order_number}</td><td className="px-4 py-2">{o.customer_name}</td><td className="px-4 py-2">{o.order_date}</td><td className="px-4 py-2 text-right font-mono">{Number(o.total_amount||0).toLocaleString()}</td><td className="px-4 py-2 capitalize">{o.status}</td></tr>)}</tbody></table></Card></div>
}
