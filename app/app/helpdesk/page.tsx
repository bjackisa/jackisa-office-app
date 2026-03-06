'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function HelpdeskPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [tickets, setTickets] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState({ subject: '', description: '', priority: 'medium', assigned_to: '' })

  const loadData = async () => {
    const ctx = await getSessionContext(); if (!ctx?.companyId) return
    setCompanyId(ctx.companyId); setUserId(ctx.userId)
    const [tRes, eRes] = await Promise.all([
      supabase.from('support_tickets').select('*, company_employees(users(full_name))').eq('company_id', ctx.companyId).order('created_at', { ascending: false }),
      supabase.from('company_employees').select('id, users(full_name)').eq('company_id', ctx.companyId).eq('status', 'active')
    ])
    setTickets(tRes.data || [])
    setEmployees(eRes.data || [])
  }
  useEffect(()=>{loadData()},[])

  const filtered = tickets.filter((t)=>{const s=!searchQuery||t.ticket_number?.toLowerCase().includes(searchQuery.toLowerCase())||t.subject?.toLowerCase().includes(searchQuery.toLowerCase()); const st=!statusFilter||t.status===statusFilter; return s&&st})

  const createTicket = async () => {
    if (!companyId || !userId || !form.subject) return
    await supabase.from('support_tickets').insert({
      company_id: companyId,
      ticket_number: `TK-${Date.now()}`,
      subject: form.subject,
      description: form.description || null,
      priority: form.priority,
      status: 'open',
      assigned_to: form.assigned_to || null,
      reported_by: userId,
    })
    setForm({ subject: '', description: '', priority: 'medium', assigned_to: '' })
    await loadData()
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1300px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Help Desk</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage support tickets and issues</p>
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02]">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Search className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Create Ticket</h3>
            <p className="text-[11px] text-muted-foreground/60">Submit a new support request</p>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Input placeholder="Subject *" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
          <select className="form-select" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select>
          <select className="form-select" value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}>
            <option value="">Unassigned</option>
            {employees.map((e: any) => <option key={e.id} value={e.id}>{e.users?.full_name}</option>)}
          </select>
        </div>
        <Input className="mt-3" placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <div className="mt-4 pt-4 border-t border-border/30">
          <Button size="sm" onClick={createTicket}>Create Ticket</Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input className="pl-10" placeholder="Search ticket or subject..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <select className="form-select w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option><option value="open">Open</option><option value="in_progress">In Progress</option><option value="closed">Closed</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Subject</th>
                <th>Priority</th>
                <th>Assigned</th>
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
                    <p className="text-sm text-muted-foreground font-medium">No tickets found</p>
                    <p className="text-xs text-muted-foreground/40 mt-1">Create a ticket above to get started</p>
                  </td>
                </tr>
              ) : filtered.map((t: any) => (
                <tr key={t.id} className="group">
                  <td className="font-mono text-xs text-muted-foreground">{t.ticket_number}</td>
                  <td className="font-medium text-foreground">{t.subject}</td>
                  <td>
                    <span className={`badge ${
                      t.priority === 'urgent' ? 'badge-danger' :
                      t.priority === 'high' ? 'badge-warning' :
                      t.priority === 'medium' ? 'badge-info' : 'badge-neutral'
                    }`}>{t.priority}</span>
                  </td>
                  <td className="text-muted-foreground">{t.company_employees?.users?.full_name || '—'}</td>
                  <td>
                    <span className={`badge ${
                      t.status === 'open' ? 'badge-info' :
                      t.status === 'in_progress' ? 'badge-warning' :
                      t.status === 'closed' ? 'badge-success' : 'badge-neutral'
                    }`}>{t.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border/20 bg-muted/10">
            <p className="text-xs text-muted-foreground/50">Showing <span className="font-semibold text-foreground">{filtered.length}</span> tickets</p>
          </div>
        )}
      </Card>
    </div>
  )
}
