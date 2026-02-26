'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { gradeFromScore } from '@/lib/education'

export default function GradesPage() {
  const [rows, setRows] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      const ctx = await getSessionContext()
      if (!ctx?.companyId) return

      const [studentsRes, modulesRes, daysRes, cwGradesRes, examsRes, examGradesRes, enrollmentsRes] = await Promise.all([
        supabase.from('students').select('id, student_id, full_name').eq('company_id', ctx.companyId),
        supabase.from('education_modules').select('id, module_code, module_name, description').eq('company_id', ctx.companyId),
        supabase.from('coursework_days').select('id, module_id, max_marks'),
        supabase.from('student_grades_coursework').select('student_id, coursework_day_id, marks_obtained'),
        supabase.from('final_exams').select('id, module_id, exam_date, max_marks'),
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
        const moduleCoursework = cwGrades.filter((grade) => grade.student_id === student.id && moduleDays.some((day) => day.id === grade.coursework_day_id))
        const cwTotal = moduleCoursework.reduce((sum, row) => sum + Number(row.marks_obtained), 0)
        const cwMax = moduleDays.reduce((sum, row) => sum + Number(row.max_marks), 0) || 1
        const coursework50 = (cwTotal / cwMax) * 50

        const moduleExam = exams.find((exam) => exam.module_id === module.id)
        const examScore = moduleExam ? examGrades.find((grade) => grade.student_id === student.id && grade.final_exam_id === moduleExam.id) : null
        const exam50 = examScore ? (Number(examScore.marks_obtained) / (Number(moduleExam?.max_marks || 100) || 100)) * 50 : null

        const finalScore = exam50 === null ? coursework50 : coursework50 + exam50
        const status = exam50 === null ? 'pending' : finalScore >= 75 ? 'graduated' : 'failed'

        report.push({
          studentName: student.full_name,
          studentID: student.student_id,
          moduleCode: module.module_code,
          moduleTitle: module.module_name,
          classLabel: module.description?.split('|')[0]?.replace('Class of ', '').trim() || 'General',
          coursework: coursework50,
          exam: exam50,
          finalScore,
          grade: gradeFromScore(finalScore),
          status,
        })
      })

      setRows(report)
    }

    load()
  }, [])

  const average = useMemo(() => rows.length ? rows.reduce((sum, row) => sum + row.finalScore, 0) / rows.length : 0, [rows])

  const exportCSV = () => {
    const header = 'Student ID,Student Name,Class,Module,Coursework(50),Exam(50),Final Score,Grade,Status\n'
    const body = rows.map((row) => `${row.studentID},${row.studentName},${row.classLabel},${row.moduleCode},${row.coursework.toFixed(2)},${row.exam === null ? 'Pending' : row.exam.toFixed(2)},${row.finalScore.toFixed(2)},${row.grade},${row.status}`).join('\n')
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'final-grades.csv'
    link.click()
  }

  const exportXLSX = () => {
    const tableRows = rows.map((row) => `<tr><td>${row.studentID}</td><td>${row.studentName}</td><td>${row.classLabel}</td><td>${row.moduleCode}</td><td>${row.coursework.toFixed(2)}</td><td>${row.exam === null ? 'Pending' : row.exam.toFixed(2)}</td><td>${row.finalScore.toFixed(2)}</td><td>${row.grade}</td><td>${row.status}</td></tr>`).join('')
    const html = `<table><tr><th>Student ID</th><th>Student Name</th><th>Class</th><th>Module</th><th>Coursework(50)</th><th>Exam(50)</th><th>Final Score</th><th>Grade</th><th>Status</th></tr>${tableRows}</table>`
    const blob = new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'final-grades.xlsx'
    link.click()
  }

  return <div className="p-6 max-w-7xl mx-auto space-y-6"><div className="flex items-center justify-between"><div><h1 className="text-3xl font-bold">Final Grades</h1><p className="text-muted-foreground">Final score = 50% coursework + 50% exam</p></div><div className="flex gap-2"><Button variant="outline" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />Export CSV</Button><Button onClick={exportXLSX}><Download className="w-4 h-4 mr-2" />Export XLSX</Button></div></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><Card className="p-4"><p>Total Results</p><p className="text-2xl font-bold">{rows.length}</p></Card><Card className="p-4"><p>Pending Results</p><p className="text-2xl font-bold">{rows.filter((row) => row.status === 'pending').length}</p></Card><Card className="p-4"><p>Average Score</p><p className="text-2xl font-bold">{average.toFixed(1)}%</p></Card></div><Card className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 border-b"><tr><th className="px-4 py-3 text-left">Student</th><th className="px-4 py-3 text-left">Class</th><th className="px-4 py-3 text-left">Module</th><th className="px-4 py-3 text-center">Coursework</th><th className="px-4 py-3 text-center">Exam</th><th className="px-4 py-3 text-center">Final</th><th className="px-4 py-3 text-center">Grade</th><th className="px-4 py-3 text-left">Status</th></tr></thead><tbody>{rows.map((row, i) => <tr key={`${row.studentID}-${row.moduleCode}-${i}`} className="border-b"><td className="px-4 py-3">{row.studentName}<div className="text-xs text-muted-foreground font-mono">{row.studentID}</div></td><td className="px-4 py-3">{row.classLabel}</td><td className="px-4 py-3">{row.moduleCode} - {row.moduleTitle}</td><td className="px-4 py-3 text-center">{row.coursework.toFixed(1)}</td><td className="px-4 py-3 text-center">{row.exam === null ? 'Pending' : row.exam.toFixed(1)}</td><td className="px-4 py-3 text-center font-semibold">{row.finalScore.toFixed(1)}</td><td className="px-4 py-3 text-center">{row.grade}</td><td className="px-4 py-3 capitalize">{row.status}</td></tr>)}</tbody></table></Card></div>
}
