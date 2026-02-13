'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Download, Eye } from 'lucide-react'

export default function VATPage() {
  const [records] = useState([
    {
      id: '1',
      period: 'January 2024',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      sales: 10000000,
      purchases: 4000000,
      rate: 18,
      status: 'submitted',
    },
    {
      id: '2',
      period: 'February 2024',
      startDate: '2024-02-01',
      endDate: '2024-02-29',
      sales: 12500000,
      purchases: 5200000,
      rate: 18,
      status: 'draft',
    },
  ])

  const calculateVAT = (sales: number, purchases: number, rate: number) => {
    const outputVAT = (sales * rate) / 100
    const inputVAT = (purchases * rate) / 100
    return {
      outputVAT,
      inputVAT,
      netVAT: outputVAT - inputVAT,
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">VAT Management</h1>
          <p className="text-muted-foreground">Calculate and track VAT for Uganda (18% rate)</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New VAT Period
        </Button>
      </div>

      {/* Current Period Summary */}
      <Card className="p-6 border border-border mb-8 bg-gradient-to-br from-primary/5 to-transparent">
        <h2 className="text-lg font-semibold text-foreground mb-6">Current Period Summary (February 2024)</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {(() => {
            const record = records[1]
            const vat = calculateVAT(record.sales, record.purchases, record.rate)
            return (
              <>
                <div className="p-4 bg-card rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Total Sales</p>
                  <p className="text-xl font-bold text-foreground">UGX {(record.sales / 1000000).toFixed(1)}M</p>
                </div>
                <div className="p-4 bg-card rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Output VAT (18%)</p>
                  <p className="text-xl font-bold text-blue-600">UGX {(vat.outputVAT / 1000000).toFixed(2)}M</p>
                </div>
                <div className="p-4 bg-card rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Total Purchases</p>
                  <p className="text-xl font-bold text-foreground">UGX {(record.purchases / 1000000).toFixed(1)}M</p>
                </div>
                <div className="p-4 bg-card rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Input VAT (18%)</p>
                  <p className="text-xl font-bold text-green-600">UGX {(vat.inputVAT / 1000000).toFixed(2)}M</p>
                </div>
                <div className="p-4 bg-card rounded-lg border border-primary bg-primary/5">
                  <p className="text-xs text-muted-foreground mb-1">Net VAT Payable</p>
                  <p className="text-xl font-bold text-primary">UGX {(vat.netVAT / 1000000).toFixed(2)}M</p>
                </div>
              </>
            )
          })()}
        </div>
      </Card>

      {/* VAT Calculation Formula */}
      <Card className="p-6 border border-border mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">VAT Calculation Formula</h2>
        <div className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-foreground mb-2"><span className="font-mono">Output VAT = Total Sales × 18%</span></p>
            <p className="text-xs text-muted-foreground">VAT charged on sales to customers</p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-foreground mb-2"><span className="font-mono">Input VAT = Total Purchases × 18%</span></p>
            <p className="text-xs text-muted-foreground">VAT paid on purchases for business use</p>
          </div>
          <div className="p-4 bg-primary/5 border border-primary rounded-lg">
            <p className="text-sm text-foreground mb-2"><span className="font-mono font-semibold">Net VAT = Output VAT - Input VAT</span></p>
            <p className="text-xs text-muted-foreground">Amount payable to URA (if positive) or refund (if negative)</p>
          </div>
        </div>
      </Card>

      {/* VAT Records */}
      <Card className="border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Period</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-foreground">Sales</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-foreground">Output VAT</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-foreground">Purchases</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-foreground">Input VAT</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-foreground">Net VAT</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Status</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((record) => {
                const vat = calculateVAT(record.sales, record.purchases, record.rate)
                return (
                  <tr key={record.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-foreground">{record.period}</td>
                    <td className="px-6 py-4 text-sm text-right text-foreground">UGX {(record.sales / 1000000).toFixed(1)}M</td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-blue-600">UGX {(vat.outputVAT / 1000000).toFixed(2)}M</td>
                    <td className="px-6 py-4 text-sm text-right text-foreground">UGX {(record.purchases / 1000000).toFixed(1)}M</td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-green-600">UGX {(vat.inputVAT / 1000000).toFixed(2)}M</td>
                    <td className="px-6 py-4 text-sm text-right font-bold text-primary">UGX {(vat.netVAT / 1000000).toFixed(2)}M</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        record.status === 'submitted'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
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
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Uganda VAT Notes */}
      <Card className="mt-6 p-4 border border-border bg-blue-50 dark:bg-blue-950/30">
        <p className="text-sm text-foreground mb-2"><span className="font-semibold">Note:</span> This VAT calculator is based on Uganda Revenue Authority (URA) guidelines.</p>
        <p className="text-xs text-muted-foreground">Standard VAT rate: 18% | Exemptions apply to certain goods and services</p>
      </Card>
    </div>
  )
}
