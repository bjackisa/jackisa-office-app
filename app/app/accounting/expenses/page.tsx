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
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Expenses</h1>
          <p className="text-sm text-gray-500">Track and manage company expenses.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-gray-600" onClick={exportCsv}><Download className="w-4 h-4 mr-1.5" />Export</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowForm(!showForm)}><Plus className="w-4 h-4 mr-1.5" />New Expense</Button>
        </div>
      </div>

      {showForm && (
        <Card className="mb-5 p-4 border border-blue-200 bg-blue-50/30">
          <div className="grid md:grid-cols-5 gap-3">
            <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            <select className="px-3 py-2 border rounded-md" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
            <Input className="md:col-span-2" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Input type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="mt-3 flex gap-2"><Button onClick={createExpense}>Save Expense</Button><Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button></div>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[{ label: 'Total Expenses', value: formatUGX(totals.total), icon: Receipt, color: 'text-gray-900', bg: 'bg-gray-50' }, { label: 'Approved', value: formatUGX(totals.approved), icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' }, { label: 'Pending', value: formatUGX(totals.pending), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' }, { label: 'Categories', value: String(new Set(expenses.map((e) => e.category)).size), icon: Tag, color: 'text-blue-600', bg: 'bg-blue-50' }].map((stat) => (
          <Card key={stat.label} className="p-4 border border-gray-200/60 bg-white"><div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${stat.bg}`}><stat.icon className={`w-4 h-4 ${stat.color}`} /></div><div><p className="text-lg font-bold text-gray-900">{stat.value}</p><p className="text-xs text-gray-500">{stat.label}</p></div></div></Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input className="pl-10" placeholder="Search expenses..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <select className="px-3 py-2 border rounded-md" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
          </div>

          <Card className="border border-gray-200/60 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-gray-100 bg-gray-50/50 text-xs uppercase text-gray-500"><th className="px-5 py-3 text-left">Description</th><th className="px-5 py-3 text-left">Category</th><th className="px-5 py-3 text-left">Date</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3 text-left">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">Loading expenses...</td></tr> : filtered.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">No expenses found.</td></tr> : filtered.map((exp) => (
                    <tr key={exp.id} className="hover:bg-gray-50/40">
                      <td className="px-5 py-3 text-sm text-gray-800">{exp.description}</td>
                      <td className="px-5 py-3 text-xs text-gray-600 capitalize">{exp.category}</td>
                      <td className="px-5 py-3 text-xs text-gray-500">{exp.expense_date}</td>
                      <td className="px-5 py-3 text-sm font-mono text-right font-semibold">{formatUGX(exp.amount || 0)}</td>
                      <td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{exp.status}</span></td>
                      <td className="px-5 py-3 text-right"><button className="p-1.5 hover:bg-red-50 rounded-md" onClick={() => deleteExpense(exp.id)}><Trash2 className="w-4 h-4 text-gray-500 hover:text-red-500" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="border border-gray-200/60 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500" />By Category</h3>
            {expenses.length === 0 ? <p className="text-xs text-gray-400">No expense data yet</p> : (
              <div className="space-y-3">
                {categories.map((category) => {
                  const total = expenses.filter((e) => e.category === category).reduce((s, e) => s + Number(e.amount || 0), 0)
                  if (!total) return null
                  const pct = totals.total > 0 ? (total / totals.total) * 100 : 0
                  return (
                    <div key={category}>
                      <div className="flex items-center justify-between mb-1"><span className="text-xs text-gray-600 capitalize">{category}</span><span className="text-xs font-semibold text-gray-800">{formatUGX(total)}</span></div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} /></div>
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
