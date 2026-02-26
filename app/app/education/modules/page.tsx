'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Calendar, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { calculateEightWorkingWeekEndDate } from '@/lib/education'

export default function ModulesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [modules, setModules] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [schedules, setSchedules] = useState<any[]>([])
  const [form, setForm] = useState({ module_name: '', instructor_id: '', opening_date: '' })

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId || !ctx.userId) return
    setCompanyId(ctx.companyId)
    setUserId(ctx.userId)

    const [mRes, eRes, enRes, schRes] = await Promise.all([
      supabase.from('education_modules').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false }),
      supabase.from('company_employees').select('id, users(full_name)').eq('company_id', ctx.companyId).eq('status', 'active'),
      supabase.from('student_enrollments').select('id, student_id, module_id'),
      supabase.from('lecture_schedules').select('id, module_id, instructor_id, company_employees(users(full_name))').eq('company_id', ctx.companyId),
    ])

    setModules(mRes.data || [])
    setEmployees(eRes.data || [])
    setEnrollments(enRes.data || [])
    setSchedules(schRes.data || [])
  }

  useEffect(() => { loadData() }, [])

  const createModule = async () => {
    if (!companyId || !userId || !form.module_name || !form.opening_date) return
    const moduleCode = `MOD-${new Date().getFullYear()}-${String(modules.length + 1).padStart(4, '0')}`
    const classLabel = new Date(`${form.opening_date}T00:00:00`).toLocaleString(undefined, { month: 'short', year: 'numeric' })
    const endDate = calculateEightWorkingWeekEndDate(form.opening_date)

    const { data: created } = await supabase
      .from('education_modules')
      .insert({
        company_id: companyId,
        module_code: moduleCode,
        module_name: form.module_name,
        created_by: userId,
        description: `Class of ${classLabel} | Runs ${form.opening_date} to ${endDate}`,
      })
      .select('id')
      .single()

    if (created?.id && form.instructor_id) {
      await supabase.from('lecture_schedules').insert({
        company_id: companyId,
        module_id: created.id,
        instructor_id: form.instructor_id,
        day_name: 'Monday',
        start_time: '09:00',
        end_time: '11:00',
        room_location: 'TBD',
      })
    }

    setForm({ module_name: '', instructor_id: '', opening_date: '' })
    await loadData()
  }

  const studentCount = (moduleId: string) => enrollments.filter((e) => e.module_id === moduleId).length
  const instructorName = (moduleId: string) => schedules.find((s) => s.module_id === moduleId)?.company_employees?.users?.full_name || 'Unassigned'

  const totalStudents = useMemo(() => modules.reduce((sum, module) => sum + studentCount(module.id), 0), [modules, enrollments])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Module Management</h1>
          <p className="text-muted-foreground">Add modules, auto-generate codes, assign instructors, and track student load</p>
        </div>
      </div>

      <Card className="p-4 border border-border space-y-3">
        <h2 className="font-semibold">Create module</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <Input placeholder="Module name" value={form.module_name} onChange={(e) => setForm({ ...form, module_name: e.target.value })} />
          <select className="px-3 py-2 border border-border rounded-md text-sm" value={form.instructor_id} onChange={(e) => setForm({ ...form, instructor_id: e.target.value })}>
            <option value="">Instructor (optional)</option>
            {employees.map((employee: any) => <option key={employee.id} value={employee.id}>{employee.users?.full_name}</option>)}
          </select>
          <Input type="date" value={form.opening_date} onChange={(e) => setForm({ ...form, opening_date: e.target.value })} />
        </div>
        <Button onClick={createModule}><Plus className="w-4 h-4 mr-2" />New Module</Button>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border border-border"><p className="text-sm text-muted-foreground">Total Modules</p><p className="text-2xl font-bold">{modules.length}</p></Card>
        <Card className="p-4 border border-border"><p className="text-sm text-muted-foreground">Total Students in Modules</p><p className="text-2xl font-bold">{totalStudents}</p></Card>
        <Card className="p-4 border border-border"><p className="text-sm text-muted-foreground">Credit Units</p><p className="text-2xl font-bold">N/A</p></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {modules.map((module) => {
          const run = module.description?.match(/Runs\s(\d{4}-\d{2}-\d{2})\sto\s(\d{4}-\d{2}-\d{2})/)
          return (
            <Card key={module.id} className="p-6 border border-border">
              <p className="text-sm font-mono text-muted-foreground mb-1">{module.module_code}</p>
              <h3 className="text-lg font-semibold text-foreground">{module.module_name}</h3>
              <div className="space-y-2 mt-4 text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">Instructor:</span> {instructorName(module.id)}</p>
                <p className="flex items-center gap-2"><Users className="w-4 h-4" /> {studentCount(module.id)} Students</p>
                {run && <p className="flex items-center gap-2"><Calendar className="w-4 h-4" /> {run[1]} - {run[2]} (8 working weeks)</p>}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
