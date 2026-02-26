'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'

const STATUS_OPTIONS = ['Pending', 'Active', 'Failed', 'Suspended', 'Deceased', 'Graduated']

export default function GradesPage() {
  const [rows, setRows] = useState<any[]>([])
  const [moduleTabs, setModuleTabs] = useState<any[]>([])

  const load = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return

    const [studentsRes, modulesRes, daysRes, cwGradesRes, examsRes, examGradesRes, enrollmentsRes] = await Promise.all([
      supabase.from('students').select('id, student_id, full_name, status').eq('company_id', ctx.companyId),
      supabase.from('education_modules').select('id, module_code, module_name').eq('company_id', ctx.companyId).order('module_code'),
      supabase.from('coursework_days').select('id, module_id'),
      supabase.from('student_grades_coursework').select('student_id, coursework_day_id, marks_obtained'),
      supabase.from('final_exams').select('id, module_id, exam_date').order('exam_date', { ascending: false }),
      supabase.from('student_grades_final_exam').select('student_id, final_exam_id, marks_obtained'),
      supabase.from('student_enrollments').select('student_id, module_id'),
    ])

    const students = studentsRes.data || []
    const modules = modulesRes.data || []
    const days = daysRes.data || []
    const cwGrades = cwGradesRes.data || []
    const exams = examsRes.data || []
    const examGrades = examGradesRes.data || []
    const enrollments = enrollmentsRes.data || []

    const report: any[] = []

    enrollments.forEach((enrollment) => {
      const student = students.find((item) => item.id === enrollment.student_id)
      const module = modules.find((item) => item.id === enrollment.module_id)
      if (!student || !module) return

      const moduleDays = days.filter((day) => day.module_id === module.id)
      const dayCount = moduleDays.length
      const benchmarkDays = Math.max(8, dayCount)
      const courseworkMax = benchmarkDays * 20

      const courseworkTotalRaw = cwGrades
        .filter((grade) => grade.student_id === student.id && moduleDays.some((day) => day.id === grade.coursework_day_id))
        .reduce((sum, row) => sum + Number(row.marks_obtained), 0)

      const coursework50 = Math.min((courseworkTotalRaw / (courseworkMax || 1)) * 50, 50)

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
        status: STATUS_OPTIONS.includes(student.status) ? student.status : 'Pending',
      })
    })

    setRows(report)
    setModuleTabs(modules)
  }

  useEffect(() => {
    load()
  }, [])

  const updateStatus = async (studentId: string, status: string) => {
    await supabase.from('students').update({ status }).eq('id', studentId)
    setRows((prev) => prev.map((row) => row.studentPk === studentId ? { ...row, status } : row))
  }

  const rowsByModule = useMemo(() => {
    const grouped: Record<string, any[]> = {}
    rows.forEach((row) => {
      if (!grouped[row.moduleId]) grouped[row.moduleId] = []
      grouped[row.moduleId].push(row)
    })
    return grouped
  }, [rows])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Grades</h1>
        <p className="text-muted-foreground">Per module progress: 50% coursework + 50% exam</p>
      </div>

      <Tabs defaultValue={moduleTabs[0]?.id} className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          {moduleTabs.map((module) => <TabsTrigger key={module.id} value={module.id}>{module.module_code}</TabsTrigger>)}
        </TabsList>

        {moduleTabs.map((module) => (
          <TabsContent key={module.id} value={module.id}>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">Student</th>
                    <th className="px-4 py-3 text-left">Student Number</th>
                    <th className="px-4 py-3 text-left">Module</th>
                    <th className="px-4 py-3 text-center">Coursework Raw</th>
                    <th className="px-4 py-3 text-center">Coursework (50%)</th>
                    <th className="px-4 py-3 text-center">Exam (50%)</th>
                    <th className="px-4 py-3 text-center">Total (100%)</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(rowsByModule[module.id] || []).map((row) => (
                    <tr key={`${row.studentPk}-${row.moduleId}`} className="border-b">
                      <td className="px-4 py-3">{row.studentName}</td>
                      <td className="px-4 py-3 font-mono">{row.studentID}</td>
                      <td className="px-4 py-3">{row.moduleTitle}</td>
                      <td className="px-4 py-3 text-center">{row.courseworkTotalRaw} / {row.courseworkMax}</td>
                      <td className="px-4 py-3 text-center">{row.coursework50.toFixed(1)}</td>
                      <td className="px-4 py-3 text-center">{row.exam50 === null ? '--' : row.exam50.toFixed(1)}</td>
                      <td className="px-4 py-3 text-center font-semibold">{row.total.toFixed(1)}</td>
                      <td className="px-4 py-3">
                        <select className="px-2 py-1 border rounded" value={row.status} onChange={(e) => updateStatus(row.studentPk, e.target.value)}>
                          {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {(rowsByModule[module.id] || []).length === 0 && <tr><td className="px-4 py-3 text-muted-foreground" colSpan={8}>No enrolled students for this module.</td></tr>}
                </tbody>
              </table>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
