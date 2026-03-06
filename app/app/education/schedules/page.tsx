'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function SchedulesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [modules, setModules] = useState<any[]>([])
  const [instructors, setInstructors] = useState<any[]>([])
  const [schedules, setSchedules] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState({ module_id: '', instructor_id: '', day_name: 'Monday', start_time: '', end_time: '', room_location: '' })

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    setCompanyId(ctx.companyId)
    const [mRes, iRes, sRes] = await Promise.all([
      supabase.from('education_modules').select('id, module_code, module_name').eq('company_id', ctx.companyId).order('module_code'),
      supabase.from('company_employees').select('id, users(full_name)').eq('company_id', ctx.companyId).eq('status', 'active'),
      supabase.from('lecture_schedules').select('*, education_modules(module_code, module_name), company_employees(users(full_name))').eq('company_id', ctx.companyId).order('day_name'),
    ])
    setModules(mRes.data || [])
    setInstructors(iRes.data || [])
    setSchedules(sRes.data || [])
  }

  useEffect(() => { loadData() }, [])

  const filtered = schedules.filter((row:any)=>{const q = searchQuery.toLowerCase(); const matchSearch = !searchQuery || JSON.stringify(row).toLowerCase().includes(q); const matchStatus = !statusFilter || row.status===statusFilter || row.day_name===statusFilter; return matchSearch && matchStatus})

  const addSchedule = async () => {
    if (!companyId || !form.module_id || !form.instructor_id || !form.start_time || !form.end_time) return
    await supabase.from('lecture_schedules').insert({ ...form, company_id: companyId, room_location: form.room_location || null })
    setForm({ module_id: '', instructor_id: '', day_name: 'Monday', start_time: '', end_time: '', room_location: '' })
    await loadData()
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Lecture Schedules</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage lecture timetables and rooms</p>
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02] space-y-3">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Search className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add Schedule</h3>
            <p className="text-[11px] text-muted-foreground/60">Create a new lecture schedule</p>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <select className="form-select" value={form.module_id} onChange={e => setForm({ ...form, module_id: e.target.value })}>
            <option value="">Module</option>
            {modules.map((m: any) => <option key={m.id} value={m.id}>{m.module_code}</option>)}
          </select>
          <select className="form-select" value={form.instructor_id} onChange={e => setForm({ ...form, instructor_id: e.target.value })}>
            <option value="">Instructor</option>
            {instructors.map((i: any) => <option key={i.id} value={i.id}>{i.users?.full_name}</option>)}
          </select>
          <select className="form-select" value={form.day_name} onChange={e => setForm({ ...form, day_name: e.target.value })}>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
          <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
          <Input placeholder="Room" value={form.room_location} onChange={e => setForm({ ...form, room_location: e.target.value })} />
        </div>
        <div className="pt-3 border-t border-border/30">
          <Button size="sm" onClick={addSchedule}>Save Schedule</Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input className="pl-10" placeholder="Search by module/day or instructor..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <Input className="w-auto" placeholder="Filter by day" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead><tr><th>Module</th><th>Instructor</th><th>Day</th><th>Time</th><th>Room</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="!py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4"><Search className="w-6 h-6 text-muted-foreground/25" /></div>
                  <p className="text-sm text-muted-foreground font-medium">No schedules found</p>
                </td></tr>
              ) : filtered.map((s: any) => (
                <tr key={s.id} className="group">
                  <td className="font-medium text-foreground">{s.education_modules?.module_code}</td>
                  <td className="text-muted-foreground">{s.company_employees?.users?.full_name || '—'}</td>
                  <td><span className="badge badge-info">{s.day_name}</span></td>
                  <td className="text-xs text-muted-foreground whitespace-nowrap">{s.start_time} - {s.end_time}</td>
                  <td className="text-muted-foreground">{s.room_location || '—'}</td>
                  <td className="text-right">
                    <button className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 transition-all" onClick={async () => { await supabase.from('lecture_schedules').delete().eq('id', s.id); await loadData() }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
