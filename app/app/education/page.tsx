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
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Education Management</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Live company education performance and actions</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger-children">
        {[
          { label: 'Modules', value: loading ? '...' : modules.length, icon: BookOpen, gradient: 'from-indigo-500 to-indigo-600' },
          { label: 'Students', value: loading ? '...' : students.length, icon: Users, gradient: 'from-cyan-500 to-blue-500' },
          { label: 'Pending Results', value: loading ? '...' : Math.max(students.length - exams.length, 0), icon: FileText, gradient: 'from-amber-500 to-orange-500' },
          { label: 'Average Grade', value: loading ? '...' : `${average}%`, icon: TrendingUp, gradient: 'from-emerald-500 to-green-600' },
        ].map((stat) => (
          <Card key={stat.label} className="stat-card p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-sm flex-shrink-0`}>
                <stat.icon className="w-4.5 h-4.5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-foreground truncate tracking-tight">{stat.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { href: '/app/education/modules', label: 'Create Module', icon: BookOpen, desc: 'Add a new course module' },
              { href: '/app/education/students', label: 'Add Students', icon: Users, desc: 'Enroll new students' },
              { href: '/app/education/grades', label: 'Review Grades', icon: FileText, desc: 'View final exam results' },
              { href: '/app/education/schedules', label: 'Schedule Lectures', icon: TrendingUp, desc: 'Plan lecture timetable' },
            ].map((action) => (
              <Link key={action.href} href={action.href} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-all group">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                  <action.icon className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{action.label}</p>
                  <p className="text-[11px] text-muted-foreground/50">{action.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Upcoming Schedules</h2>
            <Link href="/app/education/schedules" className="text-xs text-primary font-medium hover:text-primary/80 transition-colors">View all</Link>
          </div>
          <div className="divide-y divide-border/10">
            {schedules.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-6 h-6 text-muted-foreground/25" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">No schedules yet</p>
                <p className="text-xs text-muted-foreground/40 mt-1">Create a lecture schedule to see it here</p>
              </div>
            ) : schedules.map((item: any) => (
              <div key={item.id} className="px-5 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{item.education_modules?.module_code} · {item.education_modules?.module_name}</p>
                  <p className="text-[11px] text-muted-foreground/50">{item.day_name} at {item.start_time}</p>
                </div>
                <span className="badge badge-info flex-shrink-0 ml-3">Scheduled</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
