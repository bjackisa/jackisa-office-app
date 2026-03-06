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
  const [examGrades, setExamGrades] = useState<any[]>([])
  const [courseworkMarks, setCourseworkMarks] = useState<any[]>([])
  const [form, setForm] = useState({ module_id: '', student_id: '', exam_date: '', marks_obtained: '' })

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    const [mRes, eRes, sRes , cwRes, egRes] = await Promise.all([
      supabase.from('education_modules').select('id, module_code, module_name').eq('company_id', ctx.companyId).order('module_code'),
      supabase.from('final_exams').select('id, module_id, exam_date').order('exam_date', { ascending: false }),
      supabase.from('students').select('id, student_id, full_name').eq('company_id', ctx.companyId),
      supabase.from('student_grades_coursework').select('student_id, coursework_day_id, marks_obtained'),
      supabase.from('student_grades_final_exam').select('id, student_id, final_exam_id, marks_obtained, created_at').order('created_at', { ascending: false }),
    ])
    setModules(mRes.data || [])
    setExams(eRes.data || [])
    setStudents(sRes.data || [])
    setCourseworkMarks(cwRes.data || [])
    setExamGrades(egRes.data || [])
  }

  useEffect(() => { loadData() }, [])

  const qualifiedStudents = useMemo(() => students.filter((student) => {
    const studentGrades = courseworkMarks.filter((row) => row.student_id === student.id)
    const misses = studentGrades.filter((row) => Number(row.marks_obtained) <= 0).length
    return misses < 3
  }), [students, courseworkMarks])

  const addExamResult = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId || !form.module_id || !form.student_id || !form.exam_date || form.marks_obtained === '') return

    let finalExamId: string | null = exams.find((exam) => exam.module_id === form.module_id && exam.exam_date === form.exam_date)?.id || null
    if (!finalExamId) {
      const { data: createdExam } = await supabase.from('final_exams').insert({ module_id: form.module_id, exam_date: form.exam_date, max_marks: 100 }).select('id').single()
      finalExamId = createdExam?.id || null
    }
    if (!finalExamId) return

    await supabase.from('student_grades_final_exam').upsert({
      student_id: form.student_id,
      final_exam_id: finalExamId,
      marks_obtained: Number(form.marks_obtained),
      recorded_by: userId,
    })

    setForm({ module_id: '', student_id: '', exam_date: '', marks_obtained: '' })
    await loadData()
  }

  const examRows = useMemo(() => examGrades.map((row) => {
    const student = students.find((s) => s.id === row.student_id)
    const exam = exams.find((e) => e.id === row.final_exam_id)
    const module = modules.find((m) => m.id === exam?.module_id)
    return {
      id: row.id,
      studentName: student?.full_name || 'Unknown',
      studentNumber: student?.student_id || '-',
      moduleName: module?.module_name || '-',
      examDate: exam?.exam_date || '-',
      marks: Number(row.marks_obtained),
    }
  }), [examGrades, students, exams, modules])

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Exams</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Record final exam results</p>
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02] space-y-3">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add Exam Result</h3>
            <p className="text-[11px] text-muted-foreground/60">Record marks for a qualified student</p>
          </div>
        </div>
        <div className="grid md:grid-cols-4 gap-3">
          <select className="form-select" value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })}>
            <option value="">Qualified student</option>
            {qualifiedStudents.map((student: any) => <option key={student.id} value={student.id}>{student.student_id} - {student.full_name}</option>)}
          </select>
          <select className="form-select" value={form.module_id} onChange={e => setForm({ ...form, module_id: e.target.value })}>
            <option value="">Module</option>
            {modules.map((module: any) => <option key={module.id} value={module.id}>{module.module_name}</option>)}
          </select>
          <Input type="date" value={form.exam_date} onChange={e => setForm({ ...form, exam_date: e.target.value })} />
          <Input type="number" min={0} max={100} placeholder="Exam marks (100%)" value={form.marks_obtained} onChange={e => setForm({ ...form, marks_obtained: e.target.value })} />
        </div>
        <div className="pt-3 border-t border-border/30">
          <Button size="sm" onClick={addExamResult}>Save Exam Result</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="premium-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Student Number</th>
              <th>Module</th>
              <th>Date</th>
              <th className="text-center">Exam Marks (100%)</th>
            </tr>
          </thead>
          <tbody>
            {examRows.map((row) => (
              <tr key={row.id} >
                <td>{row.studentName}</td>
                <td className="font-mono text-xs text-muted-foreground">{row.studentNumber}</td>
                <td>{row.moduleName}</td>
                <td>{row.examDate}</td>
                <td className="text-center font-bold tabular-nums">{row.marks}%</td>
              </tr>
            ))}
            {examRows.length === 0 && <tr><td className="!py-12 text-center text-muted-foreground/60" colSpan={5}>No exam results recorded yet.</td></tr>}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  )
}
