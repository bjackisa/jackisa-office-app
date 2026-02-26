'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LeavePage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [requests, setRequests] = useState<any[]>([])
  const [types, setTypes] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [form, setForm] = useState({ employee_id: '', leave_type_id: '', start_date: '', end_date: '', reason: '' })

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    setCompanyId(ctx.companyId)

    const [reqRes, typeRes, empRes] = await Promise.all([
      supabase.from('leave_requests').select('*, leave_types(name), company_employees(users(full_name))').eq('company_id', ctx.companyId).order('created_at', { ascending: false }),
      supabase.from('leave_types').select('*').eq('company_id', ctx.companyId).order('name'),
      supabase.from('company_employees').select('id, users(full_name)').eq('company_id', ctx.companyId).eq('status', 'active'),
    ])

    setRequests(reqRes.data || [])
    setTypes(typeRes.data || [])
    setEmployees(empRes.data || [])
  }

  useEffect(() => { loadData() }, [])

  const submitRequest = async () => {
    if (!companyId || !form.employee_id || !form.leave_type_id || !form.start_date || !form.end_date) return
    const start = new Date(form.start_date)
    const end = new Date(form.end_date)
    const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)

    await supabase.from('leave_requests').insert({
      company_id: companyId,
      employee_id: form.employee_id,
      leave_type_id: form.leave_type_id,
      start_date: form.start_date,
      end_date: form.end_date,
      days_count: days,
      reason: form.reason || null,
      status: 'pending',
    })

    setForm({ employee_id: '', leave_type_id: '', start_date: '', end_date: '', reason: '' })
    await loadData()
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Leave Management</h1>
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">Record Leave Request</h2>
        <div className="grid md:grid-cols-5 gap-3">
          <select className="px-3 py-2 border rounded" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}><option value="">Employee</option>{employees.map((e:any)=><option key={e.id} value={e.id}>{e.users?.full_name || 'Unnamed'}</option>)}</select>
          <select className="px-3 py-2 border rounded" value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}><option value="">Leave type</option>{types.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <Input type="date" value={form.start_date} onChange={(e)=>setForm({ ...form, start_date: e.target.value })} />
          <Input type="date" value={form.end_date} onChange={(e)=>setForm({ ...form, end_date: e.target.value })} />
          <Input placeholder="Reason" value={form.reason} onChange={(e)=>setForm({ ...form, reason: e.target.value })} />
        </div>
        <Button onClick={submitRequest}>Submit Request</Button>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50 text-xs uppercase text-gray-500"><th className="px-4 py-2 text-left">Employee</th><th className="px-4 py-2 text-left">Type</th><th className="px-4 py-2 text-left">Period</th><th className="px-4 py-2 text-right">Days</th><th className="px-4 py-2 text-left">Status</th></tr></thead>
          <tbody>{requests.length===0?<tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No leave requests</td></tr>:requests.map((r:any)=><tr key={r.id} className="border-b"><td className="px-4 py-2">{r.company_employees?.users?.full_name || 'Unknown'}</td><td className="px-4 py-2">{r.leave_types?.name || '—'}</td><td className="px-4 py-2">{r.start_date} → {r.end_date}</td><td className="px-4 py-2 text-right">{r.days_count}</td><td className="px-4 py-2 capitalize">{r.status}</td></tr>)}</tbody>
        </table>
      </Card>
    </div>
  )
}
