'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function CourseworkPage() {
  const [modules, setModules] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [days, setDays] = useState<any[]>([])
  const [grades, setGrades] = useState<any[]>([])
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [form, setForm] = useState({ module_id: '', day_number: '', title: '', max_marks: '' })
  const [marksForm, setMarksForm] = useState({ student_id: '', coursework_day_id: '', marks_obtained: '' })

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    const [mRes, dRes, sRes, gRes, eRes] = await Promise.all([
      supabase.from('education_modules').select('id, module_code, module_name').eq('company_id', ctx.companyId).order('module_code'),
      supabase.from('coursework_days').select('*, education_modules(module_code, module_name)').order('day_number'),
      supabase.from('students').select('id, full_name, student_id').eq('company_id', ctx.companyId),
      supabase.from('student_grades_coursework').select('*').order('created_at', { ascending: false }),
      supabase.from('student_enrollments').select('*'),
    ])
    setModules(mRes.data || [])
    setDays(dRes.data || [])
    setStudents(sRes.data || [])
    setGrades(gRes.data || [])
    setEnrollments(eRes.data || [])
  }

  useEffect(() => { loadData() }, [])

  const addDay = async () => {
    if (!form.module_id || !form.day_number || !form.title || !form.max_marks) return
    await supabase.from('coursework_days').insert({ module_id: form.module_id, day_number: Number(form.day_number), title: form.title, max_marks: Number(form.max_marks) })
    setForm({ module_id: '', day_number: '', title: '', max_marks: '' })
    await loadData()
  }

  const saveMarks = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId || !marksForm.student_id || !marksForm.coursework_day_id || marksForm.marks_obtained === '') return
    await supabase.from('student_grades_coursework').upsert({
      student_id: marksForm.student_id,
      coursework_day_id: marksForm.coursework_day_id,
      marks_obtained: Number(marksForm.marks_obtained),
      recorded_by: userId,
    })
    setMarksForm({ student_id: '', coursework_day_id: '', marks_obtained: '' })
    await loadData()
  }

  const eligibleStudents = useMemo(() => {
    return students.filter((student) => {
      const myEnrollments = enrollments.filter((e) => e.student_id === student.id)
      let missedDays = 0
      myEnrollments.forEach((enrollment) => {
        const moduleDays = days.filter((day) => day.module_id === enrollment.module_id)
        moduleDays.forEach((day) => {
          const grade = grades.find((g) => g.student_id === student.id && g.coursework_day_id === day.id)
          if (!grade || Number(grade.marks_obtained) <= 0) missedDays += 1
        })
      })
      return missedDays < 3
    })
  }, [students, enrollments, days, grades])

  return <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6"><h1 className="text-2xl font-bold">Coursework</h1><Card className="p-4 space-y-3"><h2 className="font-semibold">Create coursework day</h2><div className="grid md:grid-cols-4 gap-3"><select className="px-3 py-2 border rounded" value={form.module_id} onChange={e=>setForm({ ...form, module_id: e.target.value })}><option value="">Module</option>{modules.map((m:any)=><option key={m.id} value={m.id}>{m.module_code} - {m.module_name}</option>)}</select><Input type="number" placeholder="Day number" value={form.day_number} onChange={e=>setForm({ ...form, day_number: e.target.value })}/><Input placeholder="Title" value={form.title} onChange={e=>setForm({ ...form, title: e.target.value })}/><Input type="number" placeholder="Max marks" value={form.max_marks} onChange={e=>setForm({ ...form, max_marks: e.target.value })}/></div><Button onClick={addDay}>Add Coursework Day</Button></Card><Card className="p-4 space-y-3"><h2 className="font-semibold">Record student marks (0 means missed)</h2><div className="grid md:grid-cols-3 gap-3"><select className="px-3 py-2 border rounded" value={marksForm.student_id} onChange={e=>setMarksForm({ ...marksForm, student_id: e.target.value })}><option value="">Student</option>{students.map((s:any)=><option key={s.id} value={s.id}>{s.student_id} - {s.full_name}</option>)}</select><select className="px-3 py-2 border rounded" value={marksForm.coursework_day_id} onChange={e=>setMarksForm({ ...marksForm, coursework_day_id: e.target.value })}><option value="">Coursework day</option>{days.map((d:any)=><option key={d.id} value={d.id}>{d.education_modules?.module_code} Day {d.day_number} - {d.title}</option>)}</select><Input type="number" placeholder="Marks" value={marksForm.marks_obtained} onChange={e=>setMarksForm({ ...marksForm, marks_obtained: e.target.value })}/></div><Button onClick={saveMarks}>Save Marks</Button><p className="text-xs text-muted-foreground">Students with 3 or more missed/retake days are disqualified from final exam.</p></Card><Card className="p-4"><h2 className="font-semibold mb-2">Qualified students</h2><p className="text-sm text-muted-foreground">{eligibleStudents.map((s:any)=>`${s.student_id} ${s.full_name}`).join(', ') || 'None yet'}</p></Card></div>
}
