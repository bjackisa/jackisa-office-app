'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { User } from 'lucide-react'

export default function CourseworkPage() {
  const [modules, setModules] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [days, setDays] = useState<any[]>([])
  const [grades, setGrades] = useState<any[]>([])
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [form, setForm] = useState({ module_id: '', student_id: '', day_number: '', marks_obtained: '' })

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    const [mRes, dRes, sRes, gRes, eRes] = await Promise.all([
      supabase.from('education_modules').select('id, module_code, module_name').eq('company_id', ctx.companyId).order('module_code'),
      supabase.from('coursework_days').select('id, module_id, day_number, title, max_marks, education_modules(module_name)').order('day_number'),
      supabase.from('students').select('id, full_name, student_id').eq('company_id', ctx.companyId),
      supabase.from('student_grades_coursework').select('id, student_id, coursework_day_id, marks_obtained, created_at').order('created_at', { ascending: false }),
      supabase.from('student_enrollments').select('*'),
    ])
    setModules(mRes.data || [])
    setDays(dRes.data || [])
    setStudents(sRes.data || [])
    setGrades(gRes.data || [])
    setEnrollments(eRes.data || [])
  }

  useEffect(() => { loadData() }, [])

  const saveCoursework = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId || !form.module_id || !form.student_id || !form.day_number || form.marks_obtained === '') return

    const dayNumber = Number(form.day_number)
    const marks = Number(form.marks_obtained)
    if (marks < 0 || marks > 20) return

    let courseworkDayId: string | null = null
    const existingDay = days.find((day) => day.module_id === form.module_id && Number(day.day_number) === dayNumber)

    if (existingDay) {
      courseworkDayId = existingDay.id
    } else {
      const { data: createdDay } = await supabase.from('coursework_days').insert({
        module_id: form.module_id,
        day_number: dayNumber,
        title: `Day ${dayNumber}`,
        max_marks: 20,
      }).select('id').single()
      courseworkDayId = createdDay?.id || null
    }

    if (!courseworkDayId) return

    await supabase.from('student_grades_coursework').upsert({
      student_id: form.student_id,
      coursework_day_id: courseworkDayId,
      marks_obtained: marks,
      recorded_by: userId,
    })

    setForm({ module_id: '', student_id: '', day_number: '', marks_obtained: '' })
    await loadData()
  }

  const qualifiedStudents = useMemo(() => {
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

  const courseworkRows = useMemo(() => grades.map((grade) => {
    const student = students.find((s) => s.id === grade.student_id)
    const day = days.find((d) => d.id === grade.coursework_day_id)
    const module = modules.find((m) => m.id === day?.module_id)
    return {
      id: grade.id,
      studentName: student?.full_name || 'Unknown',
      studentId: student?.student_id || '-',
      courseworkName: day?.title || `Day ${day?.day_number || '-'}`,
      moduleName: module?.module_name || day?.education_modules?.module_name || '-',
      marks: Number(grade.marks_obtained),
    }
  }), [grades, students, days, modules])

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Coursework</h1>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Add coursework mark</h2>
        <div className="grid md:grid-cols-4 gap-3">
          <select className="px-3 py-2 border rounded" value={form.module_id} onChange={e => setForm({ ...form, module_id: e.target.value })}>
            <option value="">Module</option>
            {modules.map((module: any) => <option key={module.id} value={module.id}>{module.module_code} - {module.module_name}</option>)}
          </select>
          <select className="px-3 py-2 border rounded" value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })}>
            <option value="">Student</option>
            {students.map((student: any) => <option key={student.id} value={student.id}>{student.student_id} - {student.full_name}</option>)}
          </select>
          <Input type="number" min={1} placeholder="Coursework day number" value={form.day_number} onChange={e => setForm({ ...form, day_number: e.target.value })} />
          <Input type="number" min={0} max={20} placeholder="Marks (out of 20)" value={form.marks_obtained} onChange={e => setForm({ ...form, marks_obtained: e.target.value })} />
        </div>
        <Button onClick={saveCoursework}>Save Coursework</Button>
      </Card>

      <Tabs defaultValue="coursework" className="space-y-4">
        <TabsList>
          <TabsTrigger value="coursework">Coursework table</TabsTrigger>
          <TabsTrigger value="qualified">Qualified students</TabsTrigger>
        </TabsList>

        <TabsContent value="coursework">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Student</th>
                  <th className="px-4 py-3 text-left">Student Number</th>
                  <th className="px-4 py-3 text-left">Coursework</th>
                  <th className="px-4 py-3 text-left">Module</th>
                  <th className="px-4 py-3 text-center">Marks (20)</th>
                </tr>
              </thead>
              <tbody>
                {courseworkRows.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="px-4 py-3">{row.studentName}</td>
                    <td className="px-4 py-3 font-mono">{row.studentId}</td>
                    <td className="px-4 py-3">{row.courseworkName}</td>
                    <td className="px-4 py-3">{row.moduleName}</td>
                    <td className="px-4 py-3 text-center">{row.marks}</td>
                  </tr>
                ))}
                {courseworkRows.length === 0 && <tr><td className="px-4 py-3 text-muted-foreground" colSpan={5}>No coursework recorded yet.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="qualified">
          <Card className="p-4 space-y-3">
            {qualifiedStudents.length === 0 && <p className="text-sm text-muted-foreground">No qualified students yet.</p>}
            {qualifiedStudents.map((student: any) => (
              <div key={student.id} className="flex items-center gap-3 border rounded-lg px-3 py-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">{student.full_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{student.student_id}</p>
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
