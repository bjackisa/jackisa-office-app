'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ShoppingCart, TrendingUp, Users, DollarSign } from 'lucide-react'

export default function SalesDashboard() {
  const stats = [
    { label: 'Total Sales', value: '$98,456', change: '+24.5%', icon: ShoppingCart, color: 'bg-green-500' },
    { label: 'Orders This Month', value: '42', change: '+12%', icon: TrendingUp, color: 'bg-blue-500' },
    { label: 'Active Commissions', value: '18', change: 'Pending', icon: Users, color: 'bg-purple-500' },
    { label: 'Revenue Target', value: '85%', change: 'On Track', icon: DollarSign, color: 'bg-orange-500' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Sales & Marketing</h1>
        <p className="text-muted-foreground">Track sales, commissions, and affiliate programs</p>
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

      {/* Main Content */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Button className="w-full justify-start" variant="outline">+ Create Sales Order</Button>
            <Button className="w-full justify-start" variant="outline">+ Process Commission</Button>
            <Button className="w-full justify-start" variant="outline">+ Manage Affiliates</Button>
            <Button className="w-full justify-start" variant="outline">+ View Reports</Button>
          </div>
        </Card>

        <Card className="p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Top Sales</h2>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between pb-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">Salesperson {i}</p>
                  <p className="text-xs text-muted-foreground">12 orders</p>
                </div>
                <p className="text-sm font-medium text-foreground">${24000 * i}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
