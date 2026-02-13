'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Download, Eye, Trash2 } from 'lucide-react'

export default function ExpensesPage() {
  const [expenses] = useState([
    {
      id: '1',
      description: 'Office Supplies',
      category: 'supplies',
      amount: 450,
      date: '2024-02-10',
      status: 'approved',
    },
    {
      id: '2',
      description: 'Internet Bill',
      category: 'utilities',
      amount: 150,
      date: '2024-02-08',
      status: 'approved',
    },
    {
      id: '3',
      description: 'Conference Registration',
      category: 'travel',
      amount: 1200,
      date: '2024-02-05',
      status: 'pending',
    },
    {
      id: '4',
      description: 'Equipment Maintenance',
      category: 'equipment',
      amount: 800,
      date: '2024-02-01',
      status: 'pending',
    },
  ])

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      utilities: 'bg-yellow-100 text-yellow-800',
      salaries: 'bg-red-100 text-red-800',
      rent: 'bg-blue-100 text-blue-800',
      equipment: 'bg-purple-100 text-purple-800',
      travel: 'bg-green-100 text-green-800',
      supplies: 'bg-indigo-100 text-indigo-800',
      marketing: 'bg-pink-100 text-pink-800',
      maintenance: 'bg-orange-100 text-orange-800',
      other: 'bg-gray-100 text-gray-800',
    }
    return colors[category] || colors.other
  }

  const getStatusColor = (status: string) => {
    return status === 'approved'
      ? 'bg-green-100 text-green-800'
      : 'bg-yellow-100 text-yellow-800'
  }

  const totalByCategory: Record<string, number> = {}
  expenses.forEach((expense) => {
    totalByCategory[expense.category] = (totalByCategory[expense.category] || 0) + expense.amount
  })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Expenses</h1>
          <p className="text-muted-foreground">Track and manage company expenses</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Expense
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Total Expenses</p>
          <p className="text-2xl font-bold text-foreground">UGX 2,600</p>
          <p className="text-xs text-muted-foreground mt-2">This month</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Approved</p>
          <p className="text-2xl font-bold text-green-600">UGX 600</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">UGX 2,000</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Categories</p>
          <p className="text-2xl font-bold text-foreground">{Object.keys(totalByCategory).length}</p>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="p-4 border border-border mb-6 flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search expenses..."
            className="pl-10"
          />
        </div>
        <select className="px-3 py-2 border border-border rounded-md text-sm">
          <option value="">All Categories</option>
          <option value="utilities">Utilities</option>
          <option value="salaries">Salaries</option>
          <option value="supplies">Supplies</option>
          <option value="travel">Travel</option>
        </select>
        <Button variant="outline">Export</Button>
      </Card>

      {/* Expenses Table */}
      <Card className="border border-border overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Description</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Category</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Date</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-foreground">Amount</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Status</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {expenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-foreground">{expense.description}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(expense.category)}`}>
                      {expense.category.charAt(0).toUpperCase() + expense.category.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{new Date(expense.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm font-medium text-foreground text-right">UGX {expense.amount.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(expense.status)}`}>
                      {expense.status.charAt(0).toUpperCase() + expense.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
                        <Download className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Category Breakdown */}
      <Card className="p-6 border border-border">
        <h2 className="text-lg font-semibold text-foreground mb-4">Expense Breakdown by Category</h2>
        <div className="space-y-3">
          {Object.entries(totalByCategory).map(([category, total]) => (
            <div key={category} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${getCategoryColor(category).split(' ')[0]}`} />
                <span className="text-sm text-foreground capitalize">{category}</span>
              </div>
              <span className="text-sm font-medium text-foreground">UGX {total.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
