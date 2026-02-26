'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function HelpdeskPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [tickets, setTickets] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
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

  return <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6"><h1 className="text-2xl font-bold">Help Desk</h1><Card className="p-4 space-y-3"><div className="grid md:grid-cols-3 gap-3"><Input placeholder="Subject" value={form.subject} onChange={e=>setForm({ ...form, subject: e.target.value })}/><select className="px-3 py-2 border rounded" value={form.priority} onChange={e=>setForm({ ...form, priority: e.target.value })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="urgent">urgent</option></select><select className="px-3 py-2 border rounded" value={form.assigned_to} onChange={e=>setForm({ ...form, assigned_to: e.target.value })}><option value="">Unassigned</option>{employees.map((e:any)=><option key={e.id} value={e.id}>{e.users?.full_name}</option>)}</select></div><Input placeholder="Description" value={form.description} onChange={e=>setForm({ ...form, description: e.target.value })}/><Button onClick={createTicket}>Create Ticket</Button></Card><Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500"><th className="px-4 py-2 text-left">Ticket</th><th className="px-4 py-2 text-left">Subject</th><th className="px-4 py-2 text-left">Priority</th><th className="px-4 py-2 text-left">Assigned</th><th className="px-4 py-2 text-left">Status</th></tr></thead><tbody>{tickets.length===0?<tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No tickets</td></tr>:tickets.map((t:any)=><tr key={t.id} className="border-b"><td className="px-4 py-2">{t.ticket_number}</td><td className="px-4 py-2">{t.subject}</td><td className="px-4 py-2 capitalize">{t.priority}</td><td className="px-4 py-2">{t.company_employees?.users?.full_name || '—'}</td><td className="px-4 py-2 capitalize">{t.status}</td></tr>)}</tbody></table></Card></div>
}
