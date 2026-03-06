'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/hooks/useAuth'
import type { DashboardStats, ActivityLog } from '@/types'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import {
  Users,
  FileText,
  DollarSign,
  Clock,
  HardDrive,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  UserPlus,
  Banknote,
  BarChart3,
  CalendarOff,
  Headphones,
  CreditCard,
  ChevronRight,
  Activity,
  Zap,
} from 'lucide-react'

export default function DashboardPage() {
  const { user, company } = useAuth()
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    activeSubscription: false,
    subscriptionTier: null,
    pendingInvoices: 0,
    totalRevenue: 0,
    upcomingPayroll: 0,
    storageUsed: 0,
    storageLimit: 0,
    pendingLeaveRequests: 0,
    openTickets: 0,
  })
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState('')
  const [userName, setUserName] = useState('')

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 17) setGreeting('Good afternoon')
    else setGreeting('Good evening')

    const loadDashboard = async () => {
      try {
        setUserName(user?.full_name || 'there')

        if (!company?.id) {
          setLoading(false)
          return
        }

        const companyId = company.id

        const [employeesRes, invoicesRes, subscriptionRes, storageRes, activityRes] = await Promise.all([
          supabase
            .from('company_employees')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'active'),
          supabase
            .from('invoices')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'draft'),
          supabase
            .from('company_subscriptions')
            .select('status, tier')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single(),
          supabase
            .from('storage_usage')
            .select('used_storage_bytes, total_storage_bytes')
            .eq('company_id', companyId)
            .single(),
          supabase
            .from('activity_logs')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })
            .limit(8),
        ])

        setStats({
          totalEmployees: employeesRes.count || 0,
          activeSubscription: subscriptionRes.data?.status === 'active',
          subscriptionTier: subscriptionRes.data?.tier || null,
          pendingInvoices: invoicesRes.count || 0,
          totalRevenue: 0,
          upcomingPayroll: 0,
          storageUsed: (storageRes.data?.used_storage_bytes || 0) / (1024 * 1024 * 1024),
          storageLimit: (storageRes.data?.total_storage_bytes || 0) / (1024 * 1024 * 1024),
          pendingLeaveRequests: 0,
          openTickets: 0,
        })

        setRecentActivity(activityRes.data || [])
      } catch (error) {
        console.error('Failed to load dashboard:', error)
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [company?.id, user?.full_name])

  const statCards = [
    {
      title: 'Team Members',
      value: stats.totalEmployees,
      change: null,
      icon: Users,
      color: 'from-blue-500 to-blue-600',
      bgLight: 'bg-blue-50',
      textColor: 'text-blue-600',
      href: '/app/hr/employees',
    },
    {
      title: 'Pending Invoices',
      value: stats.pendingInvoices,
      change: null,
      icon: FileText,
      color: 'from-amber-500 to-orange-500',
      bgLight: 'bg-amber-50',
      textColor: 'text-amber-600',
      href: '/app/accounting/invoices',
    },
    {
      title: 'Subscription',
      value: stats.activeSubscription
        ? (stats.subscriptionTier || 'active').charAt(0).toUpperCase() + (stats.subscriptionTier || 'active').slice(1)
        : 'Inactive',
      change: null,
      icon: CreditCard,
      color: stats.activeSubscription ? 'from-emerald-500 to-green-600' : 'from-red-500 to-rose-600',
      bgLight: stats.activeSubscription ? 'bg-emerald-50' : 'bg-red-50',
      textColor: stats.activeSubscription ? 'text-emerald-600' : 'text-red-600',
      href: '/app/settings/subscription',
    },
    {
      title: 'Storage',
      value: `${stats.storageUsed.toFixed(1)} GB`,
      change: stats.storageLimit > 0 ? `of ${stats.storageLimit.toFixed(0)} GB` : null,
      icon: HardDrive,
      color: 'from-violet-500 to-purple-600',
      bgLight: 'bg-violet-50',
      textColor: 'text-violet-600',
      href: '/app/settings/company',
    },
  ]

  const quickActions = [
    { label: 'Add Employee', desc: 'Invite a team member', icon: UserPlus, href: '/app/settings/team', color: 'bg-blue-500' },
    { label: 'Create Invoice', desc: 'Issue a new invoice', icon: FileText, href: '/app/accounting/invoices', color: 'bg-emerald-500' },
    { label: 'Run Payroll', desc: 'Calculate salaries', icon: Banknote, href: '/app/hr/payroll', color: 'bg-purple-500' },
    { label: 'View Reports', desc: 'Business analytics', icon: BarChart3, href: '/app/accounting', color: 'bg-amber-500' },
    { label: 'Leave Requests', desc: 'Manage time off', icon: CalendarOff, href: '/app/hr/leave', color: 'bg-cyan-500' },
    { label: 'Help Desk', desc: 'Support tickets', icon: Headphones, href: '/app/helpdesk', color: 'bg-rose-500' },
  ]

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      {/* Welcome Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1 tracking-tight">
              {greeting}, {userName || 'there'}
            </h1>
            <p className="text-muted-foreground text-sm">
              Here&apos;s what&apos;s happening with your business today.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/50 border border-border/50">
            <span className="text-xs text-muted-foreground font-medium">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger-children">
          {statCards.map((stat) => (
            <Link key={stat.title} href={stat.href}>
              <Card className="p-5 hover:shadow-elevated hover:border-border transition-all duration-300 cursor-pointer group hover-lift">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-2xl ${stat.bgLight}`}>
                    <stat.icon className={`w-5 h-5 ${stat.textColor}`} />
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 group-hover:translate-x-0.5 transition-all duration-200" />
                </div>
                <p className="text-2xl font-bold text-foreground mb-0.5 tracking-tight">{stat.value}</p>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground font-medium">{stat.title}</p>
                  {stat.change && (
                    <span className="text-[11px] text-muted-foreground/60">{stat.change}</span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Quick Actions */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-amber-500/10">
                  <Zap className="w-4 h-4 text-amber-500" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Quick Actions</h2>
              </div>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 stagger-children">
                {quickActions.map((action) => (
                  <Link key={action.label} href={action.href}>
                    <div className="p-4 rounded-2xl border border-border/40 hover:border-border hover:shadow-soft bg-muted/30 hover:bg-card transition-all duration-300 cursor-pointer group">
                      <div className={`w-10 h-10 rounded-xl ${action.color} flex items-center justify-center mb-3 shadow-sm`}>
                        <action.icon className="w-4.5 h-4.5 text-white" />
                      </div>
                      <p className="text-sm font-semibold text-foreground group-hover:text-foreground">{action.label}</p>
                      <p className="text-[11px] text-muted-foreground/60 mt-0.5">{action.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Subscription & Storage */}
        <div className="space-y-4">
          {/* Subscription Card */}
          <Card className="overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <CreditCard className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Subscription</h2>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Plan</span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
                    stats.activeSubscription
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : 'bg-red-500/10 text-red-500'
                  }`}>
                    {stats.subscriptionTier
                      ? stats.subscriptionTier.charAt(0).toUpperCase() + stats.subscriptionTier.slice(1)
                      : 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${stats.activeSubscription ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="text-xs font-medium text-foreground">{stats.activeSubscription ? 'Active' : 'Inactive'}</span>
                  </span>
                </div>
              </div>
              <Link
                href="/app/settings/subscription"
                className="mt-4 block w-full text-center px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-all duration-200 shadow-sm"
              >
                Manage Subscription
              </Link>
            </div>
          </Card>

          {/* Storage Card */}
          <Card className="overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-1.5 rounded-lg bg-violet-500/10">
                  <HardDrive className="w-4 h-4 text-violet-500" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Storage</h2>
              </div>
              <div className="mb-3">
                <div className="flex items-end justify-between mb-2.5">
                  <span className="text-xl font-bold text-foreground tracking-tight">{stats.storageUsed.toFixed(1)} GB</span>
                  <span className="text-xs text-muted-foreground/60">of {stats.storageLimit.toFixed(0)} GB</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${stats.storageLimit > 0 ? Math.min((stats.storageUsed / stats.storageLimit) * 100, 100) : 0}%` }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                {stats.storageLimit > 0
                  ? `${((stats.storageUsed / stats.storageLimit) * 100).toFixed(0)}% of storage used`
                  : 'No storage allocated'}
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-5">
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Activity className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
            </div>
            <span className="text-xs text-muted-foreground/60 px-2 py-1 rounded-lg bg-muted/50">{recentActivity.length} events</span>
          </div>
          <div className="divide-y divide-border/30">
            {recentActivity.length > 0 ? (
              recentActivity.map((log) => (
                <div key={log.id} className="px-6 py-3.5 flex items-center gap-3 hover:bg-muted/30 transition-colors duration-200">
                  <div className="w-9 h-9 rounded-xl bg-primary/[0.06] flex items-center justify-center flex-shrink-0">
                    <Activity className="w-4 h-4 text-primary/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{log.action}</p>
                    <p className="text-[11px] text-muted-foreground/60">{log.resource_type || 'System'}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground/50 flex-shrink-0 font-medium">{formatTimeAgo(log.created_at)}</span>
                </div>
              ))
            ) : (
              <div className="px-6 py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <Activity className="w-6 h-6 text-muted-foreground/30" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">No recent activity</p>
                <p className="text-xs text-muted-foreground/50 mt-1">Activity from your team will appear here</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
