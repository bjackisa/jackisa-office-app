'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Award, Plus, TrendingUp, TrendingDown, Users, Search,
  ArrowUpCircle, ArrowDownCircle, MoreHorizontal, RefreshCw,
  Star, Target, Download, Filter,
} from 'lucide-react'

export default function HRPointsPage() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [balances, setBalances] = useState<any[]>([])
  const [rules, setRules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'balances' | 'transactions' | 'rules'>('balances')
  const [showAwardForm, setShowAwardForm] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [awardForm, setAwardForm] = useState({
    employeeId: '',
    ruleId: '',
    actionType: 'gain' as 'gain' | 'loss',
    points: '',
    reason: '',
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
          .limit(50),
        supabase
          .from('point_balances')
          .select('*, company_employees(users(full_name))')
          .eq('company_id', context.companyId)
          .order('period_year', { ascending: false })
          .order('period_month', { ascending: false })
          .limit(50),
        supabase
          .from('point_rules')
          .select('*')
          .eq('company_id', context.companyId)
          .eq('is_active', true)
          .order('category', { ascending: true }),
        supabase
          .from('company_employees')
          .select('id, users(full_name)')
          .eq('company_id', context.companyId)
          .eq('status', 'active'),
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

  const handleAwardPoints = async () => {
    if (!awardForm.employeeId || !awardForm.points || !companyId) {
      setMessage({ type: 'error', text: 'Please select an employee and enter points.' })
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { error } = await supabase
        .from('point_transactions')
        .insert({
          company_id: companyId,
          employee_id: awardForm.employeeId,
          rule_id: awardForm.ruleId || null,
          action_type: awardForm.actionType,
          points: parseFloat(awardForm.points),
          reason: awardForm.reason || null,
          recorded_by: session.user.id,
          recorded_date: new Date().toISOString().split('T')[0],
        })

      if (error) throw error

      setMessage({ type: 'success', text: `Points ${awardForm.actionType === 'gain' ? 'awarded' : 'deducted'} successfully.` })
      setAwardForm({ employeeId: '', ruleId: '', actionType: 'gain', points: '', reason: '' })
      setShowAwardForm(false)
      loadData()
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to record points.' })
    }
  }

  const totalGains = transactions.filter(t => t.action_type === 'gain').reduce((s, t) => s + (t.points || 0), 0)
  const totalLosses = transactions.filter(t => t.action_type === 'loss').reduce((s, t) => s + (t.points || 0), 0)

  const tabs = [
    { key: 'balances', label: 'Balances', icon: Target },
    { key: 'transactions', label: 'Transactions', icon: TrendingUp },
    { key: 'rules', label: 'Point Rules', icon: Star },
  ] as const

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">HR Points System</h1>
          <p className="text-sm text-gray-500">Track employee performance points, awards, and deductions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-gray-600">
            <Download className="w-4 h-4 mr-1.5" />
            Export
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => setShowAwardForm(!showAwardForm)}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Award Points
          </Button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Employees Tracked', value: balances.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Total Gains', value: `+${totalGains.toFixed(1)}`, icon: ArrowUpCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Losses', value: `-${totalLosses.toFixed(1)}`, icon: ArrowDownCircle, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Active Rules', value: rules.length, icon: Star, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map(stat => (
          <Card key={stat.label} className="p-4 border border-gray-200/60 bg-white">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Award Form */}
      {showAwardForm && (
        <Card className="border border-blue-200 bg-blue-50/30 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Award className="w-4 h-4 text-blue-600" />
            Record Points
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Employee *</label>
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                value={awardForm.employeeId}
                onChange={(e) => setAwardForm({ ...awardForm, employeeId: e.target.value })}
              >
                <option value="">Select employee...</option>
                {employees.map((emp: any) => (
                  <option key={emp.id} value={emp.id}>{emp.users?.full_name || 'Unnamed'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Action Type *</label>
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                value={awardForm.actionType}
                onChange={(e) => setAwardForm({ ...awardForm, actionType: e.target.value as 'gain' | 'loss' })}
              >
                <option value="gain">Point Gain (+)</option>
                <option value="loss">Point Loss (-)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Points *</label>
              <Input
                type="number"
                placeholder="e.g. 5"
                value={awardForm.points}
                onChange={(e) => setAwardForm({ ...awardForm, points: e.target.value })}
                className="bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Rule (optional)</label>
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                value={awardForm.ruleId}
                onChange={(e) => setAwardForm({ ...awardForm, ruleId: e.target.value })}
              >
                <option value="">No rule (custom)</option>
                {rules.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.indicator} ({r.action_type === 'gain' ? '+' : '-'}{r.point_value})</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Reason</label>
              <Input
                placeholder="Reason for awarding/deducting points..."
                value={awardForm.reason}
                onChange={(e) => setAwardForm({ ...awardForm, reason: e.target.value })}
                className="bg-white"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-5">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleAwardPoints}>
              <Award className="w-4 h-4 mr-1.5" />
              Record Points
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAwardForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'balances' && (
        <Card className="border border-gray-200/60 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Period</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Opening</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Gained</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Lost</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Closing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-400">Loading...</td></tr>
                ) : balances.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center">
                      <Target className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                      <p className="text-sm text-gray-400 font-medium">No point balances yet</p>
                      <p className="text-xs text-gray-300 mt-1">Start awarding points to see balances here</p>
                    </td>
                  </tr>
                ) : (
                  balances.map((b: any) => (
                    <tr key={b.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{b.company_employees?.users?.full_name || '—'}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">{b.period_month}/{b.period_year}</td>
                      <td className="px-5 py-3 text-sm text-gray-600 text-right font-mono">{b.opening_balance}</td>
                      <td className="px-5 py-3 text-sm text-emerald-600 text-right font-mono">+{b.points_gained}</td>
                      <td className="px-5 py-3 text-sm text-red-500 text-right font-mono">-{b.points_lost}</td>
                      <td className="px-5 py-3 text-sm font-bold text-gray-900 text-right font-mono">{b.closing_balance}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'transactions' && (
        <Card className="border border-gray-200/60 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Points</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rule / Reason</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-gray-400">Loading...</td></tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <TrendingUp className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                      <p className="text-sm text-gray-400 font-medium">No transactions yet</p>
                    </td>
                  </tr>
                ) : (
                  transactions.map((t: any) => (
                    <tr key={t.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{t.company_employees?.users?.full_name || '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                          t.action_type === 'gain'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-red-50 text-red-600 border-red-200'
                        }`}>
                          {t.action_type === 'gain' ? <ArrowUpCircle className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                          {t.action_type === 'gain' ? 'Gain' : 'Loss'}
                        </span>
                      </td>
                      <td className={`px-5 py-3 text-sm font-bold text-right font-mono ${
                        t.action_type === 'gain' ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        {t.action_type === 'gain' ? '+' : '-'}{t.points}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500">{t.point_rules?.indicator || t.reason || '—'}</td>
                      <td className="px-5 py-3 text-xs text-gray-400">{new Date(t.recorded_date).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'rules' && (
        <Card className="border border-gray-200/60 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Indicator</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Points</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-gray-400">Loading...</td></tr>
                ) : rules.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <Star className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                      <p className="text-sm text-gray-400 font-medium">No point rules configured</p>
                      <p className="text-xs text-gray-300 mt-1">Configure rules to standardize point awards</p>
                    </td>
                  </tr>
                ) : (
                  rules.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600">{r.category}</span>
                      </td>
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{r.indicator}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                          r.action_type === 'gain'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-red-50 text-red-600 border-red-200'
                        }`}>
                          {r.action_type === 'gain' ? 'Gain' : 'Loss'}
                        </span>
                      </td>
                      <td className={`px-5 py-3 text-sm font-bold text-right font-mono ${
                        r.action_type === 'gain' ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        {r.action_type === 'gain' ? '+' : '-'}{r.point_value}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500">{r.description || '—'}</td>
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
