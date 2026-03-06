'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Download, Trash2, Receipt, CheckCircle, Clock, Tag, TrendingUp } from 'lucide-react'

const categories = ['utilities', 'salaries', 'rent', 'equipment', 'travel', 'supplies', 'marketing', 'maintenance', 'other']

export default function ExpensesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ expense_date: new Date().toISOString().split('T')[0], category: 'other', description: '', amount: '', status: 'pending' })

  const loadExpenses = async () => {
    try {
      const ctx = await getSessionContext()
      if (!ctx?.companyId) return
      setCompanyId(ctx.companyId)
      setUserId(ctx.userId)

      const { data } = await supabase
        .from('expenses')
        .select('*')
        .eq('company_id', ctx.companyId)
        .order('expense_date', { ascending: false })

      setExpenses(data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExpenses()
  }, [])

  const filtered = useMemo(() => expenses.filter((exp) => {
    const q = search.toLowerCase()
    const matchSearch = !search || exp.description?.toLowerCase().includes(q)
    const matchCat = !categoryFilter || exp.category === categoryFilter
    return matchSearch && matchCat
  }), [expenses, search, categoryFilter])

  const totals = {
    total: expenses.reduce((s, e) => s + Number(e.amount || 0), 0),
    approved: expenses.filter((e) => e.status === 'approved').reduce((s, e) => s + Number(e.amount || 0), 0),
    pending: expenses.filter((e) => e.status === 'pending').reduce((s, e) => s + Number(e.amount || 0), 0),
  }

  const formatUGX = (n: number) => `UGX ${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`

  const createExpense = async () => {
    if (!companyId || !userId || !form.description || !form.amount) return

    await supabase.from('expenses').insert({
      company_id: companyId,
      expense_date: form.expense_date,
      category: form.category,
      description: form.description,
      amount: Number(form.amount),
      submitted_by: userId,
      status: form.status,
    })

    setShowForm(false)
    setForm({ expense_date: new Date().toISOString().split('T')[0], category: 'other', description: '', amount: '', status: 'pending' })
    await loadExpenses()
  }

  const deleteExpense = async (id: string) => {
    await supabase.from('expenses').delete().eq('id', id)
    await loadExpenses()
  }

  const exportCsv = () => {
    const headers = ['expense_date', 'category', 'description', 'amount', 'status']
    const rows = filtered.map((e) => headers.map((h) => JSON.stringify(e[h] ?? '')).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track and manage company expenses.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1.5" />Export CSV</Button>
          <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus className="w-4 h-4 mr-1.5" />New Expense</Button>
        </div>
      </div>

      {showForm && (
        <Card className="mb-6 p-5 border border-primary/15 bg-primary/[0.02]">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Record Expense</h3>
              <p className="text-[11px] text-muted-foreground/60">Add a new expense entry</p>
            </div>
          </div>
          <div className="grid md:grid-cols-5 gap-3">
            <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            <select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
            <Input className="md:col-span-2" placeholder="Description *" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Input type="number" placeholder="Amount *" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="mt-4 flex items-center gap-2 pt-4 border-t border-border/30">
            <Button size="sm" onClick={createExpense}>Save Expense</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger-children">
        {[
          { label: 'Total Expenses', value: formatUGX(totals.total), icon: Receipt, gradient: 'from-slate-500 to-slate-600' },
          { label: 'Approved', value: formatUGX(totals.approved), icon: CheckCircle, gradient: 'from-emerald-500 to-green-600' },
          { label: 'Pending', value: formatUGX(totals.pending), icon: Clock, gradient: 'from-amber-500 to-orange-500' },
          { label: 'Categories', value: String(new Set(expenses.map((e) => e.category)).size), icon: Tag, gradient: 'from-blue-500 to-blue-600' },
        ].map((stat) => (
          <Card key={stat.label} className="stat-card p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-sm flex-shrink-0`}>
                <stat.icon className="w-4.5 h-4.5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-foreground truncate tracking-tight">{stat.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="lg:col-span-3">
          <Card className="p-3 mb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                <Input className="pl-10" placeholder="Search expenses..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="form-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Date</th>
                    <th className="text-right">Amount</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="!py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <p className="text-sm text-muted-foreground">Loading expenses...</p>
                      </div>
                    </td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={6} className="!py-16 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                        <Receipt className="w-6 h-6 text-muted-foreground/25" />
                      </div>
                      <p className="text-sm text-muted-foreground font-medium">No expenses found</p>
                      <p className="text-xs text-muted-foreground/40 mt-1">Record your first expense to get started</p>
                    </td></tr>
                  ) : filtered.map((exp) => (
                    <tr key={exp.id} className="group">
                      <td className="font-medium text-foreground">{exp.description}</td>
                      <td><span className="badge badge-neutral capitalize">{exp.category}</span></td>
                      <td className="text-muted-foreground text-xs">{exp.expense_date}</td>
                      <td className="text-right font-mono font-bold tabular-nums">{formatUGX(exp.amount || 0)}</td>
                      <td>
                        <span className={`badge ${exp.status === 'approved' ? 'badge-success' : exp.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                          {exp.status}
                        </span>
                      </td>
                      <td className="text-right">
                        <button className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100" onClick={() => deleteExpense(exp.id)}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div className="px-5 py-3 border-t border-border/20 bg-muted/10">
                <p className="text-xs text-muted-foreground/50">Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {expenses.length} expenses</p>
              </div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="p-5">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-blue-500" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">By Category</h3>
            </div>
            {expenses.length === 0 ? <p className="text-xs text-muted-foreground/50">No expense data yet</p> : (
              <div className="space-y-4">
                {categories.map((category) => {
                  const total = expenses.filter((e) => e.category === category).reduce((s, e) => s + Number(e.amount || 0), 0)
                  if (!total) return null
                  const pct = totals.total > 0 ? (total / totals.total) * 100 : 0
                  return (
                    <div key={category}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-muted-foreground capitalize font-medium">{category}</span>
                        <span className="text-xs font-bold text-foreground tabular-nums">{formatUGX(total)}</span>
                      </div>
                      <div className="w-full h-2 bg-muted/60 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-700" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground/40 mt-0.5 tabular-nums">{pct.toFixed(1)}%</p>
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
