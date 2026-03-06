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

  return <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6"><h1 className="text-2xl font-bold">Help Desk</h1><Card className="p-4 space-y-3"><div className="grid md:grid-cols-3 gap-3"><Input placeholder="Subject" value={form.subject} onChange={e=>setForm({ ...form, subject: e.target.value })}/><select className="px-3 py-2 border rounded" value={form.priority} onChange={e=>setForm({ ...form, priority: e.target.value })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="urgent">urgent</option></select><select className="px-3 py-2 border rounded" value={form.assigned_to} onChange={e=>setForm({ ...form, assigned_to: e.target.value })}><option value="">Unassigned</option>{employees.map((e:any)=><option key={e.id} value={e.id}>{e.users?.full_name}</option>)}</select></div><Input placeholder="Description" value={form.description} onChange={e=>setForm({ ...form, description: e.target.value })}/><Button onClick={createTicket}>Create Ticket</Button></Card><Card className="p-3 border border-border/50"><div className="flex flex-col sm:flex-row gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60"/><Input className="pl-10" placeholder="Search ticket or subject..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}/></div><select className="px-3 py-2 border rounded-lg text-sm" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All Status</option><option value="open">open</option><option value="in_progress">in_progress</option><option value="closed">closed</option></select></div></Card><Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b text-xs uppercase text-muted-foreground"><th className="px-4 py-2 text-left">Ticket</th><th className="px-4 py-2 text-left">Subject</th><th className="px-4 py-2 text-left">Priority</th><th className="px-4 py-2 text-left">Assigned</th><th className="px-4 py-2 text-left">Status</th></tr></thead><tbody>{filtered.length===0?<tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground/60">No tickets</td></tr>:filtered.map((t:any)=><tr key={t.id} className="border-b"><td className="px-4 py-2">{t.ticket_number}</td><td className="px-4 py-2">{t.subject}</td><td className="px-4 py-2 capitalize">{t.priority}</td><td className="px-4 py-2">{t.company_employees?.users?.full_name || '—'}</td><td className="px-4 py-2 capitalize">{t.status}</td></tr>)}</tbody></table></Card></div>
}
