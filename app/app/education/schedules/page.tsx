'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function SchedulesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [modules, setModules] = useState<any[]>([])
  const [instructors, setInstructors] = useState<any[]>([])
  const [schedules, setSchedules] = useState<any[]>([])
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

  const addSchedule = async () => {
    if (!companyId || !form.module_id || !form.instructor_id || !form.start_time || !form.end_time) return
    await supabase.from('lecture_schedules').insert({ ...form, company_id: companyId, room_location: form.room_location || null })
    setForm({ module_id: '', instructor_id: '', day_name: 'Monday', start_time: '', end_time: '', room_location: '' })
    await loadData()
  }

  return <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6"><h1 className="text-2xl font-bold">Lecture Schedules</h1><Card className="p-4 space-y-3"><div className="grid md:grid-cols-3 gap-3"><select className="px-3 py-2 border rounded" value={form.module_id} onChange={e=>setForm({ ...form, module_id: e.target.value })}><option value="">Module</option>{modules.map((m:any)=><option key={m.id} value={m.id}>{m.module_code}</option>)}</select><select className="px-3 py-2 border rounded" value={form.instructor_id} onChange={e=>setForm({ ...form, instructor_id: e.target.value })}><option value="">Instructor</option>{instructors.map((i:any)=><option key={i.id} value={i.id}>{i.users?.full_name}</option>)}</select><select className="px-3 py-2 border rounded" value={form.day_name} onChange={e=>setForm({ ...form, day_name: e.target.value })}>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d=><option key={d} value={d}>{d}</option>)}</select><Input type="time" value={form.start_time} onChange={e=>setForm({ ...form, start_time: e.target.value })}/><Input type="time" value={form.end_time} onChange={e=>setForm({ ...form, end_time: e.target.value })}/><Input placeholder="Room" value={form.room_location} onChange={e=>setForm({ ...form, room_location: e.target.value })}/></div><Button onClick={addSchedule}>Save Schedule</Button></Card><Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500"><th className="px-4 py-2 text-left">Module</th><th className="px-4 py-2 text-left">Instructor</th><th className="px-4 py-2 text-left">Day</th><th className="px-4 py-2 text-left">Time</th><th className="px-4 py-2 text-left">Room</th></tr></thead><tbody>{schedules.length===0?<tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No schedules</td></tr>:schedules.map((s:any)=><tr key={s.id} className="border-b"><td className="px-4 py-2">{s.education_modules?.module_code}</td><td className="px-4 py-2">{s.company_employees?.users?.full_name || '—'}</td><td className="px-4 py-2">{s.day_name}</td><td className="px-4 py-2">{s.start_time} - {s.end_time}</td><td className="px-4 py-2">{s.room_location || '—'}</td></tr>)}</tbody></table></Card></div>
}
