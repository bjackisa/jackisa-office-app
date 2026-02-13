'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { 
  Home, 
  Users, 
  FileText, 
  BarChart3, 
  Settings, 
  LogOut,
  ChevronDown,
  DollarSign,
  BookOpen,
  TrendingUp,
  Briefcase,
  Clock,
  Award,
  FileCheck,
  ShoppingCart,
  Share2,
  Scale,
  Layout,
  Menu,
  X
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface NavItem {
  label: string
  href?: string
  icon?: React.ReactNode
  children?: NavItem[]
}

const accountingTools: NavItem[] = [
  { label: 'Dashboard', href: '/app/accounting' },
  { label: 'Invoices', href: '/app/accounting/invoices' },
  { label: 'Expenses', href: '/app/accounting/expenses' },
  { label: 'Credit Notes', href: '/app/accounting/credit-notes' },
  { label: 'Debit Notes', href: '/app/accounting/debit-notes' },
  { label: 'Chart of Accounts', href: '/app/accounting/chart-of-accounts' },
  { label: 'VAT Management', href: '/app/accounting/vat' },
  { label: 'Bookkeeping', href: '/app/accounting/bookkeeping' },
]

const hrTools: NavItem[] = [
  { label: 'Dashboard', href: '/app/hr' },
  { label: 'Employee Management', href: '/app/hr/employees' },
  { label: 'Salary Structures', href: '/app/hr/salary-structures' },
  { label: 'Payroll', href: '/app/hr/payroll' },
  { label: 'PAYE & Tax', href: '/app/hr/paye' },
  { label: 'Attendance', href: '/app/hr/attendance' },
  { label: 'Leave Management', href: '/app/hr/leave' },
  { label: 'Performance Reviews', href: '/app/hr/performance' },
  { label: 'HR Points', href: '/app/hr/points' },
]

const educationTools: NavItem[] = [
  { label: 'Dashboard', href: '/app/education' },
  { label: 'Modules', href: '/app/education/modules' },
  { label: 'Students', href: '/app/education/students' },
  { label: 'Coursework', href: '/app/education/coursework' },
  { label: 'Exams', href: '/app/education/exams' },
  { label: 'Final Grades', href: '/app/education/grades' },
  { label: 'Schedules', href: '/app/education/schedules' },
]

const salesTools: NavItem[] = [
  { label: 'Dashboard', href: '/app/sales' },
  { label: 'Sales Orders', href: '/app/sales/orders' },
  { label: 'Commissions', href: '/app/sales/commissions' },
]

const otherTools: NavItem[] = [
  { label: 'Dividends', href: '/app/dividends' },
  { label: 'Affiliate Program', href: '/app/affiliate' },
  { label: 'Legal Documents', href: '/app/legal' },
  { label: 'CMS', href: '/app/cms' },
]

const adminTools: NavItem[] = [
  { label: 'Company Settings', href: '/app/settings/company' },
  { label: 'Team Management', href: '/app/settings/team' },
  { label: 'Roles & Permissions', href: '/app/settings/roles' },
  { label: 'Subscription', href: '/app/settings/subscription' },
  { label: 'Billing', href: '/app/settings/billing' },
]

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/app', icon: <Home className="w-4 h-4" /> },
  { 
    label: 'Accounting & Finance', 
    icon: <DollarSign className="w-4 h-4" />,
    children: accountingTools 
  },
  { 
    label: 'HR & Payroll', 
    icon: <Users className="w-4 h-4" />,
    children: hrTools 
  },
  { 
    label: 'Education', 
    icon: <BookOpen className="w-4 h-4" />,
    children: educationTools 
  },
  { 
    label: 'Sales & Marketing', 
    icon: <TrendingUp className="w-4 h-4" />,
    children: salesTools 
  },
  { 
    label: 'Business Management', 
    icon: <Briefcase className="w-4 h-4" />,
    children: otherTools 
  },
  { 
    label: 'Administration', 
    icon: <Settings className="w-4 h-4" />,
    children: adminTools 
  },
]

interface NavItemProps {
  item: NavItem
  isExpanded?: boolean
  onExpandChange?: (expanded: boolean) => void
}

function NavItemComponent({ item, isExpanded, onExpandChange }: NavItemProps) {
  const pathname = usePathname()
  const [expanded, setExpanded] = useState(isExpanded || false)

  const handleToggle = () => {
    const newExpanded = !expanded
    setExpanded(newExpanded)
    onExpandChange?.(newExpanded)
  }

  const isActive = pathname === item.href || 
    (item.children?.some(child => pathname.startsWith(child.href || '')) ?? false)

  if (item.children) {
    return (
      <div>
        <button
          onClick={handleToggle}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors',
            isActive ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent'
          )}
        >
          <span className="flex items-center gap-2">
            {item.icon}
            {item.label}
          </span>
          <ChevronDown className={cn('w-4 h-4 transition-transform', expanded && 'rotate-180')} />
        </button>
        {expanded && (
          <div className="ml-4 mt-1 space-y-1">
            {item.children.map((child) => (
              <Link
                key={child.href}
                href={child.href!}
                className={cn(
                  'block px-3 py-2 rounded-md text-sm transition-colors',
                  pathname === child.href
                    ? 'bg-sidebar-accent text-primary font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                {child.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      href={item.href || '#'}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
        pathname === item.href
          ? 'bg-primary text-primary-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent'
      )}
    >
      {item.icon}
      {item.label}
    </Link>
  )
}

interface SidebarNavProps {
  onLogout?: () => void
  companyName?: string
}

export function SidebarNav({ onLogout, companyName = 'Jackisa Office' }: SidebarNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-sidebar-primary flex items-center justify-between px-4 z-40 border-b border-sidebar-border">
        <div className="text-sidebar-primary-foreground font-bold">{companyName}</div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-sidebar-primary-foreground"
        >
          {mobileOpen ? <X /> : <Menu />}
        </Button>
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 bottom-0 w-64 bg-sidebar-primary border-r border-sidebar-border flex flex-col z-40',
          'transition-transform lg:translate-x-0 lg:static',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="p-6 hidden lg:block">
          <div className="space-y-1">
            <h1 className="text-sidebar-primary-foreground font-bold text-lg">Jackisa Office</h1>
            <p className="text-sidebar-accent-foreground text-xs">{companyName}</p>
          </div>
        </div>

        {/* Mobile Logo */}
        <div className="p-4 lg:hidden border-b border-sidebar-border">
          <h1 className="text-sidebar-primary-foreground font-bold">Jackisa Office</h1>
          <p className="text-sidebar-accent-foreground text-xs">{companyName}</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
          {navItems.map((item) => (
            <NavItemComponent 
              key={item.label} 
              item={item}
              onExpandChange={() => setMobileOpen(false)}
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border space-y-2">
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => {
              onLogout?.()
              setMobileOpen(false)
            }}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content Spacer */}
      <div className="lg:hidden h-16" />
    </>
  )
}
