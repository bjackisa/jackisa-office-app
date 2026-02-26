'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus } from 'lucide-react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'

export default function StudentsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [students, setStudents] = useState<any[]>([])
  const [modules, setModules] = useState<any[]>([])
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [statuses, setStatuses] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ full_name: '', email: '', module_ids: [] as string[] })

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    setCompanyId(ctx.companyId)

    const [sRes, mRes, eRes, cwRes] = await Promise.all([
      supabase.from('students').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false }),
      supabase.from('education_modules').select('id, module_code, module_name').eq('company_id', ctx.companyId).order('module_code'),
      supabase.from('student_enrollments').select('id, student_id, module_id, enrolled_at'),
      supabase.from('student_grades_coursework').select('student_id'),
    ])

    setStudents(sRes.data || [])
    setModules(mRes.data || [])
    setEnrollments(eRes.data || [])

    const autoStatuses: Record<string, string> = {}
    ;(sRes.data || []).forEach((student: any) => {
      const hasCoursework = (cwRes.data || []).some((g: any) => g.student_id === student.id)
      autoStatuses[student.id] = hasCoursework ? 'Active' : 'Pending'
    })
    setStatuses(autoStatuses)
  }

  useEffect(() => { loadData() }, [])

  const generateStudentNumber = () => `STU-${String(students.length + 1).padStart(5, '0')}`

  const addStudent = async () => {
    if (!companyId || !form.full_name) return

    const { data: created } = await supabase
      .from('students')
      .insert({ company_id: companyId, student_id: generateStudentNumber(), full_name: form.full_name, email: form.email || null })
      .select('id')
      .single()

    if (created?.id && form.module_ids.length > 0) {
      await supabase.from('student_enrollments').insert(form.module_ids.map((moduleId) => ({ student_id: created.id, module_id: moduleId })))
    }

    setForm({ full_name: '', email: '', module_ids: [] })
    await loadData()
  }

  const updateStatus = (studentId: string, status: string) => {
    setStatuses((prev) => ({ ...prev, [studentId]: status }))
  }

  const moduleLabel = (studentId: string) => {
    const ids = enrollments.filter((e) => e.student_id === studentId).map((e) => e.module_id)
    return modules.filter((module) => ids.includes(module.id)).map((module) => module.module_code).join(', ') || 'None'
  }

  const stats = useMemo(() => ({
    total: students.length,
    active: Object.values(statuses).filter((status) => status === 'Active').length,
    suspended: Object.values(statuses).filter((status) => status === 'Suspended').length,
    graduated: Object.values(statuses).filter((status) => status === 'Graduated').length,
  }), [students, statuses])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Student Management</h1>
        <p className="text-muted-foreground">Add non-user students and enroll them in one or many modules</p>
      </div>

      <Card className="p-4 border border-border space-y-3">
        <div className="grid md:grid-cols-3 gap-3">
          <Input placeholder="Student full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input placeholder="Student email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select multiple className="px-3 py-2 border border-border rounded-md text-sm min-h-[96px]" value={form.module_ids} onChange={(e) => setForm({ ...form, module_ids: Array.from(e.target.selectedOptions, (option) => option.value) })}>
            {modules.map((module) => <option key={module.id} value={module.id}>{module.module_code} - {module.module_name}</option>)}
          </select>
        </div>
        <Button onClick={addStudent}><Plus className="w-4 h-4 mr-2" />Enroll Student</Button>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4"><p>Total Students</p><p className="text-2xl font-bold">{stats.total}</p></Card>
        <Card className="p-4"><p>Active</p><p className="text-2xl font-bold">{stats.active}</p></Card>
        <Card className="p-4"><p>Suspended</p><p className="text-2xl font-bold">{stats.suspended}</p></Card>
        <Card className="p-4"><p>Graduated</p><p className="text-2xl font-bold">{stats.graduated}</p></Card>
      </div>

      <Card className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Student Number</th>
              <th className="px-4 py-3 text-left">Modules</th>
              <th className="px-4 py-3 text-left">Enrollment Date</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} className="border-b">
                <td className="px-4 py-3">{student.full_name}</td>
                <td className="px-4 py-3 font-mono">{student.student_id || 'Auto'}</td>
                <td className="px-4 py-3">{moduleLabel(student.id)}</td>
                <td className="px-4 py-3">{new Date(student.created_at).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <select className="px-2 py-1 border rounded" value={statuses[student.id] || 'Pending'} onChange={(e) => updateStatus(student.id, e.target.value)}>
                    {['Pending', 'Active', 'Failed', 'Suspended', 'Deceased', 'Graduated'].map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
