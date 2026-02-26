'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ExamsPage() {
  const [modules, setModules] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [exams, setExams] = useState<any[]>([])
  const [courseworkDays, setCourseworkDays] = useState<any[]>([])
  const [courseworkMarks, setCourseworkMarks] = useState<any[]>([])
  const [form, setForm] = useState({ module_id: '', exam_date: '', max_marks: '100' })
  const [markForm, setMarkForm] = useState({ final_exam_id: '', student_id: '', marks_obtained: '' })

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    const [mRes, eRes, sRes, dRes, cwRes] = await Promise.all([
      supabase.from('education_modules').select('id, module_code, module_name').eq('company_id', ctx.companyId).order('module_code'),
      supabase.from('final_exams').select('*, education_modules(module_code, module_name)').order('exam_date', { ascending: false }),
      supabase.from('students').select('id, student_id, full_name').eq('company_id', ctx.companyId),
      supabase.from('coursework_days').select('id, module_id'),
      supabase.from('student_grades_coursework').select('student_id, coursework_day_id, marks_obtained'),
    ])
    setModules(mRes.data || [])
    setExams(eRes.data || [])
    setStudents(sRes.data || [])
    setCourseworkDays(dRes.data || [])
    setCourseworkMarks(cwRes.data || [])
  }

  useEffect(() => { loadData() }, [])

  const addExam = async () => {
    if (!form.module_id || !form.exam_date || !form.max_marks) return
    await supabase.from('final_exams').insert({ module_id: form.module_id, exam_date: form.exam_date, max_marks: Number(form.max_marks) })
    setForm({ module_id: '', exam_date: '', max_marks: '100' })
    await loadData()
  }

  const addExamMark = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId || !markForm.student_id || !markForm.final_exam_id || markForm.marks_obtained === '') return
    await supabase.from('student_grades_final_exam').insert({
      student_id: markForm.student_id,
      final_exam_id: markForm.final_exam_id,
      marks_obtained: Number(markForm.marks_obtained),
      recorded_by: userId,
    })
    setMarkForm({ final_exam_id: '', student_id: '', marks_obtained: '' })
  }

  const qualifiedStudents = useMemo(() => students.filter((student) => {
    const studentGrades = courseworkMarks.filter((row) => row.student_id === student.id)
    const misses = studentGrades.filter((row) => Number(row.marks_obtained) <= 0).length
    return misses < 3
  }), [students, courseworkMarks])

  return <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6"><h1 className="text-2xl font-bold">Exams</h1><Card className="p-4 space-y-3"><h2 className="font-semibold">Create final exam</h2><div className="grid md:grid-cols-3 gap-3"><select className="px-3 py-2 border rounded" value={form.module_id} onChange={e=>setForm({ ...form, module_id: e.target.value })}><option value="">Module</option>{modules.map((m:any)=><option key={m.id} value={m.id}>{m.module_code} - {m.module_name}</option>)}</select><Input type="date" value={form.exam_date} onChange={e=>setForm({ ...form, exam_date: e.target.value })} /><Input type="number" placeholder="Max marks" value={form.max_marks} onChange={e=>setForm({ ...form, max_marks: e.target.value })} /></div><Button onClick={addExam}>Add Exam</Button></Card><Card className="p-4 space-y-3"><h2 className="font-semibold">Record exam mark (qualified students)</h2><div className="grid md:grid-cols-3 gap-3"><select className="px-3 py-2 border rounded" value={markForm.final_exam_id} onChange={e=>setMarkForm({ ...markForm, final_exam_id: e.target.value })}><option value="">Exam</option>{exams.map((exam:any)=><option key={exam.id} value={exam.id}>{exam.education_modules?.module_code} - {exam.exam_date}</option>)}</select><select className="px-3 py-2 border rounded" value={markForm.student_id} onChange={e=>setMarkForm({ ...markForm, student_id: e.target.value })}><option value="">Student</option>{qualifiedStudents.map((student:any)=><option key={student.id} value={student.id}>{student.student_id} - {student.full_name}</option>)}</select><Input type="number" placeholder="Marks out of 100" value={markForm.marks_obtained} onChange={e=>setMarkForm({ ...markForm, marks_obtained: e.target.value })} /></div><Button onClick={addExamMark}>Save Result</Button></Card></div>
}
