'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Download, Eye, DollarSign } from 'lucide-react'

export default function PayrollPage() {
  const [payrolls] = useState([
    {
      id: '1',
      month: 'February 2024',
      period: '2024-02-01 to 2024-02-29',
      status: 'processed',
      employeeCount: 3,
      totalGross: 3850000,
      totalNSSF: 192500,
      totalPAYE: 352500,
      totalNet: 3305000,
      processedDate: '2024-02-28',
    },
    {
      id: '2',
      month: 'January 2024',
      period: '2024-01-01 to 2024-01-31',
      status: 'completed',
      employeeCount: 3,
      totalGross: 3650000,
      totalNSSF: 182500,
      totalPAYE: 325000,
      totalNet: 3142500,
      processedDate: '2024-01-31',
    },
  ])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processed':
        return 'bg-blue-100 text-blue-800'
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Payroll Management</h1>
          <p className="text-muted-foreground">Process salaries and manage payroll records</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Payroll Period
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Total Gross (Current)</p>
          <p className="text-2xl font-bold text-foreground">UGX 3.85M</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Total Net Pay</p>
          <p className="text-2xl font-bold text-green-600">UGX 3.31M</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">NSSF Deductions</p>
          <p className="text-2xl font-bold text-orange-600">UGX 192.5K</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">PAYE Tax</p>
          <p className="text-2xl font-bold text-red-600">UGX 352.5K</p>
        </Card>
      </div>

      {/* Current Payroll Info */}
      <Card className="p-6 border border-border mb-8 bg-gradient-to-br from-primary/5 to-transparent">
        <h2 className="text-lg font-semibold text-foreground mb-4">February 2024 Payroll Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-card rounded-lg border border-border">
            <p className="text-xs text-muted-foreground mb-1">Employees</p>
            <p className="text-2xl font-bold text-foreground">3</p>
          </div>
          <div className="p-4 bg-card rounded-lg border border-border">
            <p className="text-xs text-muted-foreground mb-1">Total Gross Salary</p>
            <p className="text-lg font-bold text-foreground">UGX 3.85M</p>
          </div>
          <div className="p-4 bg-card rounded-lg border border-border">
            <p className="text-xs text-muted-foreground mb-1">Total Deductions</p>
            <p className="text-lg font-bold text-red-600">UGX 545K</p>
          </div>
          <div className="p-4 bg-card rounded-lg border border-primary bg-primary/5">
            <p className="text-xs text-muted-foreground mb-1">Total Net Pay</p>
            <p className="text-lg font-bold text-primary">UGX 3.31M</p>
          </div>
        </div>
      </Card>

      {/* Payroll Records Table */}
      <Card className="border border-border overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Period</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-foreground">Employees</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-foreground">Gross Salary</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-foreground">NSSF (5%)</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-foreground">PAYE Tax</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-foreground">Net Pay</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Status</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payrolls.map((payroll) => (
                <tr key={payroll.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-foreground">{payroll.month}</td>
                  <td className="px-6 py-4 text-sm text-center text-foreground">{payroll.employeeCount}</td>
                  <td className="px-6 py-4 text-sm text-right font-medium text-foreground">UGX {(payroll.totalGross / 1000000).toFixed(2)}M</td>
                  <td className="px-6 py-4 text-sm text-right text-orange-600">UGX {(payroll.totalNSSF / 1000).toFixed(1)}K</td>
                  <td className="px-6 py-4 text-sm text-right text-red-600">UGX {(payroll.totalPAYE / 1000).toFixed(1)}K</td>
                  <td className="px-6 py-4 text-sm text-right font-bold text-green-600">UGX {(payroll.totalNet / 1000000).toFixed(2)}M</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(payroll.status)}`}>
                      {payroll.status.charAt(0).toUpperCase() + payroll.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button className="p-1.5 hover:bg-muted rounded-md transition-colors" title="View details">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button className="p-1.5 hover:bg-muted rounded-md transition-colors" title="Download">
                        <Download className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Payroll Calculation Info */}
      <Card className="p-6 border border-border">
        <h2 className="text-lg font-semibold text-foreground mb-4">Payroll Calculation Breakdown</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-medium text-foreground mb-3">Deductions</h3>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-foreground">NSSF Contribution: <span className="font-mono">5% of Gross Salary</span></p>
              <p className="text-xs text-muted-foreground mt-1">Employee social security</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-foreground">PAYE Tax: <span className="font-mono">Progressive Tax Bands</span></p>
              <p className="text-xs text-muted-foreground mt-1">Based on Uganda tax rates</p>
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="font-medium text-foreground mb-3">Uganda PAYE Tax Bands 2024</h3>
            <div className="p-3 bg-muted/50 rounded-lg space-y-2 text-sm">
              <p>UGX 0 - 235,000: <span className="font-mono text-primary">0%</span></p>
              <p>UGX 235,001 - 335,000: <span className="font-mono text-primary">10%</span></p>
              <p>UGX 335,001 - 410,000: <span className="font-mono text-primary">20%</span></p>
              <p>UGX 410,001+: <span className="font-mono text-primary">30-40%</span></p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
