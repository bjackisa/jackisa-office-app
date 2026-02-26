'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Plus, Download, Eye, DollarSign, Users, Calculator,
  Banknote, TrendingDown, CheckCircle, Clock, ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

const NSSF_RATE = 0.05
const PAYE_BANDS = [
  { lower: 0, upper: 235000, rate: 0.00 },
  { lower: 235000, upper: 335000, rate: 0.10 },
  { lower: 335000, upper: 410000, rate: 0.20 },
  { lower: 410000, upper: 10000000, rate: 0.30 },
  { lower: 10000000, upper: Infinity, rate: 0.40 },
]

function calcPAYE(gross: number) {
  const nssf = gross * NSSF_RATE
  const taxable = gross - nssf
  let remaining = taxable
  let paye = 0
  for (const band of PAYE_BANDS) {
    if (remaining <= 0) break
    const width = band.upper === Infinity ? remaining : band.upper - band.lower
    const amt = Math.min(remaining, width)
    paye += amt * band.rate
    remaining -= amt
  }
  return { nssf, paye, net: gross - nssf - paye }
}

const statusCfg: Record<string, { label: string; bg: string; text: string; border: string }> = {
  draft: { label: 'Draft', bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
  processing: { label: 'Processing', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
  processed: { label: 'Processed', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  completed: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  pending: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
}

export default function PayrollPage() {
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const context = await getSessionContext()
      if (!context?.companyId) return
      setCompanyId(context.companyId)

      const { data: emps } = await supabase
          .from('company_employees')
          .select('id, salary, users(full_name), company_roles(name)')
          .eq('company_id', context.companyId)
          .eq('status', 'active')

      setEmployees(emps || [])
    } catch (err) {
      console.error('Failed to load payroll data:', err)
    } finally {
      setLoading(false)
    }
  }

  const payrollData = employees.map(emp => {
    const gross = emp.salary || 0
    const { nssf, paye, net } = calcPAYE(gross)
    return { ...emp, gross, nssf, paye, net }
  })

  const totals = payrollData.reduce(
    (acc, e) => ({
      gross: acc.gross + e.gross,
      nssf: acc.nssf + e.nssf,
      paye: acc.paye + e.paye,
      net: acc.net + e.net,
    }),
    { gross: 0, nssf: 0, paye: 0, net: 0 }
  )

  const formatUGX = (n: number) => `UGX ${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`

  const now = new Date()
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Payroll Management</h1>
          <p className="text-sm text-gray-500">Process salaries with automatic PAYE & NSSF calculations</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/app/hr/paye">
            <Button variant="outline" size="sm" className="text-gray-600">
              <Calculator className="w-4 h-4 mr-1.5" />
              PAYE Calculator
            </Button>
          </Link>
          <Button variant="outline" size="sm" className="text-gray-600">
            <Download className="w-4 h-4 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Gross', value: formatUGX(totals.gross), icon: DollarSign, color: 'text-gray-900', bg: 'bg-gray-50' },
          { label: 'NSSF (5%)', value: formatUGX(totals.nssf), icon: TrendingDown, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'PAYE Tax', value: formatUGX(totals.paye), icon: Banknote, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Total Net Pay', value: formatUGX(totals.net), icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(stat => (
          <Card key={stat.label} className="p-4 border border-gray-200/60 bg-white">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-gray-900 truncate">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Current Period */}
      <Card className="border border-blue-200 bg-blue-50/30 p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">{monthName} Payroll</h3>
              <p className="text-xs text-gray-500">{employees.length} active employees &middot; Auto-calculated PAYE &amp; NSSF</p>
            </div>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
            Current Period
          </span>
        </div>
      </Card>

      {/* Payroll Table */}
      <Card className="border border-gray-200/60 bg-white overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Employee Payroll Breakdown</h3>
          <span className="text-xs text-gray-400">{employees.length} employees</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Gross Salary</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">NSSF (5%)</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">PAYE Tax</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-400">Loading payroll data...</td></tr>
              ) : payrollData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <Users className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400 font-medium">No employees with salary data</p>
                    <p className="text-xs text-gray-300 mt-1">Add employees and set their salaries to generate payroll</p>
                  </td>
                </tr>
              ) : (
                payrollData.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
                          {(emp.users?.full_name || '?')[0].toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-gray-900">{emp.users?.full_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">{emp.company_roles?.name || '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-900 text-right font-mono font-medium">{formatUGX(emp.gross)}</td>
                    <td className="px-5 py-3 text-sm text-amber-600 text-right font-mono">-{formatUGX(emp.nssf)}</td>
                    <td className="px-5 py-3 text-sm text-red-500 text-right font-mono">-{formatUGX(emp.paye)}</td>
                    <td className="px-5 py-3 text-sm font-bold text-emerald-600 text-right font-mono">{formatUGX(emp.net)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {payrollData.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-5 py-3 text-sm font-semibold text-gray-800" colSpan={2}>Totals</td>
                  <td className="px-5 py-3 text-sm font-bold text-gray-900 text-right font-mono">{formatUGX(totals.gross)}</td>
                  <td className="px-5 py-3 text-sm font-bold text-amber-600 text-right font-mono">-{formatUGX(totals.nssf)}</td>
                  <td className="px-5 py-3 text-sm font-bold text-red-500 text-right font-mono">-{formatUGX(totals.paye)}</td>
                  <td className="px-5 py-3 text-sm font-bold text-emerald-600 text-right font-mono">{formatUGX(totals.net)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Tax Bands Reference */}
      <Card className="border border-gray-200/60 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-800">Uganda PAYE Tax Bands</h3>
          <Link href="/app/hr/paye" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
            Open Calculator <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            {PAYE_BANDS.map((band, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-600">
                  {formatUGX(band.lower)} — {band.upper === Infinity ? '∞' : formatUGX(band.upper)}
                </span>
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
          <div className="space-y-3">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-700 font-medium">NSSF Employee Contribution</p>
              <p className="text-xs text-gray-500 mt-0.5">5% of gross salary deducted before PAYE calculation</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-700 font-medium">Net Pay Formula</p>
              <p className="text-xs text-gray-500 mt-0.5 font-mono">Net = Gross - NSSF - PAYE</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
