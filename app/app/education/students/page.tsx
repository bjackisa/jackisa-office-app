'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronDown, Plus, Search } from 'lucide-react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'

export default function StudentsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [students, setStudents] = useState<any[]>([])
  const [modules, setModules] = useState<any[]>([])
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [statuses, setStatuses] = useState<Record<string, string>>({})
  const [moduleSearch, setModuleSearch] = useState('')
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

  const generateStudentNumber = async () => {
    let candidate = ''
    let isUnique = false

    while (!isUnique) {
      const buffer = new Uint32Array(2)
      crypto.getRandomValues(buffer)
      const randomPart = Array.from(buffer)
        .map((chunk) => chunk.toString(36).toUpperCase())
        .join('')
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8)
        .padEnd(8, '0')

      candidate = `S-${randomPart}`

      const { data: existing } = await supabase
        .from('students')
        .select('id')
        .eq('company_id', companyId)
        .eq('student_id', candidate)
        .maybeSingle()

      isUnique = !existing
    }

    return candidate
  }

  const addStudent = async () => {
    if (!companyId || !form.full_name) return

    const studentNumber = await generateStudentNumber()

    const { data: created } = await supabase
      .from('students')
      .insert({ company_id: companyId, student_id: studentNumber, full_name: form.full_name, email: form.email || null })
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

  const filteredModules = useMemo(() => {
    const searchTerm = moduleSearch.trim().toLowerCase()
    if (!searchTerm) return modules

    return modules.filter((module) =>
      `${module.module_code} ${module.module_name}`.toLowerCase().includes(searchTerm),
    )
  }, [modules, moduleSearch])

  const toggleModule = (moduleId: string) => {
    setForm((prev) => ({
      ...prev,
      module_ids: prev.module_ids.includes(moduleId)
        ? prev.module_ids.filter((id) => id !== moduleId)
        : [...prev.module_ids, moduleId],
    }))
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Student Management</h1>
        <p className="text-muted-foreground">Add non-user students and enroll them in one or many modules</p>
      </div>

      <Card className="p-4 border border-border space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <Input placeholder="Student full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input placeholder="Student email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>

        <div className="rounded-lg border p-3 space-y-3">
          <div>
            <p className="font-medium text-sm">Enroll in modules</p>
            <p className="text-xs text-muted-foreground">Open the dropdown and tick one or many modules for this student.</p>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="truncate text-left">
                  {form.module_ids.length === 0
                    ? 'Select modules'
                    : `${form.module_ids.length} module${form.module_ids.length > 1 ? 's' : ''} selected`}
                </span>
                <ChevronDown className="w-4 h-4 opacity-70" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(90vw,420px)] p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setForm((prev) => ({ ...prev, module_ids: modules.map((module) => module.id) }))}>Select all</Button>
                <Button variant="ghost" size="sm" onClick={() => setForm((prev) => ({ ...prev, module_ids: [] }))}>Clear</Button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search modules by code or name" value={moduleSearch} onChange={(e) => setModuleSearch(e.target.value)} />
              </div>

              <div className="max-h-52 overflow-y-auto border rounded-md divide-y">
                {filteredModules.map((module) => {
                  const checked = form.module_ids.includes(module.id)
                  return (
                    <div key={module.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors">
                      <Checkbox id={`module-${module.id}`} checked={checked} onCheckedChange={() => toggleModule(module.id)} />
                      <Label htmlFor={`module-${module.id}`} className="flex-1 cursor-pointer">
                        <p className="font-medium text-sm">{module.module_code}</p>
                        <p className="text-xs text-muted-foreground">{module.module_name}</p>
                      </Label>
                    </div>
                  )
                })}
                {filteredModules.length === 0 && (
                  <p className="px-3 py-4 text-sm text-muted-foreground">No modules match your search.</p>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex flex-wrap gap-2">
            {form.module_ids.length === 0 && <p className="text-xs text-muted-foreground">No modules selected yet.</p>}
            {form.module_ids.map((moduleId) => {
              const module = modules.find((item) => item.id === moduleId)
              if (!module) return null
              return <Badge key={moduleId} variant="secondary">{module.module_code}</Badge>
            })}
          </div>
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
