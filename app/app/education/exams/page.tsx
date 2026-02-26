'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ExamsPage() {
  const [modules, setModules] = useState<any[]>([])
  const [exams, setExams] = useState<any[]>([])
  const [form, setForm] = useState({ module_id: '', exam_date: '', max_marks: '' })

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    const [mRes, eRes] = await Promise.all([
      supabase.from('education_modules').select('id, module_code, module_name').eq('company_id', ctx.companyId).order('module_code'),
      supabase.from('final_exams').select('*, education_modules(module_code, module_name)').order('exam_date', { ascending: false }),
    ])
    setModules(mRes.data || [])
    setExams(eRes.data || [])
  }

  useEffect(() => { loadData() }, [])

  const addExam = async () => {
    if (!form.module_id || !form.exam_date || !form.max_marks) return
    await supabase.from('final_exams').insert({ module_id: form.module_id, exam_date: form.exam_date, max_marks: Number(form.max_marks) })
    setForm({ module_id: '', exam_date: '', max_marks: '' })
    await loadData()
  }

  return <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6"><h1 className="text-2xl font-bold">Exams</h1><Card className="p-4 space-y-3"><div className="grid md:grid-cols-3 gap-3"><select className="px-3 py-2 border rounded" value={form.module_id} onChange={e=>setForm({ ...form, module_id: e.target.value })}><option value="">Module</option>{modules.map((m:any)=><option key={m.id} value={m.id}>{m.module_code} - {m.module_name}</option>)}</select><Input type="date" value={form.exam_date} onChange={e=>setForm({ ...form, exam_date: e.target.value })} /><Input type="number" placeholder="Max marks" value={form.max_marks} onChange={e=>setForm({ ...form, max_marks: e.target.value })} /></div><Button onClick={addExam}>Add Exam</Button></Card><Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500"><th className="px-4 py-2 text-left">Module</th><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-right">Max marks</th></tr></thead><tbody>{exams.length===0?<tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No exams</td></tr>:exams.map((e:any)=><tr key={e.id} className="border-b"><td className="px-4 py-2">{e.education_modules?.module_code}</td><td className="px-4 py-2">{e.exam_date}</td><td className="px-4 py-2 text-right">{e.max_marks}</td></tr>)}</tbody></table></Card></div>
}
