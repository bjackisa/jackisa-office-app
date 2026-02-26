'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function CourseworkPage() {
  const [modules, setModules] = useState<any[]>([])
  const [days, setDays] = useState<any[]>([])
  const [form, setForm] = useState({ module_id: '', day_number: '', title: '', max_marks: '' })

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    const [mRes, dRes] = await Promise.all([
      supabase.from('education_modules').select('id, module_code, module_name').eq('company_id', ctx.companyId).order('module_code'),
      supabase.from('coursework_days').select('*, education_modules(module_code, module_name)').order('created_at', { ascending: false }),
    ])
    setModules(mRes.data || [])
    setDays(dRes.data || [])
  }

  useEffect(() => { loadData() }, [])

  const addDay = async () => {
    if (!form.module_id || !form.day_number || !form.title || !form.max_marks) return
    await supabase.from('coursework_days').insert({ module_id: form.module_id, day_number: Number(form.day_number), title: form.title, max_marks: Number(form.max_marks) })
    setForm({ module_id: '', day_number: '', title: '', max_marks: '' })
    await loadData()
  }

  return <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6"><h1 className="text-2xl font-bold">Coursework Days</h1><Card className="p-4 space-y-3"><div className="grid md:grid-cols-4 gap-3"><select className="px-3 py-2 border rounded" value={form.module_id} onChange={e=>setForm({ ...form, module_id: e.target.value })}><option value="">Module</option>{modules.map((m:any)=><option key={m.id} value={m.id}>{m.module_code} - {m.module_name}</option>)}</select><Input type="number" placeholder="Day number" value={form.day_number} onChange={e=>setForm({ ...form, day_number: e.target.value })}/><Input placeholder="Title" value={form.title} onChange={e=>setForm({ ...form, title: e.target.value })}/><Input type="number" placeholder="Max marks" value={form.max_marks} onChange={e=>setForm({ ...form, max_marks: e.target.value })}/></div><Button onClick={addDay}>Add Coursework Day</Button></Card><Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500"><th className="px-4 py-2 text-left">Module</th><th className="px-4 py-2 text-left">Day</th><th className="px-4 py-2 text-left">Title</th><th className="px-4 py-2 text-right">Max</th></tr></thead><tbody>{days.length===0?<tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No coursework days</td></tr>:days.map((d:any)=><tr key={d.id} className="border-b"><td className="px-4 py-2">{d.education_modules?.module_code}</td><td className="px-4 py-2">{d.day_number}</td><td className="px-4 py-2">{d.title}</td><td className="px-4 py-2 text-right">{d.max_marks}</td></tr>)}</tbody></table></Card></div>
}
