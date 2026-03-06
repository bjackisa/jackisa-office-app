'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function LeavePage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [requests, setRequests] = useState<any[]>([])
  const [types, setTypes] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
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

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase()
    const sf = statusFilter.toLowerCase()
    return requests.filter(r => {
      const name = (r.company_employees?.users?.full_name || '').toLowerCase()
      const type = (r.leave_types?.name || '').toLowerCase()
      const reason = (r.reason || '').toLowerCase()
      const status = (r.status || '').toLowerCase()
      const matchSearch = !q || name.includes(q) || type.includes(q) || reason.includes(q)
      const matchStatus = !sf || status.includes(sf) || String(r.days_count || '').includes(sf)
      return matchSearch && matchStatus
    })
  }, [requests, searchQuery, statusFilter])

  return (
    <div className="p-6 lg:p-8 max-w-[1300px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Leave Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track and manage employee time-off requests</p>
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02]">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Search className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">New Leave Request</h3>
            <p className="text-[11px] text-muted-foreground/60">Submit a time-off request for an employee</p>
          </div>
        </div>
        <div className="grid md:grid-cols-5 gap-3">
          <select className="form-select" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">Select employee</option>
            {employees.map((e:any)=><option key={e.id} value={e.id}>{e.users?.full_name || 'Unnamed'}</option>)}
          </select>
          <select className="form-select" value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}>
            <option value="">Leave type</option>
            {types.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <Input type="date" value={form.start_date} onChange={(e)=>setForm({ ...form, start_date: e.target.value })} />
          <Input type="date" value={form.end_date} onChange={(e)=>setForm({ ...form, end_date: e.target.value })} />
          <Input placeholder="Reason (optional)" value={form.reason} onChange={(e)=>setForm({ ...form, reason: e.target.value })} />
        </div>
        <div className="mt-4 pt-4 border-t border-border/30">
          <Button size="sm" onClick={submitRequest}>Submit Request</Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40"/>
            <Input className="pl-10" placeholder="Search by employee, type or reason..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}/>
          </div>
          <select className="form-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Leave Type</th>
                <th>Period</th>
                <th className="text-right">Days</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="!py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                      <Search className="w-6 h-6 text-muted-foreground/25" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">No leave requests</p>
                    <p className="text-xs text-muted-foreground/40 mt-1">Submit a request above to get started</p>
                  </td>
                </tr>
              ) : filtered.map((r:any) => (
                <tr key={r.id}>
                  <td className="font-medium text-foreground">{r.company_employees?.users?.full_name || 'Unknown'}</td>
                  <td className="text-muted-foreground">{r.leave_types?.name || '—'}</td>
                  <td>
                    <span className="text-xs text-muted-foreground">{r.start_date}</span>
                    <span className="text-xs text-muted-foreground/30 mx-1">→</span>
                    <span className="text-xs text-muted-foreground">{r.end_date}</span>
                  </td>
                  <td className="text-right font-semibold tabular-nums">{r.days_count}</td>
                  <td>
                    <span className={`badge ${
                      r.status === 'approved' ? 'badge-success' :
                      r.status === 'rejected' ? 'badge-danger' :
                      r.status === 'pending' ? 'badge-warning' : 'badge-neutral'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border/20 bg-muted/10">
            <p className="text-xs text-muted-foreground/50">Showing <span className="font-semibold text-foreground">{filtered.length}</span> requests</p>
          </div>
        )}
      </Card>
    </div>
  )
}
