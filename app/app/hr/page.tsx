'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Clock, Award, DollarSign } from 'lucide-react'

export default function HRDashboard() {
  const stats = [
    { label: 'Total Employees', value: '24', subtext: 'Active team members', icon: Users, color: 'bg-blue-500' },
    { label: 'Absent Today', value: '2', subtext: 'On leave', icon: Clock, color: 'bg-orange-500' },
    { label: 'Performance Score', value: '8.5/10', subtext: 'Team average', icon: Award, color: 'bg-green-500' },
    { label: 'Payroll Status', value: 'Ready', subtext: 'Process next month', icon: DollarSign, color: 'bg-purple-500' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">HR & Payroll Dashboard</h1>
        <p className="text-muted-foreground">Manage employees, attendance, payroll, and performance</p>
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
            <Button className="w-full justify-start" variant="outline">+ Add Employee</Button>
            <Button className="w-full justify-start" variant="outline">+ Mark Attendance</Button>
            <Button className="w-full justify-start" variant="outline">+ Process Payroll</Button>
            <Button className="w-full justify-start" variant="outline">+ Review Performance</Button>
          </div>
        </Card>

        <Card className="p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Recent Activities</h2>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 pb-2 border-b border-border last:border-0">
                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-foreground">Employee activity</p>
                  <p className="text-xs text-muted-foreground">2 hours ago</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
