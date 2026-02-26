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
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Welcome Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              {greeting}, {userName || 'there'}
            </h1>
            <p className="text-gray-500 text-sm">
              Here&apos;s what&apos;s happening with your business today.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((stat) => (
            <Link key={stat.title} href={stat.href}>
              <Card className="p-5 border border-gray-200/60 bg-white hover:shadow-md hover:border-gray-300/60 transition-all duration-200 cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${stat.bgLight}`}>
                    <stat.icon className={`w-5 h-5 ${stat.textColor}`} />
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
                </div>
                <p className="text-2xl font-bold text-gray-900 mb-0.5">{stat.value}</p>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 font-medium">{stat.title}</p>
                  {stat.change && (
                    <span className="text-[11px] text-gray-400">{stat.change}</span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="lg:col-span-2">
          <Card className="border border-gray-200/60 bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-gray-800">Quick Actions</h2>
              </div>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {quickActions.map((action) => (
                  <Link key={action.label} href={action.href}>
                    <div className="p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm bg-gray-50/50 hover:bg-white transition-all duration-200 cursor-pointer group">
                      <div className={`w-9 h-9 rounded-lg ${action.color} flex items-center justify-center mb-3`}>
                        <action.icon className="w-4 h-4 text-white" />
                      </div>
                      <p className="text-sm font-medium text-gray-800 group-hover:text-gray-900">{action.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{action.desc}</p>
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
          <Card className="border border-gray-200/60 bg-white overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-gray-800">Subscription</h2>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Plan</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    stats.activeSubscription
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-600'
                  }`}>
                    {stats.subscriptionTier
                      ? stats.subscriptionTier.charAt(0).toUpperCase() + stats.subscriptionTier.slice(1)
                      : 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Status</span>
                  <span className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${stats.activeSubscription ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="text-xs text-gray-700">{stats.activeSubscription ? 'Active' : 'Inactive'}</span>
                  </span>
                </div>
              </div>
              <Link
                href="/app/settings/subscription"
                className="mt-4 block w-full text-center px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
              >
                Manage Subscription
              </Link>
            </div>
          </Card>

          {/* Storage Card */}
          <Card className="border border-gray-200/60 bg-white overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <HardDrive className="w-4 h-4 text-violet-500" />
                <h2 className="text-sm font-semibold text-gray-800">Storage</h2>
              </div>
              <div className="mb-3">
                <div className="flex items-end justify-between mb-2">
                  <span className="text-xl font-bold text-gray-900">{stats.storageUsed.toFixed(1)} GB</span>
                  <span className="text-xs text-gray-400">of {stats.storageLimit.toFixed(0)} GB</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-500"
                    style={{ width: `${stats.storageLimit > 0 ? Math.min((stats.storageUsed / stats.storageLimit) * 100, 100) : 0}%` }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-400">
                {stats.storageLimit > 0
                  ? `${((stats.storageUsed / stats.storageLimit) * 100).toFixed(0)}% of storage used`
                  : 'No storage allocated'}
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-6">
        <Card className="border border-gray-200/60 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-gray-800">Recent Activity</h2>
            </div>
            <span className="text-xs text-gray-400">{recentActivity.length} events</span>
          </div>
          <div className="divide-y divide-gray-50">
            {recentActivity.length > 0 ? (
              recentActivity.map((log) => (
                <div key={log.id} className="px-6 py-3.5 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Activity className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{log.action}</p>
                    <p className="text-[11px] text-gray-400">{log.resource_type || 'System'}</p>
                  </div>
                  <span className="text-[11px] text-gray-400 flex-shrink-0">{formatTimeAgo(log.created_at)}</span>
                </div>
              ))
            ) : (
              <div className="px-6 py-12 text-center">
                <Activity className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400 font-medium">No recent activity</p>
                <p className="text-xs text-gray-300 mt-1">Activity from your team will appear here</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
