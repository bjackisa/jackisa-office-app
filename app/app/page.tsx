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
      {/* Welcome Banner */}
      <div className="relative mb-8 rounded-2xl bg-gradient-to-br from-primary/[0.07] via-blue-500/[0.04] to-violet-500/[0.06] border border-primary/[0.08] p-6 lg:p-8 overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-primary/[0.06] to-transparent rounded-full blur-3xl -mr-20 -mt-20" />
        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-primary/70 uppercase tracking-wider mb-1.5">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
              <h1 className="text-2xl lg:text-2xl font-bold text-foreground tracking-tight">
                {greeting}, {userName || 'there'}
              </h1>
              <p className="text-muted-foreground text-sm mt-1.5">
                Here&apos;s an overview of your business today.
              </p>
            </div>
            <Link
              href="/app/hr/employees"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-all duration-200 shadow-glow-primary whitespace-nowrap self-start"
            >
              <UserPlus className="w-4 h-4" />
              Add Team Member
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger-children">
          {statCards.map((stat) => (
            <Link key={stat.title} href={stat.href}>
              <Card className="stat-card p-5 hover:shadow-float transition-all duration-300 cursor-pointer group" style={{ '--tw-shadow-color': 'transparent' } as React.CSSProperties}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-sm`}>
                    <stat.icon className="w-5 h-5 text-white" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-primary/50 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all duration-300" />
                </div>
                <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-muted-foreground font-medium">{stat.title}</p>
                  {stat.change && (
                    <span className="text-[10px] text-muted-foreground/50 bg-muted/50 px-1.5 py-0.5 rounded-md">{stat.change}</span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Quick Actions Strip */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-4">
          <Zap className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-foreground">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 stagger-children">
          {quickActions.map((action) => (
            <Link key={action.label} href={action.href}>
              <div className="relative p-4 rounded-2xl border border-border/40 hover:border-primary/20 hover:shadow-soft bg-card transition-all duration-300 cursor-pointer group text-center">
                <div className={`w-10 h-10 rounded-xl ${action.color} flex items-center justify-center mx-auto mb-2.5 shadow-sm group-hover:scale-105 transition-transform duration-300`}>
                  <action.icon className="w-4.5 h-4.5 text-white" />
                </div>
                <p className="text-[13px] font-semibold text-foreground leading-tight">{action.label}</p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5 leading-tight">{action.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Main Grid: Activity + Side Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Recent Activity */}
        <div className="lg:col-span-3">
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/[0.08] flex items-center justify-center">
                  <Activity className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
                  <p className="text-[10px] text-muted-foreground/50">Latest events from your workspace</p>
                </div>
              </div>
              <span className="badge badge-neutral">{recentActivity.length} events</span>
            </div>
            <div className="divide-y divide-border/20">
              {recentActivity.length > 0 ? (
                recentActivity.map((log, idx) => {
                  const colors = ['bg-blue-500/10 text-blue-500', 'bg-emerald-500/10 text-emerald-500', 'bg-amber-500/10 text-amber-500', 'bg-violet-500/10 text-violet-500']
                  const colorClass = colors[idx % colors.length]
                  return (
                    <div key={log.id} className="px-5 py-3.5 flex items-center gap-3.5 hover:bg-muted/20 transition-colors duration-150">
                      <div className={`w-9 h-9 rounded-xl ${colorClass.split(' ')[0]} flex items-center justify-center flex-shrink-0`}>
                        <Activity className={`w-4 h-4 ${colorClass.split(' ')[1]}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground font-medium truncate">{log.action}</p>
                        <p className="text-[11px] text-muted-foreground/50">{log.resource_type || 'System'}</p>
                      </div>
                      <span className="text-[11px] text-muted-foreground/40 flex-shrink-0 tabular-nums">{formatTimeAgo(log.created_at)}</span>
                    </div>
                  )
                })
              ) : (
                <div className="px-6 py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                    <Activity className="w-6 h-6 text-muted-foreground/25" />
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">No recent activity</p>
                  <p className="text-xs text-muted-foreground/40 mt-1">Activity from your team will appear here</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Side Cards */}
        <div className="lg:col-span-2 space-y-5">
          {/* Subscription */}
          <Card className="overflow-hidden">
            <div className="p-5">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-sm">
                    <CreditCard className="w-4 h-4 text-white" />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">Subscription</h2>
                </div>
                <span className={`badge ${stats.activeSubscription ? 'badge-success' : 'badge-danger'}`}>
                  {stats.activeSubscription ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="space-y-3 mb-5">
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                  <span className="text-xs text-muted-foreground">Current Plan</span>
                  <span className="text-xs font-bold text-foreground">
                    {stats.subscriptionTier
                      ? stats.subscriptionTier.charAt(0).toUpperCase() + stats.subscriptionTier.slice(1)
                      : 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                  <span className="text-xs text-muted-foreground">Team Size</span>
                  <span className="text-xs font-bold text-foreground">{stats.totalEmployees} members</span>
                </div>
              </div>
              <Link
                href="/app/settings/subscription"
                className="block w-full text-center px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-all duration-200 shadow-glow-primary"
              >
                Manage Plan
              </Link>
            </div>
          </Card>

          {/* Storage */}
          <Card className="overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
                  <HardDrive className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">Storage</h2>
                  <p className="text-[10px] text-muted-foreground/50">Cloud storage usage</p>
                </div>
              </div>
              <div className="mb-4">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-2xl font-bold text-foreground tracking-tight">{stats.storageUsed.toFixed(1)}<span className="text-sm font-medium text-muted-foreground ml-1">GB</span></span>
                  <span className="text-xs text-muted-foreground/50">/ {stats.storageLimit.toFixed(0)} GB</span>
                </div>
                <div className="w-full h-2.5 bg-muted/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${stats.storageLimit > 0 ? Math.min((stats.storageUsed / stats.storageLimit) * 100, 100) : 0}%` }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/50">
                {stats.storageLimit > 0
                  ? `${((stats.storageUsed / stats.storageLimit) * 100).toFixed(0)}% used — ${(stats.storageLimit - stats.storageUsed).toFixed(1)} GB remaining`
                  : 'No storage allocated'}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
