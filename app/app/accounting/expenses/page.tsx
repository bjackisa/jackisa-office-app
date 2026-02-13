'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Plus, Search, Download, Eye, Trash2, Receipt,
  CheckCircle, Clock, Tag, TrendingUp,
} from 'lucide-react'

const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  utilities: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  salaries: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
  rent: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
  equipment: { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200' },
  travel: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  supplies: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200' },
  marketing: { bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-200' },
  maintenance: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
  other: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
}

const statusConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', label: 'Approved' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', label: 'Pending' },
  rejected: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', label: 'Rejected' },
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  useEffect(() => {
    loadExpenses()
  }, [])

  const loadExpenses = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: empData } = await supabase
        .from('company_employees')
        .select('company_id')
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .limit(1)
        .single()

      if (!empData) return

      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('company_id', empData.company_id)
        .order('expense_date', { ascending: false })

      if (!error && data) setExpenses(data)
    } catch (err) {
      console.error('Failed to load expenses:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = expenses.filter(exp => {
    const matchSearch = !search ||
      exp.description?.toLowerCase().includes(search.toLowerCase()) ||
      exp.vendor_name?.toLowerCase().includes(search.toLowerCase())
    const matchCat = !categoryFilter || exp.category === categoryFilter
    return matchSearch && matchCat
  })

  const totalAmount = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const approvedAmount = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + (e.amount || 0), 0)
  const pendingAmount = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + (e.amount || 0), 0)

  const categories = [...new Set(expenses.map(e => e.category).filter(Boolean))]
  const categoryTotals: Record<string, number> = {}
  expenses.forEach(e => {
    const cat = e.category || 'other'
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (e.amount || 0)
  })

  const formatUGX = (n: number) => `UGX ${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Expenses</h1>
          <p className="text-sm text-gray-500">Track and manage company expenses</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-gray-600">
            <Download className="w-4 h-4 mr-1.5" />
            Export
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-1.5" />
            New Expense
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Expenses', value: formatUGX(totalAmount), icon: Receipt, color: 'text-gray-900', bg: 'bg-gray-50' },
          { label: 'Approved', value: formatUGX(approvedAmount), icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Pending', value: formatUGX(pendingAmount), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Categories', value: categories.length.toString(), icon: Tag, color: 'text-blue-600', bg: 'bg-blue-50' },
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Table */}
        <div className="lg:col-span-3">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search expenses..."
                className="pl-10 bg-white border-gray-200"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-600"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          <Card className="border border-gray-200/60 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-400">Loading expenses...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center">
                        <Receipt className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                        <p className="text-sm text-gray-400 font-medium">No expenses found</p>
                        <p className="text-xs text-gray-300 mt-1">Record your first expense to get started</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((exp) => {
                      const catCfg = categoryColors[exp.category] || categoryColors.other
                      const stsCfg = statusConfig[exp.status] || statusConfig.pending
                      return (
                        <tr key={exp.id} className="hover:bg-gray-50/50">
                          <td className="px-5 py-3">
                            <p className="text-sm font-medium text-gray-900">{exp.description || '—'}</p>
                            {exp.vendor_name && <p className="text-xs text-gray-400">{exp.vendor_name}</p>}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${catCfg.bg} ${catCfg.text} ${catCfg.border}`}>
                              {(exp.category || 'other').charAt(0).toUpperCase() + (exp.category || 'other').slice(1)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-sm text-gray-500">
                            {exp.expense_date ? new Date(exp.expense_date).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-5 py-3 text-sm font-bold text-gray-900 text-right font-mono">
                            {formatUGX(exp.amount || 0)}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${stsCfg.bg} ${stsCfg.text} ${stsCfg.border}`}>
                              {stsCfg.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button className="p-1.5 hover:bg-gray-100 rounded-md transition-colors" title="View">
                                <Eye className="w-3.5 h-3.5 text-gray-400" />
                              </button>
                              <button className="p-1.5 hover:bg-red-50 rounded-md transition-colors" title="Delete">
                                <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/30 text-xs text-gray-400">
                Showing {filtered.length} of {expenses.length} expenses
              </div>
            )}
          </Card>
        </div>

        {/* Category Breakdown Sidebar */}
        <div className="lg:col-span-1">
          <Card className="border border-gray-200/60 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              By Category
            </h3>
            {Object.keys(categoryTotals).length === 0 ? (
              <p className="text-xs text-gray-400">No expense data yet</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(categoryTotals)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, total]) => {
                    const pct = totalAmount > 0 ? (total / totalAmount) * 100 : 0
                    const cfg = categoryColors[cat] || categoryColors.other
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600 capitalize">{cat}</span>
                          <span className="text-xs font-semibold text-gray-800">{formatUGX(total)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${cfg.bg.replace('50', '400')}`}
                            style={{ width: `${pct}%`, backgroundColor: cfg.text.includes('amber') ? '#f59e0b' : cfg.text.includes('red') ? '#ef4444' : cfg.text.includes('blue') ? '#3b82f6' : cfg.text.includes('violet') ? '#8b5cf6' : cfg.text.includes('emerald') ? '#10b981' : cfg.text.includes('indigo') ? '#6366f1' : cfg.text.includes('pink') ? '#ec4899' : cfg.text.includes('orange') ? '#f97316' : '#6b7280' }}
                          />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">{pct.toFixed(1)}%</p>
                      </div>
                    )
                  })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
