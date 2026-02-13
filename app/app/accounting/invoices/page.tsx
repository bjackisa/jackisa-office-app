'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Download, Eye, Trash2, FileText } from 'lucide-react'

export default function InvoicesPage() {
  const [invoices] = useState([
    {
      id: '1',
      number: 'INV-001',
      customer: 'Acme Corporation',
      amount: 5200,
      date: '2024-02-10',
      dueDate: '2024-03-10',
      status: 'paid',
    },
    {
      id: '2',
      number: 'INV-002',
      customer: 'Tech Solutions Ltd',
      amount: 3450,
      date: '2024-02-08',
      dueDate: '2024-02-28',
      status: 'pending',
    },
    {
      id: '3',
      number: 'INV-003',
      customer: 'Global Services',
      amount: 8900,
      date: '2024-02-05',
      dueDate: '2024-03-05',
      status: 'overdue',
    },
    {
      id: '4',
      number: 'INV-004',
      customer: 'Digital Inc',
      amount: 4200,
      date: '2024-02-01',
      dueDate: '2024-02-20',
      status: 'draft',
    },
  ])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800'
      case 'pending':
        return 'bg-blue-100 text-blue-800'
      case 'overdue':
        return 'bg-red-100 text-red-800'
      case 'draft':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Invoices</h1>
          <p className="text-muted-foreground">Create and manage customer invoices</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Invoice
        </Button>
      </div>

      {/* Filters & Search */}
      <Card className="p-4 border border-border mb-6 flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            className="pl-10"
          />
        </div>
        <select className="px-3 py-2 border border-border rounded-md text-sm">
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
        <Button variant="outline">Export</Button>
      </Card>

      {/* Invoices Table */}
      <Card className="border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Invoice #</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Customer</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Date</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Due Date</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-foreground">Amount</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Status</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-foreground">{invoice.number}</td>
                  <td className="px-6 py-4 text-sm text-foreground">{invoice.customer}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{new Date(invoice.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm font-medium text-foreground text-right">UGX {invoice.amount.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
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

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Total Invoices</p>
          <p className="text-2xl font-bold text-foreground">4</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Paid</p>
          <p className="text-2xl font-bold text-green-600">UGX 5,200</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Pending</p>
          <p className="text-2xl font-bold text-blue-600">UGX 3,450</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Overdue</p>
          <p className="text-2xl font-bold text-red-600">UGX 8,900</p>
        </Card>
      </div>
    </div>
  )
}
