'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BookOpen, Users, FileText, TrendingUp } from 'lucide-react'

export default function EducationDashboard() {
  const stats = [
    { label: 'Total Modules', value: '12', subtext: 'Active courses', icon: BookOpen, color: 'bg-indigo-500' },
    { label: 'Total Students', value: '156', subtext: 'Enrolled', icon: Users, color: 'bg-cyan-500' },
    { label: 'Pending Results', value: '23', subtext: 'To be graded', icon: FileText, color: 'bg-yellow-500' },
    { label: 'Average Grade', value: '78%', subtext: 'Class average', icon: TrendingUp, color: 'bg-emerald-500' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Education Management</h1>
        <p className="text-muted-foreground">Manage modules, students, grades, and schedules</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="p-6 border border-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
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

      {/* Main Content */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Button className="w-full justify-start" variant="outline">+ Create Module</Button>
            <Button className="w-full justify-start" variant="outline">+ Add Students</Button>
            <Button className="w-full justify-start" variant="outline">+ Upload Grades</Button>
            <Button className="w-full justify-start" variant="outline">+ Schedule Lectures</Button>
          </div>
        </Card>

        <Card className="p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Upcoming Schedules</h2>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between pb-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">Module {100 + i}</p>
                  <p className="text-xs text-muted-foreground">Mon 10:00 AM</p>
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
