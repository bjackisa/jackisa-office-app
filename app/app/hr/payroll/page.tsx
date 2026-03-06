'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Plus, Download, Search, Eye, DollarSign, Users, Calculator,
  Banknote, TrendingDown, CheckCircle, Clock, ArrowRight, Landmark, Zap,
} from 'lucide-react'
import Link from 'next/link'
import { logEcosystemEvent, autoContributeFromPayroll } from '@/lib/ecosystem'

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
  draft: { label: 'Draft', bg: 'bg-muted/50', text: 'text-muted-foreground', border: 'border-border' },
  processing: { label: 'Processing', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
  processed: { label: 'Processed', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  completed: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  pending: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
}

export default function PayrollPage() {
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [ecosystemMsg, setEcosystemMsg] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const context = await getSessionContext()
      if (!context?.companyId) return
      setCompanyId(context.companyId)
      setUserId(context.userId)

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

  const processPayroll = async () => {
    if (!companyId || !userId || payrollData.length === 0) return
    setProcessing(true)
    let totalContributed = 0
    let contributorCount = 0

    for (const emp of payrollData) {
      const result = await autoContributeFromPayroll({
        companyId,
        employeeId: emp.id,
        netPay: emp.net,
        userId,
      })
      if (result) {
        totalContributed += result.grossContrib
        contributorCount++
      }
    }

    await logEcosystemEvent({
      companyId,
      eventType: 'payroll_processed',
      sourceTable: 'company_employees',
      sourceId: companyId,
      payload: { employee_count: payrollData.length, total_gross: totals.gross, total_net: totals.net, fund_contributions: totalContributed },
    })

    if (contributorCount > 0) {
      setEcosystemMsg(`Payroll processed. ${contributorCount} employee(s) auto-contributed UGX ${totalContributed.toLocaleString()} to the fund from their net pay.`)
    } else {
      setEcosystemMsg(`Payroll processed for ${payrollData.length} employees. No auto-contributions configured yet — employees can opt-in via their investment portfolio.`)
    }
    setTimeout(() => setEcosystemMsg(null), 8000)
    setProcessing(false)
  }

  const now = new Date()
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' })

  const departments = [...new Set(employees.map(emp => emp.department).filter(Boolean))]
  const filteredPayrollData = payrollData.filter((emp) => {
    const matchSearch = !searchQuery || emp.employee?.users?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchDept = !departmentFilter || emp.employee?.department === departmentFilter
    return matchSearch && matchDept
  })

  const exportPayroll = () => {
    const headers = ['employee_name', 'role', 'gross_salary', 'nssf', 'paye', 'net_pay']
    const rows = filteredPayrollData.map((emp) => [
      emp.users?.full_name || '',
      emp.company_roles?.name || '',
      emp.gross,
      emp.nssf,
      emp.paye,
      emp.net,
    ].map((value) => JSON.stringify(value ?? '')).join(','))

    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `payroll-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight mb-1">Payroll Management</h1>
          <p className="text-sm text-muted-foreground">Process salaries with automatic PAYE & NSSF calculations</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/app/hr/paye">
            <Button variant="outline" size="sm" className="text-muted-foreground">
              <Calculator className="w-4 h-4 mr-1.5" />
              PAYE Calculator
            </Button>
          </Link>
          <Button variant="outline" size="sm" className="text-muted-foreground" onClick={exportPayroll}>
            <Download className="w-4 h-4 mr-1.5" />
            Export
          </Button>
          <Button size="sm" onClick={processPayroll} disabled={processing || payrollData.length === 0}>
            <Landmark className="w-4 h-4 mr-1.5" />
            {processing ? 'Processing...' : 'Process Payroll'}
          </Button>
        </div>
      </div>

      {ecosystemMsg && (
        <Card className="mb-6 p-3 border-emerald-200 bg-emerald-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-100"><Landmark className="w-3.5 h-3.5 text-emerald-600" /></div>
            <p className="text-xs font-medium text-emerald-700">{ecosystemMsg}</p>
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Gross', value: formatUGX(totals.gross), icon: DollarSign, color: 'text-foreground', bg: 'bg-muted/50' },
          { label: 'NSSF (5%)', value: formatUGX(totals.nssf), icon: TrendingDown, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'PAYE Tax', value: formatUGX(totals.paye), icon: Banknote, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Total Net Pay', value: formatUGX(totals.net), icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(stat => (
          <Card key={stat.label} className="p-4 border border-border/50 bg-card">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-foreground truncate">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Current Period */}
      <Card className="border border-primary/20 bg-primary/[0.04] p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-100">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{monthName} Payroll</h3>
              <p className="text-xs text-muted-foreground">{employees.length} active employees &middot; Auto-calculated PAYE &amp; NSSF</p>
            </div>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
            Current Period
          </span>
        </div>
      </Card>

      {/* Payroll Table */}
      <Card className="border border-border/50 bg-card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Employee Payroll Breakdown</h3>
          <span className="text-xs text-muted-foreground/60">{employees.length} employees</span>
        </div>
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr className="border-b border-border/30 bg-muted/30">
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employee</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gross Salary</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">NSSF (5%)</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">PAYE Tax</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Pay</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground/60">Loading payroll data...</td></tr>
              ) : filteredPayrollData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground/60 font-medium">No employees with salary data</p>
                    <p className="text-xs text-muted-foreground/40 mt-1">Add employees and set their salaries to generate payroll</p>
                  </td>
                </tr>
              ) : (
                filteredPayrollData.map((emp) => (
                  <tr key={emp.id} className="group">
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
                          {(emp.users?.full_name || '?')[0].toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-foreground">{emp.users?.full_name || '—'}</span>
                      </div>
                    </td>
                    <td className="text-muted-foreground">{emp.company_roles?.name || '—'}</td>
                    <td className="px-5 py-3 text-sm text-foreground text-right font-mono font-medium">{formatUGX(emp.gross)}</td>
                    <td className="px-5 py-3 text-sm text-amber-600 text-right font-mono">-{formatUGX(emp.nssf)}</td>
                    <td className="px-5 py-3 text-sm text-red-500 text-right font-mono">-{formatUGX(emp.paye)}</td>
                    <td className="px-5 py-3 text-sm font-bold text-emerald-600 text-right font-mono">{formatUGX(emp.net)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {payrollData.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/50">
                  <td className="px-5 py-3 text-sm font-semibold text-foreground" colSpan={2}>Totals</td>
                  <td className="px-5 py-3 text-sm font-bold text-foreground text-right font-mono">{formatUGX(totals.gross)}</td>
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
      <Card className="border border-border/50 bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Uganda PAYE Tax Bands</h3>
          <Link href="/app/hr/paye" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
            Open Calculator <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            {PAYE_BANDS.map((band, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                <span className="text-xs text-muted-foreground">
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
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-foreground font-medium">NSSF Employee Contribution</p>
              <p className="text-xs text-muted-foreground mt-0.5">5% of gross salary deducted before PAYE calculation</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-foreground font-medium">Net Pay Formula</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">Net = Gross - NSSF - PAYE</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
