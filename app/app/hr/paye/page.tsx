'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calculator, Download, Info, ArrowRight, Banknote } from 'lucide-react'
import type { PAYECalculation } from '@/types'

const NSSF_RATE = 0.05

const UGANDA_PAYE_BANDS = [
  { lower: 0, upper: 235000, rate: 0.00, description: 'Tax-free threshold' },
  { lower: 235000, upper: 335000, rate: 0.10, description: '10% band' },
  { lower: 335000, upper: 410000, rate: 0.20, description: '20% band' },
  { lower: 410000, upper: 10000000, rate: 0.30, description: '30% band' },
  { lower: 10000000, upper: Infinity, rate: 0.40, description: '40% band (excess)' },
]

function calculatePAYE(grossSalary: number): PAYECalculation {
  const nssfContribution = grossSalary * NSSF_RATE
  const taxableIncome = grossSalary - nssfContribution

  let remainingIncome = taxableIncome
  let totalPAYE = 0
  const bands: PAYECalculation['bands'] = []

  for (const band of UGANDA_PAYE_BANDS) {
    if (remainingIncome <= 0) break

    const bandWidth = band.upper === Infinity ? remainingIncome : band.upper - band.lower
    const taxableInBand = Math.min(remainingIncome, bandWidth)
    const taxForBand = taxableInBand * band.rate

    bands.push({
      bandDescription: band.description,
      taxableAmount: taxableInBand,
      rate: band.rate,
      tax: taxForBand,
    })

    totalPAYE += taxForBand
    remainingIncome -= taxableInBand
  }

  return {
    grossSalary,
    nssfContribution,
    taxableIncome,
    bands,
    totalPAYE,
    netPay: grossSalary - nssfContribution - totalPAYE,
  }
}

export default function PAYEPage() {
  const [grossSalary, setGrossSalary] = useState('')
  const [result, setResult] = useState<PAYECalculation | null>(null)

  const handleCalculate = () => {
    const salary = parseFloat(grossSalary)
    if (isNaN(salary) || salary <= 0) return
    setResult(calculatePAYE(salary))
  }

  const formatUGX = (amount: number) =>
    `UGX ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">PAYE & Tax Calculator</h1>
        <p className="text-sm text-gray-500">Calculate Pay As You Earn tax using Uganda Revenue Authority tax bands</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calculator Input */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border border-gray-200/60 bg-white p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="p-2 rounded-lg bg-blue-50">
                <Calculator className="w-4 h-4 text-blue-600" />
              </div>
              <h2 className="text-sm font-semibold text-gray-800">Salary Input</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Monthly Gross Salary (UGX)
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 2,500,000"
                  value={grossSalary}
                  onChange={(e) => setGrossSalary(e.target.value)}
                  className="bg-gray-50 border-gray-200 text-lg font-medium"
                  onKeyDown={(e) => e.key === 'Enter' && handleCalculate()}
                />
              </div>

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={handleCalculate}
                disabled={!grossSalary || parseFloat(grossSalary) <= 0}
              >
                <Calculator className="w-4 h-4 mr-2" />
                Calculate PAYE
              </Button>
            </div>

            {/* Quick Amounts */}
            <div className="mt-5 pt-5 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-2">Quick amounts</p>
              <div className="grid grid-cols-2 gap-2">
                {[500000, 1000000, 2500000, 5000000, 10000000, 15000000].map(amount => (
                  <button
                    key={amount}
                    onClick={() => {
                      setGrossSalary(amount.toString())
                      setResult(calculatePAYE(amount))
                    }}
                    className="px-3 py-2 text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200/60 transition-colors text-left"
                  >
                    {formatUGX(amount)}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Tax Bands Reference */}
          <Card className="border border-gray-200/60 bg-white p-6">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-gray-800">Uganda PAYE Tax Bands</h3>
            </div>
            <div className="space-y-2">
              {UGANDA_PAYE_BANDS.map((band, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-xs text-gray-700 font-medium">{band.description}</p>
                    <p className="text-[11px] text-gray-400">
                      {formatUGX(band.lower)} - {band.upper === Infinity ? '∞' : formatUGX(band.upper)}
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    band.rate === 0 ? 'bg-emerald-50 text-emerald-600' :
                    band.rate <= 0.1 ? 'bg-blue-50 text-blue-600' :
                    band.rate <= 0.2 ? 'bg-amber-50 text-amber-600' :
                    band.rate <= 0.3 ? 'bg-orange-50 text-orange-600' :
                    'bg-red-50 text-red-600'
                  }`}>
                    {(band.rate * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-[11px] text-gray-400">
                NSSF Employee Contribution: <span className="font-semibold text-gray-600">5%</span> of gross salary
              </p>
            </div>
          </Card>
        </div>

        {/* Results */}
        <div className="lg:col-span-2">
          {result ? (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Gross Salary', value: formatUGX(result.grossSalary), color: 'text-gray-900', bg: 'bg-gray-50' },
                  { label: 'NSSF (5%)', value: formatUGX(result.nssfContribution), color: 'text-amber-600', bg: 'bg-amber-50' },
                  { label: 'Total PAYE', value: formatUGX(result.totalPAYE), color: 'text-red-600', bg: 'bg-red-50' },
                  { label: 'Net Pay', value: formatUGX(result.netPay), color: 'text-emerald-600', bg: 'bg-emerald-50' },
                ].map(item => (
                  <Card key={item.label} className="border border-gray-200/60 bg-white p-4">
                    <p className="text-[11px] text-gray-500 mb-1">{item.label}</p>
                    <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                  </Card>
                ))}
              </div>

              {/* Detailed Breakdown */}
              <Card className="border border-gray-200/60 bg-white overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">Tax Breakdown</h3>
                  <Button variant="outline" size="sm" className="text-xs">
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Export PDF
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tax Band</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Taxable Amount</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Rate</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Tax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {result.bands.map((band, i) => (
                        <tr key={i} className="hover:bg-gray-50/50">
                          <td className="px-6 py-3 text-sm text-gray-700">{band.bandDescription}</td>
                          <td className="px-6 py-3 text-sm text-gray-600 text-right font-mono">{formatUGX(band.taxableAmount)}</td>
                          <td className="px-6 py-3 text-sm text-right">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              band.rate === 0 ? 'bg-emerald-50 text-emerald-600' :
                              band.rate <= 0.1 ? 'bg-blue-50 text-blue-600' :
                              band.rate <= 0.2 ? 'bg-amber-50 text-amber-600' :
                              'bg-red-50 text-red-600'
                            }`}>
                              {(band.rate * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-900 text-right font-mono font-medium">{formatUGX(band.tax)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50">
                        <td className="px-6 py-3 text-sm font-semibold text-gray-800" colSpan={3}>Total PAYE Tax</td>
                        <td className="px-6 py-3 text-sm font-bold text-red-600 text-right font-mono">{formatUGX(result.totalPAYE)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>

              {/* Payslip Summary */}
              <Card className="border border-gray-200/60 bg-white overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-800">Payslip Summary</h3>
                </div>
                <div className="p-6 space-y-3">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-600">Gross Monthly Salary</span>
                    <span className="text-sm font-medium text-gray-900 font-mono">{formatUGX(result.grossSalary)}</span>
                  </div>
                  <div className="border-t border-gray-100" />
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-600">Less: NSSF Employee Contribution (5%)</span>
                    <span className="text-sm font-medium text-red-500 font-mono">- {formatUGX(result.nssfContribution)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-600">Taxable Income</span>
                    <span className="text-sm font-medium text-gray-700 font-mono">{formatUGX(result.taxableIncome)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-600">Less: PAYE Tax</span>
                    <span className="text-sm font-medium text-red-500 font-mono">- {formatUGX(result.totalPAYE)}</span>
                  </div>
                  <div className="border-t-2 border-gray-200" />
                  <div className="flex items-center justify-between py-2">
                    <span className="text-base font-semibold text-gray-900">Net Monthly Pay</span>
                    <span className="text-xl font-bold text-emerald-600 font-mono">{formatUGX(result.netPay)}</span>
                  </div>
                  <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
                    <p className="text-xs text-blue-700">
                      <span className="font-semibold">Effective Tax Rate:</span>{' '}
                      {result.grossSalary > 0 ? ((result.totalPAYE / result.grossSalary) * 100).toFixed(1) : '0'}%
                      {' | '}
                      <span className="font-semibold">Total Deductions:</span>{' '}
                      {formatUGX(result.nssfContribution + result.totalPAYE)}
                      {' '}({result.grossSalary > 0 ? (((result.nssfContribution + result.totalPAYE) / result.grossSalary) * 100).toFixed(1) : '0'}%)
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <Card className="border border-gray-200/60 bg-white p-12 text-center">
              <div className="max-w-sm mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
                  <Banknote className="w-8 h-8 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">PAYE Tax Calculator</h3>
                <p className="text-sm text-gray-400 mb-6">
                  Enter a monthly gross salary to calculate PAYE tax, NSSF contributions, and net pay using Uganda&apos;s tax bands.
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                  <span className="px-2 py-1 bg-gray-50 rounded border border-gray-100">Enter salary</span>
                  <ArrowRight className="w-3 h-3" />
                  <span className="px-2 py-1 bg-gray-50 rounded border border-gray-100">Click Calculate</span>
                  <ArrowRight className="w-3 h-3" />
                  <span className="px-2 py-1 bg-gray-50 rounded border border-gray-100">View breakdown</span>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
