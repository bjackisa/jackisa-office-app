'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function CommissionsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [commissions, setCommissions] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState({ employee_id: '', sales_order_id: '', commission_rate: '' })

  const loadData = async () => {
    const ctx = await getSessionContext(); if (!ctx?.companyId) return
    setCompanyId(ctx.companyId)
    const [eRes, oRes, cRes] = await Promise.all([
      supabase.from('company_employees').select('id, users(full_name)').eq('company_id', ctx.companyId).eq('status', 'active'),
      supabase.from('sales_orders').select('id, order_number, total_amount').eq('company_id', ctx.companyId).order('created_at', { ascending: false }),
      supabase.from('sales_commissions').select('*, company_employees(users(full_name)), sales_orders(order_number,total_amount)').eq('company_id', ctx.companyId).order('created_at', { ascending: false }),
    ])
    setEmployees(eRes.data||[]); setOrders(oRes.data||[]); setCommissions(cRes.data||[])
  }
  useEffect(()=>{loadData()},[])

  const filtered = commissions.filter((c)=>{const s=!searchQuery||c.company_employees?.users?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())||c.sales_orders?.order_number?.toLowerCase().includes(searchQuery.toLowerCase()); const st=!statusFilter||c.status===statusFilter; return s&&st})

  const addCommission = async () => {
    if (!companyId || !form.employee_id || !form.sales_order_id || !form.commission_rate) return
    const order = orders.find((o:any)=>o.id===form.sales_order_id); if (!order) return
    const rate = Number(form.commission_rate)
    await supabase.from('sales_commissions').insert({
      company_id: companyId,
      employee_id: form.employee_id,
      sales_order_id: form.sales_order_id,
      commission_rate: rate,
      commission_amount: Number(order.total_amount || 0) * (rate / 100),
      status: 'pending',
    })
    setForm({ employee_id: '', sales_order_id: '', commission_rate: '' })
    await loadData()
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Sales Commissions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track and manage sales commissions</p>
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02]">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Search className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Record Commission</h3>
            <p className="text-[11px] text-muted-foreground/60">Assign a commission to an employee</p>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <select className="form-select" value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">Select Employee</option>
            {employees.map((e: any) => <option key={e.id} value={e.id}>{e.users?.full_name}</option>)}
          </select>
          <select className="form-select" value={form.sales_order_id} onChange={e => setForm({ ...form, sales_order_id: e.target.value })}>
            <option value="">Select Order</option>
            {orders.map((o: any) => <option key={o.id} value={o.id}>{o.order_number} ({Number(o.total_amount).toLocaleString()})</option>)}
          </select>
          <Input type="number" placeholder="Rate % *" value={form.commission_rate} onChange={e => setForm({ ...form, commission_rate: e.target.value })} />
        </div>
        <div className="mt-4 pt-4 border-t border-border/30">
          <Button size="sm" onClick={addCommission}>Record Commission</Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input className="pl-10" placeholder="Search employee or order..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <select className="form-select w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="paid">Paid</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead><tr><th>Employee</th><th>Order</th><th className="text-right">Rate</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="!py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4"><Search className="w-6 h-6 text-muted-foreground/25" /></div>
                  <p className="text-sm text-muted-foreground font-medium">No commissions found</p>
                </td></tr>
              ) : filtered.map((c: any) => (
                <tr key={c.id} className="group">
                  <td className="font-medium text-foreground">{c.company_employees?.users?.full_name || '—'}</td>
                  <td className="font-mono text-xs text-muted-foreground">{c.sales_orders?.order_number || '—'}</td>
                  <td className="text-right font-mono text-sm">{Number(c.commission_rate || 0).toFixed(2)}%</td>
                  <td className="text-right font-mono font-bold tabular-nums text-foreground">{Number(c.commission_amount || 0).toLocaleString()}</td>
                  <td><span className={`badge ${c.status === 'paid' ? 'badge-success' : c.status === 'approved' ? 'badge-info' : 'badge-warning'}`}>{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
