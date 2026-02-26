'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function CommissionsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [commissions, setCommissions] = useState<any[]>([])
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

  return <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6"><h1 className="text-2xl font-bold">Sales Commissions</h1><Card className="p-4 space-y-3"><div className="grid md:grid-cols-3 gap-3"><select className="px-3 py-2 border rounded" value={form.employee_id} onChange={e=>setForm({ ...form, employee_id: e.target.value })}><option value="">Employee</option>{employees.map((e:any)=><option key={e.id} value={e.id}>{e.users?.full_name}</option>)}</select><select className="px-3 py-2 border rounded" value={form.sales_order_id} onChange={e=>setForm({ ...form, sales_order_id: e.target.value })}><option value="">Sales order</option>{orders.map((o:any)=><option key={o.id} value={o.id}>{o.order_number} ({Number(o.total_amount).toLocaleString()})</option>)}</select><Input type="number" placeholder="Rate %" value={form.commission_rate} onChange={e=>setForm({ ...form, commission_rate: e.target.value })}/></div><Button onClick={addCommission}>Record Commission</Button></Card><Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500"><th className="px-4 py-2 text-left">Employee</th><th className="px-4 py-2 text-left">Order</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-left">Status</th></tr></thead><tbody>{commissions.length===0?<tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No commissions</td></tr>:commissions.map((c:any)=><tr key={c.id} className="border-b"><td className="px-4 py-2">{c.company_employees?.users?.full_name || 'Unknown'}</td><td className="px-4 py-2">{c.sales_orders?.order_number || '—'}</td><td className="px-4 py-2 text-right">{Number(c.commission_rate).toFixed(2)}%</td><td className="px-4 py-2 text-right font-mono">{Number(c.commission_amount||0).toLocaleString()}</td><td className="px-4 py-2 capitalize">{c.status}</td></tr>)}</tbody></table></Card></div>
}
