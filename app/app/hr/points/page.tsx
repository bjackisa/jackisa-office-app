'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Award,
  Plus,
  TrendingUp,
  ArrowUpCircle,
  ArrowDownCircle,
  Star,
  Target,
  Download,
  AlertTriangle,
} from 'lucide-react'
import { openTerminationLetterWindow } from '@/lib/hr-termination-letter'

export default function HRPointsPage() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [balances, setBalances] = useState<any[]>([])
  const [rules, setRules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'balances' | 'transactions' | 'rules'>('balances')
  const [showAwardForm, setShowAwardForm] = useState(false)
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [letterLoadingEmployeeId, setLetterLoadingEmployeeId] = useState<string | null>(null)

  const [awardForm, setAwardForm] = useState({ employeeId: '', ruleId: '', reason: '' })

  const [ruleForm, setRuleForm] = useState({
    category: '',
    indicator: '',
    actionType: 'gain' as 'gain' | 'loss',
    pointValue: '',
    description: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const context = await getSessionContext()
      if (!context?.companyId) return
      setCompanyId(context.companyId)

      const [txRes, balRes, rulesRes, empsRes] = await Promise.all([
        supabase
          .from('point_transactions')
          .select('*, company_employees(users(full_name)), point_rules(indicator)')
          .eq('company_id', context.companyId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('point_balances')
          .select('*, company_employees(users(full_name))')
          .eq('company_id', context.companyId)
          .order('period_year', { ascending: false })
          .order('period_month', { ascending: false })
          .limit(100),
        supabase
          .from('point_rules')
          .select('*')
          .eq('company_id', context.companyId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase.from('company_employees').select('id, employee_id_number, department, position, termination_date, users(full_name), status').eq('company_id', context.companyId),
      ])

      setTransactions(txRes.data || [])
      setBalances(balRes.data || [])
      setRules(rulesRes.data || [])
      setEmployees(empsRes.data || [])
    } catch (error) {
      console.error('Failed to load points data:', error)
    } finally {
      setLoading(false)
    }
  }

  const selectedRule = useMemo(() => rules.find((r: any) => r.id === awardForm.ruleId), [rules, awardForm.ruleId])

  const visibleBalances = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    const latestByEmployee = new Map<string, any>()
    for (const balance of balances) {
      if (!latestByEmployee.has(balance.employee_id)) {
        latestByEmployee.set(balance.employee_id, balance)
      }
    }

    return employees
      .map((employee: any) => {
        const existing = latestByEmployee.get(employee.id)
        if (existing) {
          const closingBalance = Number(existing.closing_balance ?? 30)
          const monetizablePoints = Math.max(0, Math.min(100, closingBalance) - 30)
          return {
            ...existing,
            company_employees: existing.company_employees || employee,
            period_month: existing.period_month ?? currentMonth,
            period_year: existing.period_year ?? currentYear,
            redeemable_points: monetizablePoints,
            redeemable_amount_ugx: monetizablePoints * 1000,
          }
        }

        return {
          id: `virtual-${employee.id}`,
          employee_id: employee.id,
          company_id: companyId,
          company_employees: employee,
          period_month: currentMonth,
          period_year: currentYear,
          opening_balance: 30,
          points_gained: 0,
          points_lost: 0,
          closing_balance: 30,
          redeemable_points: 0,
          redeemable_amount_ugx: 0,
          is_termination_flagged: employee.status === 'terminated',
        }
      })
      .sort((a, b) => (a.company_employees?.users?.full_name || '').localeCompare(b.company_employees?.users?.full_name || ''))
  }, [balances, companyId, employees])

  const awardableEmployees = useMemo(
    () => employees.filter((employee: any) => ['active', 'suspended'].includes(employee.status)),
    [employees]
  )

  const handleRecordPoints = async () => {
    if (!awardForm.employeeId || !awardForm.ruleId || !companyId) {
      setMessage({ type: 'error', text: 'Please select an employee and a point rule.' })
      return
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.user?.id) return

      const { error } = await supabase.rpc('record_point_event', {
        p_company_id: companyId,
        p_employee_id: awardForm.employeeId,
        p_rule_id: awardForm.ruleId,
        p_reason: awardForm.reason || null,
        p_recorded_by: session.user.id,
        p_recorded_date: new Date().toISOString().slice(0, 10),
      })

      if (error) throw error

      setMessage({
        type: 'success',
        text: `Point event applied using "${selectedRule?.indicator || 'rule'}". Balances and monetization were recalculated automatically.`,
      })
      setAwardForm({ employeeId: '', ruleId: '', reason: '' })
      setShowAwardForm(false)
      loadData()
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to record points.' })
    }
  }

  const handleCreateRule = async () => {
    if (!companyId || !ruleForm.category || !ruleForm.indicator || !ruleForm.pointValue) {
      setMessage({ type: 'error', text: 'Category, indicator, and point value are required.' })
      return
    }

    try {
      const { error } = await supabase.from('point_rules').insert({
        company_id: companyId,
        category: ruleForm.category,
        indicator: ruleForm.indicator,
        action_type: ruleForm.actionType,
        point_value: Number(ruleForm.pointValue),
        description: ruleForm.description || null,
        is_active: true,
      })

      if (error) throw error

      setMessage({ type: 'success', text: 'Point rule created successfully.' })
      setRuleForm({ category: '', indicator: '', actionType: 'gain', pointValue: '', description: '' })
      setShowRuleForm(false)
      await loadData()
      setActiveTab('rules')
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to create point rule.' })
    }
  }

  const viewTerminationLetter = async (employeeId: string) => {
    if (!companyId) return

    const previewWindow = window.open('', '_blank')
    if (!previewWindow) {
      setMessage({ type: 'error', text: 'Please allow pop-ups to view and print the termination letter.' })
      return
    }

    previewWindow.document.write('<p style="font-family:sans-serif;padding:16px;">Preparing termination letter…</p>')

    try {
      setLetterLoadingEmployeeId(employeeId)

      const employee = employees.find((item: any) => item.id === employeeId)
      const [{ data: companyData }, { data: txData }, { data: savedLetter }] = await Promise.all([
        supabase.from('companies').select('name, email, country').eq('id', companyId).single(),
        supabase
          .from('point_transactions')
          .select('recorded_date, points, reason, point_rules(indicator, category)')
          .eq('company_id', companyId)
          .eq('employee_id', employeeId)
          .eq('action_type', 'loss')
          .order('recorded_date', { ascending: false })
          .limit(8),
        supabase
          .from('hr_termination_letters')
          .select('reason, generated_at')
          .eq('company_id', companyId)
          .eq('employee_id', employeeId)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const reasons = (txData || []).map((tx: any) => ({
        date: tx.recorded_date,
        title: tx.point_rules?.indicator || tx.reason || 'Point deduction',
        detail: tx.reason || tx.point_rules?.category || null,
        points: tx.points,
      }))

      if (reasons.length === 0 && savedLetter?.reason) {
        reasons.push({
          date: savedLetter.generated_at,
          title: 'Recorded termination reason',
          detail: savedLetter.reason,
          points: null,
        })
      }

      const today = new Date().toISOString().slice(0, 10)
      openTerminationLetterWindow({
        companyName: companyData?.name || 'Company',
        companyEmail: companyData?.email || null,
        companyPhone: null,
        companyAddress: null,
        companyCityCountry: companyData?.country || null,
        employeeName: employee?.users?.full_name || 'Employee',
        employeeId: employee?.employee_id_number || employeeId,
        employeePosition: employee?.position || null,
        employeeDepartment: employee?.department || null,
        dateIssued: today,
        dateOfTermination: employee?.termination_date || today,
        referenceNumber: `TERM-${String(employee?.employee_id_number || employeeId).slice(0, 8).toUpperCase()}`,
        finalPayDate: today,
        hrContactName: 'HR Department',
        hrContactEmail: companyData?.email || null,
        signatoryName: 'HR Manager',
        signatoryTitle: 'Human Resources',
        reasons,
      }, previewWindow)
    } catch (error: any) {
      previewWindow.close()
      setMessage({ type: 'error', text: error.message || 'Failed to prepare termination letter.' })
    } finally {
      setLetterLoadingEmployeeId(null)
    }
  }

  const exportPoints = () => {
    const headers = ['employee_name', 'action_type', 'points', 'rule_or_reason', 'recorded_date']
    const rows = transactions.map((t: any) =>
      [
        t.company_employees?.users?.full_name || '',
        t.action_type,
        t.points,
        t.point_rules?.indicator || t.reason || '',
        t.recorded_date,
      ]
        .map((value) => JSON.stringify(value ?? ''))
        .join(',')
    )

    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `hr-points-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const totalGains = transactions.filter((t) => t.action_type === 'gain').reduce((s, t) => s + (t.points || 0), 0)
  const totalLosses = transactions.filter((t) => t.action_type === 'loss').reduce((s, t) => s + (t.points || 0), 0)
  const flaggedTerminations = visibleBalances.filter((b) => b.is_termination_flagged || Number(b.closing_balance) <= 0).length

  const tabs = [
    { key: 'balances', label: 'Balances', icon: Target },
    { key: 'transactions', label: 'Transactions', icon: TrendingUp },
    { key: 'rules', label: 'Point Rules', icon: Star },
  ] as const

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight mb-1">HR Points System</h1>
          <p className="text-sm text-muted-foreground">Rule-driven points, monthly balances, monetization, and automated termination workflow</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-muted-foreground" onClick={exportPoints}>
            <Download className="w-4 h-4 mr-1.5" />
            Export
          </Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => setShowAwardForm(!showAwardForm)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Record Points by Rule
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-600 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Employees Tracked', value: visibleBalances.length, icon: Target, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Total Gains', value: `+${totalGains.toFixed(1)}`, icon: ArrowUpCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Losses', value: `-${totalLosses.toFixed(1)}`, icon: ArrowDownCircle, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Active Rules', value: rules.length, icon: Star, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Termination Flags', value: flaggedTerminations, icon: AlertTriangle, color: 'text-rose-700', bg: 'bg-rose-50' },
        ].map((stat) => (
          <Card key={stat.label} className="p-4 border border-border/50 bg-card">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {showAwardForm && (
        <Card className="border border-primary/20 bg-primary/[0.04] p-6 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Award className="w-4 h-4 text-blue-600" />
            Record Points
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Employee *</label>
              <select
                className="form-select bg-card"
                value={awardForm.employeeId}
                onChange={(e) => setAwardForm({ ...awardForm, employeeId: e.target.value })}
              >
                <option value="">Select employee...</option>
                {awardableEmployees.map((emp: any) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.users?.full_name || 'Unnamed'}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Rule *</label>
              <select
                className="form-select bg-card"
                value={awardForm.ruleId}
                onChange={(e) => setAwardForm({ ...awardForm, ruleId: e.target.value })}
              >
                <option value="">Select rule...</option>
                {rules.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.category} - {r.indicator} ({r.action_type === 'gain' ? '+' : '-'}
                    {r.point_value})
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Reason (optional)</label>
              <Input
                placeholder="Optional note/context for this event..."
                value={awardForm.reason}
                onChange={(e) => setAwardForm({ ...awardForm, reason: e.target.value })}
                className="bg-card"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-5">
            <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={handleRecordPoints}>
              <Award className="w-4 h-4 mr-1.5" />
              Apply Rule
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAwardForm(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {showRuleForm && (
        <Card className="border border-amber-200 bg-amber-50/30 p-6 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-600" />
            Create Point Rule
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              placeholder="Category *"
              value={ruleForm.category}
              onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value })}
              className="bg-card"
            />
            <Input
              placeholder="Indicator *"
              value={ruleForm.indicator}
              onChange={(e) => setRuleForm({ ...ruleForm, indicator: e.target.value })}
              className="bg-card"
            />
            <select
              className="form-select bg-card"
              value={ruleForm.actionType}
              onChange={(e) => setRuleForm({ ...ruleForm, actionType: e.target.value as 'gain' | 'loss' })}
            >
              <option value="gain">Point Gain (+)</option>
              <option value="loss">Point Loss (-)</option>
            </select>
            <Input
              type="number"
              placeholder="Point value *"
              value={ruleForm.pointValue}
              onChange={(e) => setRuleForm({ ...ruleForm, pointValue: e.target.value })}
              className="bg-card"
            />
            <Input
              placeholder="Description (optional)"
              value={ruleForm.description}
              onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
              className="bg-card md:col-span-2"
            />
          </div>
          <div className="flex items-center gap-3 mt-5">
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={handleCreateRule}>
              <Plus className="w-4 h-4 mr-1.5" />
              Save Rule
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowRuleForm(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'balances' && (
        <Card className="border border-border/50 bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="premium-table">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employee</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Period</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Closing Points</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Redeemable (pts)</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Monetary Value (UGX)</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground/60">
                      Loading...
                    </td>
                  </tr>
                ) : visibleBalances.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground/60">
                      No point balances yet.
                    </td>
                  </tr>
                ) : (
                  visibleBalances.map((b: any) => {
                    const isTerminated = b.is_termination_flagged || Number(b.closing_balance) <= 0
                    return (
                      <tr key={b.id} className={isTerminated ? 'bg-rose-50/40' : 'hover:bg-muted/30'}>
                        <td className="font-medium text-foreground">{b.company_employees?.users?.full_name || '—'}</td>
                        <td className="text-muted-foreground">
                          {b.period_month}/{b.period_year}
                        </td>
                        <td className={`px-5 py-3 text-sm font-bold text-right font-mono ${isTerminated ? 'text-rose-700' : 'text-foreground'}`}>
                          {b.closing_balance}
                        </td>
                        <td className="px-5 py-3 text-sm text-right font-mono text-blue-700">{b.redeemable_points ?? b.closing_balance}</td>
                        <td className="px-5 py-3 text-sm text-right font-mono text-emerald-700">
                          {(Number(b.redeemable_amount_ugx || 0)).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-sm">
                          {isTerminated ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-100 px-2 py-1 text-rose-700 text-xs font-semibold">
                              <AlertTriangle className="h-3 w-3" /> Terminated
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-700 text-xs font-semibold">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-sm">
                          {isTerminated && (
                            <Button variant="outline" size="sm" disabled={letterLoadingEmployeeId === b.employee_id} onClick={() => viewTerminationLetter(b.employee_id)}>
                              View & Print Letter
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'transactions' && (
        <Card className="border border-border/50 bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="premium-table">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employee</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Points</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rule / Reason</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm text-muted-foreground/60">
                      Loading...
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm text-muted-foreground/60">
                      No transactions yet.
                    </td>
                  </tr>
                ) : (
                  transactions.map((t: any) => (
                    <tr key={t.id} className="group">
                      <td className="font-medium text-foreground">{t.company_employees?.users?.full_name || '—'}</td>
                      <td className="px-5 py-3 text-sm">{t.action_type === 'gain' ? 'Gain' : 'Loss'}</td>
                      <td className={`px-5 py-3 text-sm font-bold text-right font-mono ${t.action_type === 'gain' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {t.action_type === 'gain' ? '+' : '-'}
                        {t.points}
                      </td>
                      <td className="text-muted-foreground">{t.point_rules?.indicator || t.reason || '—'}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground/60">{new Date(t.recorded_date).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'rules' && (
        <Card className="border border-border/50 bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border/30 flex items-center justify-between bg-muted/50/40">
            <p className="text-xs text-muted-foreground">Rule value decides gain/loss automatically while recording points.</p>
            <Button size="sm" variant="outline" onClick={() => setShowRuleForm(!showRuleForm)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Add Rule
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="premium-table">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Indicator</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Points</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-sm text-muted-foreground/60">
                      Loading...
                    </td>
                  </tr>
                ) : rules.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-sm text-muted-foreground/60">
                      No point rules configured.
                    </td>
                  </tr>
                ) : (
                  rules.map((r: any) => (
                    <tr key={r.id} className="group">
                      <td className="px-5 py-3 text-xs font-medium px-2">{r.category}</td>
                      <td className="font-medium text-foreground">{r.indicator}</td>
                      <td className="px-5 py-3 text-sm">{r.action_type === 'gain' ? 'Gain' : 'Loss'}</td>
                      <td className={`px-5 py-3 text-sm font-bold text-right font-mono ${r.action_type === 'gain' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {r.action_type === 'gain' ? '+' : '-'}
                        {r.point_value}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
