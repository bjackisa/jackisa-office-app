'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  ChevronDown,
  ChevronRight,
  DollarSign,
  BookOpen,
  TrendingUp,
  Briefcase,
  GraduationCap,
  Menu,
  X,
  Bell,
  Search,
  Building2,
  ChevronsUpDown,
  Calculator,
  FileText,
  Receipt,
  FileMinus,
  FilePlus,
  Percent,
  Book,
  UserCog,
  Wallet,
  Banknote,
  Clock,
  CalendarOff,
  Star,
  Award,
  ClipboardList,
  FileCheck,
  Calendar,
  ShoppingCart,
  PieChart,
  Share2,
  Scale,
  Layout,
  Headphones,
  Shield,
  CreditCard,
  UserPlus,
} from 'lucide-react'
import { useState, useMemo } from 'react'
import type { User, Company, CompanyRole } from '@/types'

interface NavChild {
  label: string
  href: string
  icon: React.ReactNode
}

interface NavGroup {
  label: string
  icon: React.ReactNode
  children: NavChild[]
}

type NavEntry = { label: string; href: string; icon: React.ReactNode } | NavGroup

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry
}

const NAV: NavEntry[] = [
  { label: 'Dashboard', href: '/app', icon: <LayoutDashboard className="w-[18px] h-[18px]" /> },
  {
    label: 'Accounting & Finance',
    icon: <DollarSign className="w-[18px] h-[18px]" />,
    children: [
      { label: 'Overview', href: '/app/accounting', icon: <Calculator className="w-4 h-4" /> },
      { label: 'Invoices', href: '/app/accounting/invoices', icon: <FileText className="w-4 h-4" /> },
      { label: 'Expenses', href: '/app/accounting/expenses', icon: <Receipt className="w-4 h-4" /> },
      { label: 'Credit Notes', href: '/app/accounting/credit-notes', icon: <FileMinus className="w-4 h-4" /> },
      { label: 'Debit Notes', href: '/app/accounting/debit-notes', icon: <FilePlus className="w-4 h-4" /> },
      { label: 'Chart of Accounts', href: '/app/accounting/chart-of-accounts', icon: <BookOpen className="w-4 h-4" /> },
      { label: 'VAT Management', href: '/app/accounting/vat', icon: <Percent className="w-4 h-4" /> },
      { label: 'Bookkeeping', href: '/app/accounting/bookkeeping', icon: <Book className="w-4 h-4" /> },
    ],
  },
  {
    label: 'HR & Payroll',
    icon: <Users className="w-[18px] h-[18px]" />,
    children: [
      { label: 'Overview', href: '/app/hr', icon: <Users className="w-4 h-4" /> },
      { label: 'Employees', href: '/app/hr/employees', icon: <UserCog className="w-4 h-4" /> },
      { label: 'Salary Structures', href: '/app/hr/salary-structures', icon: <Wallet className="w-4 h-4" /> },
      { label: 'Payroll', href: '/app/hr/payroll', icon: <Banknote className="w-4 h-4" /> },
      { label: 'PAYE & Tax', href: '/app/hr/paye', icon: <Calculator className="w-4 h-4" /> },
      { label: 'Attendance', href: '/app/hr/attendance', icon: <Clock className="w-4 h-4" /> },
      { label: 'Leave Management', href: '/app/hr/leave', icon: <CalendarOff className="w-4 h-4" /> },
      { label: 'Performance', href: '/app/hr/performance', icon: <Star className="w-4 h-4" /> },
      { label: 'HR Points', href: '/app/hr/points', icon: <Award className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Education',
    icon: <GraduationCap className="w-[18px] h-[18px]" />,
    children: [
      { label: 'Overview', href: '/app/education', icon: <GraduationCap className="w-4 h-4" /> },
      { label: 'Modules', href: '/app/education/modules', icon: <BookOpen className="w-4 h-4" /> },
      { label: 'Students', href: '/app/education/students', icon: <Users className="w-4 h-4" /> },
      { label: 'Coursework', href: '/app/education/coursework', icon: <ClipboardList className="w-4 h-4" /> },
      { label: 'Exams', href: '/app/education/exams', icon: <FileCheck className="w-4 h-4" /> },
      { label: 'Final Grades', href: '/app/education/grades', icon: <Award className="w-4 h-4" /> },
      { label: 'Schedules', href: '/app/education/schedules', icon: <Calendar className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Sales & Marketing',
    icon: <TrendingUp className="w-[18px] h-[18px]" />,
    children: [
      { label: 'Overview', href: '/app/sales', icon: <TrendingUp className="w-4 h-4" /> },
      { label: 'Sales Orders', href: '/app/sales/orders', icon: <ShoppingCart className="w-4 h-4" /> },
      { label: 'Commissions', href: '/app/sales/commissions', icon: <DollarSign className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Business Tools',
    icon: <Briefcase className="w-[18px] h-[18px]" />,
    children: [
      { label: 'Dividends', href: '/app/dividends', icon: <PieChart className="w-4 h-4" /> },
      { label: 'Affiliate Program', href: '/app/affiliate', icon: <Share2 className="w-4 h-4" /> },
      { label: 'Legal Documents', href: '/app/legal', icon: <Scale className="w-4 h-4" /> },
      { label: 'CMS', href: '/app/cms', icon: <Layout className="w-4 h-4" /> },
      { label: 'Help Desk', href: '/app/helpdesk', icon: <Headphones className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Administration',
    icon: <Settings className="w-[18px] h-[18px]" />,
    children: [
      { label: 'Company Settings', href: '/app/settings/company', icon: <Building2 className="w-4 h-4" /> },
      { label: 'Team Management', href: '/app/settings/team', icon: <UserPlus className="w-4 h-4" /> },
      { label: 'Roles & Permissions', href: '/app/settings/roles', icon: <Shield className="w-4 h-4" /> },
      { label: 'Subscription', href: '/app/settings/subscription', icon: <CreditCard className="w-4 h-4" /> },
      { label: 'Billing', href: '/app/settings/billing', icon: <Receipt className="w-4 h-4" /> },
    ],
  },
]

function NavGroupComponent({ group, collapsed }: { group: NavGroup; collapsed: boolean }) {
  const pathname = usePathname()
  const isActive = group.children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))
  const [open, setOpen] = useState(isActive)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
          isActive
            ? 'text-white bg-white/10'
            : 'text-blue-200/70 hover:text-white hover:bg-white/5'
        )}
      >
        <span className="flex-shrink-0 opacity-80">{group.icon}</span>
        {!collapsed && (
          <>
            <span className="flex-1 text-left truncate">{group.label}</span>
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 opacity-50 transition-transform duration-200',
                open && 'rotate-180'
              )}
            />
          </>
        )}
      </button>
      {open && !collapsed && (
        <div className="mt-0.5 ml-3 pl-3 border-l border-white/10 space-y-0.5">
          {group.children.map(child => {
            const active = pathname === child.href
            return (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] transition-all duration-150',
                  active
                    ? 'text-white bg-white/15 font-medium'
                    : 'text-blue-200/60 hover:text-white hover:bg-white/5'
                )}
              >
                <span className="opacity-70">{child.icon}</span>
                <span className="truncate">{child.label}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface SidebarNavProps {
  onLogout?: () => void
  companyName?: string
  userName?: string
  userEmail?: string
  userAvatar?: string | null
  companies?: { id: string; name: string; logo_url: string | null }[]
  onSwitchCompany?: (id: string) => void
}

export function SidebarNav({
  onLogout,
  companyName = 'Jackisa Office',
  userName = 'User',
  userEmail = '',
  userAvatar,
  companies = [],
  onSwitchCompany,
}: SidebarNavProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [companySwitcherOpen, setCompanySwitcherOpen] = useState(false)

  const initials = useMemo(() => {
    return userName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }, [userName])

  const sidebarContent = (
    <aside className="w-[260px] h-full bg-gradient-to-b from-[#0a1628] to-[#0d2847] flex flex-col">
      {/* Brand Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-white font-semibold text-sm tracking-tight">Jackisa Office</h1>
            <p className="text-blue-300/50 text-[10px] font-medium uppercase tracking-wider">Enterprise Suite</p>
          </div>
        </div>
      </div>

      {/* Company Switcher */}
      <div className="px-3 mb-3">
        <button
          onClick={() => companies.length > 1 && setCompanySwitcherOpen(!companySwitcherOpen)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 transition-all',
            companies.length > 1 && 'hover:bg-white/10 cursor-pointer'
          )}
        >
          <div className="w-7 h-7 rounded-md bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-white text-xs font-medium truncate">{companyName}</p>
            <p className="text-blue-300/40 text-[10px]">Workspace</p>
          </div>
          {companies.length > 1 && (
            <ChevronsUpDown className="w-3.5 h-3.5 text-blue-300/40 flex-shrink-0" />
          )}
        </button>
        {companySwitcherOpen && companies.length > 1 && (
          <div className="mt-1 rounded-lg bg-[#0d1f3c] border border-white/10 overflow-hidden">
            {companies.map(c => (
              <button
                key={c.id}
                onClick={() => {
                  onSwitchCompany?.(c.id)
                  setCompanySwitcherOpen(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-blue-200/70 hover:text-white hover:bg-white/5 transition-colors"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="px-3 mb-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/[0.06]">
          <Search className="w-3.5 h-3.5 text-blue-300/40" />
          <span className="text-blue-300/30 text-xs">Search tools...</span>
          <span className="ml-auto text-[10px] text-blue-300/20 bg-white/5 px-1.5 py-0.5 rounded">⌘K</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1 scrollbar-thin">
        {NAV.map(entry => {
          if (isGroup(entry)) {
            return <NavGroupComponent key={entry.label} group={entry} collapsed={false} />
          }
          const active = pathname === entry.href
          return (
            <Link
              key={entry.href}
              href={entry.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                active
                  ? 'text-white bg-blue-500/20 shadow-sm shadow-blue-500/10'
                  : 'text-blue-200/70 hover:text-white hover:bg-white/5'
              )}
            >
              <span className="flex-shrink-0 opacity-80">{entry.icon}</span>
              <span>{entry.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User Footer */}
      <div className="p-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-2.5 px-2 py-2">
          {userAvatar ? (
            <img src={userAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-300 text-xs font-semibold">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{userName}</p>
            <p className="text-blue-300/40 text-[10px] truncate">{userEmail}</p>
          </div>
          <button
            onClick={onLogout}
            className="p-1.5 rounded-md text-blue-300/40 hover:text-red-400 hover:bg-white/5 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-[#0a1628] flex items-center justify-between px-4 z-50 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
            <Building2 className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-white font-semibold text-sm">Jackisa Office</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 text-blue-300/50 hover:text-white transition-colors">
            <Bell className="w-4.5 h-4.5" />
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 text-blue-300/50 hover:text-white transition-colors"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Desktop Sidebar */}
      <div className="hidden lg:block h-screen flex-shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile Sidebar */}
      <div
        className={cn(
          'lg:hidden fixed left-0 top-0 bottom-0 z-50 transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </div>

      {/* Mobile Spacer */}
      <div className="lg:hidden h-14" />
    </>
  )
}
