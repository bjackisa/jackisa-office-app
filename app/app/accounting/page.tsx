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

  const cards = [
    { label: 'Total Revenue', value: formatUGX(stats.revenue), sub: 'Collected from paid invoices', icon: DollarSign, color: 'bg-green-500' },
  ]

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Accounting</h1>
        <p className="text-muted-foreground text-sm mt-1">Financial overview and management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="p-5 hover-lift">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold text-foreground tracking-tight mb-0.5 tracking-tight">{stat.value}</p>
                  <p className="text-xs text-muted-foreground font-medium">{stat.sub}</p>
                </div>
                <div className={`p-2.5 rounded-2xl ${stat.bg}`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="divide-y divide-border/30">
            <Link href="/app/accounting/invoices"><Button className="w-full justify-start" variant="outline">+ Create Invoice</Button></Link>
            <Link href="/app/accounting/expenses"><Button className="w-full justify-start" variant="outline">+ Record Expense</Button></Link>
            <Link href="/app/accounting/credit-notes"><Button className="w-full justify-start" variant="outline">+ View Credit Notes</Button></Link>
            <Link href="/app/accounting/vat"><Button className="w-full justify-start" variant="outline">+ Calculate VAT</Button></Link>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <h2 className="text-lg font-semibold text-foreground mb-4">Recent Invoices</h2>
          {recentInvoices.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3"><FileText className="w-6 h-6 text-muted-foreground/30" /></div>
              <p className="text-sm text-muted-foreground">No recent invoices</p>
            </div>
          ) : (
            recentInvoices.map((invoice) => (
              <div key={invoice.id} className="px-6 py-3.5 flex items-center justify-between hover:bg-muted/30 transition-colors duration-200">
                <div>
                  <p className="text-sm font-semibold text-foreground">{invoice.invoice_number}</p>
                  <p className="text-xs text-muted-foreground/60">{invoice.customer_name}</p>
                </div>
                <p className="text-sm font-medium text-foreground">{formatUGX(invoice.total_amount || 0)}</p>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  )
}
