'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { DollarSign, FileText, TrendingUp, AlertCircle } from 'lucide-react'

export default function AccountingDashboard() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    revenue: 0,
    expenses: 0,
    margin: 0,
    outstandingCount: 0,
    outstandingAmount: 0,
  })
  const [recentInvoices, setRecentInvoices] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        const ctx = await getSessionContext()
        if (!ctx?.companyId) return

        const [invRes, expRes] = await Promise.all([
          supabase
            .from('invoices')
            .select('id, invoice_number, customer_name, total_amount, paid_amount, status, created_at')
            .eq('company_id', ctx.companyId)
            .order('created_at', { ascending: false }),
          supabase
            .from('expenses')
            .select('amount')
            .eq('company_id', ctx.companyId),
        ])

        const invoices = invRes.data || []
        const expensesRows = expRes.data || []

        const revenue = invoices
          .filter((i) => ['paid', 'partially_paid'].includes(i.status))
          .reduce((s, i) => s + Number(i.paid_amount || 0), 0)

        const totalExpenses = expensesRows.reduce((s, e) => s + Number(e.amount || 0), 0)
        const profit = revenue - totalExpenses

        const outstanding = invoices.filter((i) => ['sent', 'overdue', 'partially_paid'].includes(i.status))
        const outstandingAmount = outstanding.reduce(
          (s, i) => s + Math.max(Number(i.total_amount || 0) - Number(i.paid_amount || 0), 0),
          0
        )

        setStats({
          revenue,
          expenses: totalExpenses,
          margin: revenue > 0 ? (profit / revenue) * 100 : 0,
          outstandingCount: outstanding.length,
          outstandingAmount,
        })

        setRecentInvoices(invoices.slice(0, 6))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const formatUGX = (n: number) => `UGX ${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Accounting</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Financial overview and management</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger-children">
        {[
          { label: 'Total Revenue', value: formatUGX(stats.revenue), icon: DollarSign, gradient: 'from-emerald-500 to-green-600' },
          { label: 'Total Expenses', value: formatUGX(stats.expenses), icon: TrendingUp, gradient: 'from-red-500 to-rose-600' },
          { label: 'Profit Margin', value: `${stats.margin.toFixed(1)}%`, icon: TrendingUp, gradient: 'from-blue-500 to-blue-600' },
          { label: 'Outstanding', value: formatUGX(stats.outstandingAmount), icon: AlertCircle, gradient: 'from-amber-500 to-orange-500' },
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
              { href: '/app/accounting/invoices', label: 'Create Invoice', icon: FileText, desc: 'Generate a new invoice' },
              { href: '/app/accounting/expenses', label: 'Record Expense', icon: DollarSign, desc: 'Log a business expense' },
              { href: '/app/accounting/credit-notes', label: 'Credit Notes', icon: FileText, desc: 'View and manage credits' },
              { href: '/app/accounting/vat', label: 'VAT Calculator', icon: TrendingUp, desc: 'Calculate and track VAT' },
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
            <h2 className="text-sm font-semibold text-foreground">Recent Invoices</h2>
            <Link href="/app/accounting/invoices" className="text-xs text-primary font-medium hover:text-primary/80 transition-colors">View all</Link>
          </div>
          {recentInvoices.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-6 h-6 text-muted-foreground/25" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">No recent invoices</p>
              <p className="text-xs text-muted-foreground/40 mt-1">Create your first invoice to see it here</p>
            </div>
          ) : (
            <div>
              {recentInvoices.map((invoice) => (
                <div key={invoice.id} className="px-5 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors duration-200 border-b border-border/10 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{invoice.invoice_number}</p>
                    <p className="text-[11px] text-muted-foreground/50">{invoice.customer_name}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-sm font-bold text-foreground font-mono tabular-nums">{formatUGX(invoice.total_amount || 0)}</p>
                    <span className={`badge text-[10px] ${
                      invoice.status === 'paid' ? 'badge-success' :
                      invoice.status === 'overdue' ? 'badge-danger' :
                      invoice.status === 'sent' ? 'badge-info' : 'badge-neutral'
                    }`}>{invoice.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
