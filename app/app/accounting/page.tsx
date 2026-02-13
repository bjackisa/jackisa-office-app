'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DollarSign, FileText, TrendingUp, AlertCircle } from 'lucide-react'

export default function AccountingDashboard() {
  const stats = [
    { label: 'Total Revenue', value: '$45,230', change: '+12.5%', icon: DollarSign, color: 'bg-green-500' },
    { label: 'Total Expenses', value: '$12,340', change: '-3.2%', icon: FileText, color: 'bg-red-500' },
    { label: 'Profit Margin', value: '72.7%', change: '+5.1%', icon: TrendingUp, color: 'bg-blue-500' },
    { label: 'Outstanding Invoices', value: '8', change: 'Pending', icon: AlertCircle, color: 'bg-orange-500' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Accounting Dashboard</h1>
        <p className="text-muted-foreground">Manage invoices, expenses, and financial records</p>
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
                  <p className="text-xs text-muted-foreground mt-2">{stat.change}</p>
                </div>
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Button className="w-full justify-start" variant="outline">+ Create Invoice</Button>
            <Button className="w-full justify-start" variant="outline">+ Record Expense</Button>
            <Button className="w-full justify-start" variant="outline">+ View Credit Notes</Button>
            <Button className="w-full justify-start" variant="outline">+ Calculate VAT</Button>
          </div>
        </Card>

        <Card className="p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Recent Invoices</h2>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between pb-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">Invoice #{1000 + i}</p>
                  <p className="text-xs text-muted-foreground">Customer Name</p>
                </div>
                <p className="text-sm font-medium text-foreground">$1,200</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
