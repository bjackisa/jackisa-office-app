'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { DashboardStats } from '@/types'
import { Card } from '@/components/ui/card'
import { Users, FileText, DollarSign, Clock, HardDrive } from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    activeSubscription: false,
    pendingInvoices: 0,
    upcomingPayroll: 0,
    storageUsed: 0,
    storageLimit: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        // Get employee to find company
        const { data: employeeData } = await supabase
          .from('employees')
          .select('company_id')
          .eq('user_id', session.user.id)
          .single()

        if (!employeeData) return

        const companyId = employeeData.company_id

        // Get stats
        const [employeesRes, invoicesRes, subscriptionRes, storageRes] = await Promise.all([
          supabase
            .from('employees')
            .select('id', { count: 'exact' })
            .eq('company_id', companyId)
            .eq('status', 'active'),
          supabase
            .from('invoices')
            .select('id', { count: 'exact' })
            .eq('company_id', companyId)
            .eq('status', 'pending'),
          supabase
            .from('company_subscriptions')
            .select('status, plan_id')
            .eq('company_id', companyId)
            .single(),
          supabase
            .from('storage_usage')
            .select('used_storage_bytes, total_storage_bytes')
            .eq('company_id', companyId)
            .single(),
        ])

        setStats({
          totalEmployees: employeesRes.count || 0,
          activeSubscription: subscriptionRes.data?.status === 'active',
          pendingInvoices: invoicesRes.count || 0,
          upcomingPayroll: 0,
          storageUsed: (storageRes.data?.used_storage_bytes || 0) / (1024 * 1024 * 1024),
          storageLimit: (storageRes.data?.total_storage_bytes || 0) / (1024 * 1024 * 1024),
        })
      } catch (error) {
        console.error('Failed to load stats:', error)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [])

  const StatCard = ({ icon: Icon, title, value, subtext, color }: any) => (
    <Card className="p-6 border border-border hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {subtext && <p className="text-xs text-muted-foreground mt-2">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </Card>
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to Jackisa Office - Your corporate management suite</p>
      </div>

      {/* Stats Grid */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <StatCard
            icon={Users}
            title="Total Employees"
            value={stats.totalEmployees}
            subtext="Active team members"
            color="bg-blue-500"
          />
          <StatCard
            icon={FileText}
            title="Pending Invoices"
            value={stats.pendingInvoices}
            subtext="Awaiting payment"
            color="bg-orange-500"
          />
          <StatCard
            icon={DollarSign}
            title="Subscription Status"
            value={stats.activeSubscription ? 'Active' : 'Inactive'}
            subtext={stats.activeSubscription ? 'Your plan is active' : 'Subscribe now'}
            color={stats.activeSubscription ? 'bg-green-500' : 'bg-red-500'}
          />
          <StatCard
            icon={Clock}
            title="Payroll Status"
            value="On Schedule"
            subtext="Next run in 5 days"
            color="bg-purple-500"
          />
          <StatCard
            icon={HardDrive}
            title="Storage Used"
            value={`${stats.storageUsed.toFixed(1)} GB`}
            subtext={`of ${stats.storageLimit.toFixed(1)} GB`}
            color="bg-cyan-500"
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="lg:col-span-2">
          <Card className="p-6 border border-border">
            <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <button className="p-4 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors text-left">
                <p className="font-medium text-primary">+ Add Employee</p>
                <p className="text-xs text-muted-foreground mt-1">Invite team members</p>
              </button>
              <button className="p-4 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors text-left">
                <p className="font-medium text-primary">+ Create Invoice</p>
                <p className="text-xs text-muted-foreground mt-1">Issue new invoice</p>
              </button>
              <button className="p-4 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors text-left">
                <p className="font-medium text-primary">+ Run Payroll</p>
                <p className="text-xs text-muted-foreground mt-1">Calculate salaries</p>
              </button>
              <button className="p-4 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors text-left">
                <p className="font-medium text-primary">+ View Reports</p>
                <p className="text-xs text-muted-foreground mt-1">Business analytics</p>
              </button>
            </div>
          </Card>
        </div>

        {/* Subscription Info */}
        <div>
          <Card className="p-6 border border-border bg-gradient-to-br from-primary/5 to-transparent">
            <h2 className="text-lg font-semibold text-foreground mb-4">Subscription</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Current Plan</p>
                <p className="text-lg font-semibold text-foreground">Pro Plan</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Billing Period</p>
                <p className="text-lg font-semibold text-foreground">Monthly</p>
              </div>
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Next billing in 15 days</p>
                <button className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium text-sm">
                  Manage Subscription
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-6">
        <Card className="p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 pb-3 border-b border-border last:border-0">
                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                <p className="text-sm text-foreground">System activity will appear here</p>
                <p className="text-xs text-muted-foreground ml-auto">Recently</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
