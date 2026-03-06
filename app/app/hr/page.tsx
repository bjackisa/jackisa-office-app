'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Users, Clock, Award, DollarSign, UserPlus, CalendarCheck, Calculator, Star } from 'lucide-react'

export default function HRDashboard() {
  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">HR & Payroll</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage your team, payroll, and performance</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger-children">
        {[
          { label: 'Employees', value: '—', icon: Users, gradient: 'from-blue-500 to-blue-600' },
          { label: 'Attendance', value: '—', icon: Clock, gradient: 'from-emerald-500 to-green-600' },
          { label: 'Payroll', value: '—', icon: DollarSign, gradient: 'from-violet-500 to-purple-600' },
          { label: 'Performance', value: '—', icon: Award, gradient: 'from-amber-500 to-orange-500' },
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

      {/* Main Content */}
      <div className="grid md:grid-cols-2 gap-5">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { href: '/app/hr/employees', label: 'Add Employee', icon: UserPlus, desc: 'Register a new team member' },
              { href: '/app/hr/attendance', label: 'Mark Attendance', icon: CalendarCheck, desc: 'Record daily attendance' },
              { href: '/app/hr/payroll', label: 'Process Payroll', icon: DollarSign, desc: 'Run monthly payroll' },
              { href: '/app/hr/paye', label: 'PAYE Calculator', icon: Calculator, desc: 'Calculate tax deductions' },
              { href: '/app/hr/points', label: 'Performance Reviews', icon: Star, desc: 'Evaluate team performance' },
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
          <div className="px-5 py-4 border-b border-border/30">
            <h2 className="text-sm font-semibold text-foreground">Recent Activities</h2>
          </div>
          <div className="p-5">
            <div className="flex flex-col items-center justify-center py-10">
              <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
                <Clock className="w-6 h-6 text-muted-foreground/25" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">No recent activities</p>
              <p className="text-xs text-muted-foreground/40 mt-1">HR activities will appear here</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
