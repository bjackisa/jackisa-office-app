'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BookOpen, Users, FileText, TrendingUp } from 'lucide-react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'

export default function EducationDashboard() {
  const [loading, setLoading] = useState(true)
  const [modules, setModules] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [cw, setCw] = useState<any[]>([])
  const [exams, setExams] = useState<any[]>([])
  const [schedules, setSchedules] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      const ctx = await getSessionContext()
      if (!ctx?.companyId) return

      const [mRes, sRes, cRes, eRes, schRes] = await Promise.all([
        supabase.from('education_modules').select('id, module_code, module_name').eq('company_id', ctx.companyId),
        supabase.from('students').select('id').eq('company_id', ctx.companyId),
        supabase.from('student_grades_coursework').select('id, marks_obtained'),
        supabase.from('student_grades_final_exam').select('id, marks_obtained'),
        supabase
          .from('lecture_schedules')
          .select('id, day_name, start_time, education_modules(module_code, module_name)')
          .eq('company_id', ctx.companyId)
          .limit(6),
      ])

      setModules(mRes.data || [])
      setStudents(sRes.data || [])
      setCw(cRes.data || [])
      setExams(eRes.data || [])
      setSchedules(schRes.data || [])
      setLoading(false)
    }

    load()
  }, [])

  const average = useMemo(() => {
    const courseworkAvg = cw.length ? cw.reduce((a, b) => a + Number(b.marks_obtained || 0), 0) / cw.length : 0
    const examAvg = exams.length ? exams.reduce((a, b) => a + Number(b.marks_obtained || 0), 0) / exams.length : 0
    return ((courseworkAvg * 0.5) + (examAvg * 0.5)).toFixed(1)
  }, [cw, exams])

  const stats = [
    { label: 'Total Modules', value: modules.length, subtext: 'Company modules', icon: BookOpen, color: 'bg-indigo-500' },
    { label: 'Total Students', value: students.length, subtext: 'Company students', icon: Users, color: 'bg-cyan-500' },
    { label: 'Pending Results', value: Math.max(students.length - exams.length, 0), subtext: 'Awaiting final exam scores', icon: FileText, color: 'bg-yellow-500' },
    { label: 'Average Grade', value: `${average}%`, subtext: 'Coursework + exam average', icon: TrendingUp, color: 'bg-emerald-500' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Education Management</h1>
        <p className="text-muted-foreground">Live company education performance and actions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="p-6 border border-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold text-foreground">{loading ? '...' : stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-2">{stat.subtext}</p>
                </div>
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Button className="w-full justify-start" asChild variant="outline"><Link href="/app/education/modules">+ Create Module</Link></Button>
            <Button className="w-full justify-start" asChild variant="outline"><Link href="/app/education/students">+ Add Students</Link></Button>
            <Button className="w-full justify-start" asChild variant="outline"><Link href="/app/education/grades">+ Review Final Grades</Link></Button>
            <Button className="w-full justify-start" asChild variant="outline"><Link href="/app/education/schedules">+ Schedule Lectures</Link></Button>
          </div>
        </Card>

        <Card className="p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Upcoming Schedules</h2>
          <div className="space-y-3">
            {schedules.length === 0 ? <p className="text-sm text-muted-foreground">No schedules yet.</p> : schedules.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between pb-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.education_modules?.module_code} · {item.education_modules?.module_name}</p>
                  <p className="text-xs text-muted-foreground">{item.day_name} {item.start_time}</p>
                </div>
                <p className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">Scheduled</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
