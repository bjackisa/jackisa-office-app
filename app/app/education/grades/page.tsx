'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'

const STATUS_OPTIONS = ['Pending', 'Active', 'Failed', 'Suspended', 'Deceased', 'Graduated']

export default function GradesPage() {
  const [rows, setRows] = useState<any[]>([])

  const load = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return

    const [studentsRes, modulesRes, daysRes, cwGradesRes, examsRes, examGradesRes] = await Promise.all([
      supabase.from('students').select('id, student_id, full_name').eq('company_id', ctx.companyId),
      supabase.from('education_modules').select('id, module_code, module_name').eq('company_id', ctx.companyId).order('module_code'),
      supabase.from('coursework_days').select('id, module_id, max_marks'),
      supabase.from('student_grades_coursework').select('student_id, coursework_day_id, marks_obtained'),
      supabase.from('final_exams').select('id, module_id, exam_date').order('exam_date', { ascending: false }),
      supabase.from('student_grades_final_exam').select('student_id, final_exam_id, marks_obtained'),
    ])

    const students = studentsRes.data || []
    const modules = modulesRes.data || []
    const days = daysRes.data || []
    const cwGrades = cwGradesRes.data || []
    const exams = examsRes.data || []
    const examGrades = examGradesRes.data || []
    const studentIds = students.map((student) => student.id)
    const moduleIds = modules.map((module) => module.id)

    const { data: enrollmentsData } = studentIds.length
      ? await (async () => {
          const scoped = await supabase
            .from('student_enrollments')
            .select('student_id, module_id')
            .in('student_id', studentIds)
            .eq('company_id', ctx.companyId)

          if (!scoped.error) return scoped

          return supabase
            .from('student_enrollments')
            .select('student_id, module_id')
            .in('student_id', studentIds)
        })()
      : { data: [] as any[] }

    const enrollments = (enrollmentsData || []).filter((enrollment) => moduleIds.includes(enrollment.module_id))

    const report: any[] = []

    enrollments.forEach((enrollment) => {
      const student = students.find((item) => item.id === enrollment.student_id)
      const module = modules.find((item) => item.id === enrollment.module_id)
      if (!student || !module) return

      const moduleDays = days.filter((day) => day.module_id === module.id)
      const moduleDaysById = new Map(moduleDays.map((day) => [day.id, day]))
      const courseworkRows = cwGrades.filter(
        (grade) => grade.student_id === student.id && moduleDaysById.has(grade.coursework_day_id),
      )
      const courseworkTotalRaw = courseworkRows.reduce((sum, row) => sum + Number(row.marks_obtained || 0), 0)
      const courseworkMax = courseworkRows.reduce((sum, row) => {
        const day = moduleDaysById.get(row.coursework_day_id)
        return sum + Number(day?.max_marks || 20)
      }, 0)

      const coursework50 = courseworkMax > 0 ? Math.min((courseworkTotalRaw / courseworkMax) * 50, 50) : 0

      const moduleExamIds = exams.filter((exam) => exam.module_id === module.id).map((exam) => exam.id)
      const examRow = examGrades.find((grade) => grade.student_id === student.id && moduleExamIds.includes(grade.final_exam_id))
      const examMarks = examRow ? Number(examRow.marks_obtained) : null
      const exam50 = examMarks === null ? null : (examMarks / 100) * 50

      report.push({
        studentPk: student.id,
        studentName: student.full_name,
        studentID: student.student_id,
        moduleId: module.id,
        moduleCode: module.module_code,
        moduleTitle: module.module_name,
        courseworkTotalRaw,
        courseworkMax,
        coursework50,
        examMarks,
        exam50,
        total: coursework50 + (exam50 || 0),
        status: 'Active',
      })
    })

    setRows(report)
  }

  useEffect(() => {
    load()
  }, [])

  const updateStatus = async (studentId: string, status: string) => {
    await supabase.from('students').update({ status }).eq('id', studentId)
    setRows((prev) => prev.map((row) => row.studentPk === studentId ? { ...row, status } : row))
  }

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.moduleCode === b.moduleCode) {
        return a.studentName.localeCompare(b.studentName)
      }

      return a.moduleCode.localeCompare(b.moduleCode)
    })
  }, [rows])

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Grades</h1>
        <p className="text-sm text-muted-foreground mt-0.5">50% coursework + 50% exam</p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="premium-table">
          <thead>
            <tr>
              <th>Module</th>
              <th>Student</th>
              <th>Student Number</th>
              <th className="text-center">Coursework Raw</th>
              <th className="text-center">Coursework (50%)</th>
              <th className="text-center">Exam (50%)</th>
              <th className="text-center">Overall Grade</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={`${row.studentPk}-${row.moduleId}`} >
                <td>
                  <div className="font-medium">{row.moduleCode}</div>
                  <div className="text-xs text-muted-foreground">{row.moduleTitle}</div>
                </td>
                <td>{row.studentName}</td>
                <td className="font-mono text-xs text-muted-foreground">{row.studentID}</td>
                <td className="text-center tabular-nums">{row.courseworkTotalRaw} / {row.courseworkMax}</td>
                <td className="text-center tabular-nums">{row.coursework50.toFixed(1)}</td>
                <td className="text-center tabular-nums">{row.exam50 === null ? '--' : row.exam50.toFixed(1)}</td>
                <td className="text-center font-bold tabular-nums">{row.total.toFixed(1)} / 100</td>
                <td>
                  <select className="form-select !py-1 !px-2 !text-xs" value={row.status} onChange={(e) => updateStatus(row.studentPk, e.target.value)}>
                    {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {sortedRows.length === 0 && <tr><td className="!py-12 text-center text-muted-foreground/60" colSpan={8}>No enrolled students found.</td></tr>}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  )
}
