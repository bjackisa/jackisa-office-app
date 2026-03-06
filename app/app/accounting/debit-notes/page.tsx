'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function DebitNotesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [expenses, setExpenses] = useState<any[]>([])
  const [debitNotes, setDebitNotes] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState({ expense_id: '', debit_date: new Date().toISOString().split('T')[0], reason: '', amount: '' })
  const [error, setError] = useState<string | null>(null)

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    setCompanyId(ctx.companyId)
    setUserId(ctx.userId)

    const [expenseRes, noteRes] = await Promise.all([
      supabase.from('expenses').select('id, description, amount, paid_amount, outstanding_amount, expense_date, status').eq('company_id', ctx.companyId).order('created_at', { ascending: false }),
      supabase.from('debit_notes').select('*, expenses(description, amount, expense_date)').eq('company_id', ctx.companyId).order('created_at', { ascending: false }),
    ])

    setExpenses(expenseRes.data || [])
    setDebitNotes(noteRes.data || [])
  }

  useEffect(() => {
    loadData()
  }, [])

  const filtered = debitNotes.filter((row:any)=>{const q = searchQuery.toLowerCase(); const matchSearch = !searchQuery || JSON.stringify(row).toLowerCase().includes(q); const matchStatus = !statusFilter || row.status===statusFilter || row.day_name===statusFilter; return matchSearch && matchStatus})

  const selectedExpense = useMemo(() => expenses.find((expense) => expense.id === form.expense_id) || null, [form.expense_id, expenses])
  const selectedOutstanding = Number(selectedExpense?.outstanding_amount ?? ((selectedExpense?.amount || 0) - (selectedExpense?.paid_amount || 0)))

  const createDebitNote = async () => {
    if (!companyId || !userId || !form.reason || !form.amount) return

    const amount = Number(form.amount)
    if (Number.isNaN(amount) || amount <= 0) {
      setError('Enter a valid partial payment amount.')
      return
    }

    if (form.expense_id && amount > selectedOutstanding) {
      setError(`Amount exceeds expense outstanding balance of ${selectedOutstanding.toLocaleString()}.`)
      return
    }

    setError(null)

    await supabase.from('debit_notes').insert({
      company_id: companyId,
      debit_note_number: `DN-${Date.now()}`,
      expense_id: form.expense_id || null,
      debit_date: form.debit_date,
      reason: form.reason,
      amount,
      created_by: userId,
    })

    setForm({ expense_id: '', debit_date: new Date().toISOString().split('T')[0], reason: '', amount: '' })
    await loadData()
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Debit Notes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Create and track debit notes for full or partial expense settlements</p>
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02] space-y-3">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Search className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Create Debit Note</h3>
            <p className="text-[11px] text-muted-foreground/60">Apply a manual partial or full payment to an expense</p>
          </div>
        </div>
        <div className="grid md:grid-cols-4 gap-3">
          <select className="form-select" value={form.expense_id} onChange={(e) => { setError(null); setForm({ ...form, expense_id: e.target.value }) }}>
            <option value="">No linked expense</option>
            {expenses.filter((expense) => Number(expense.outstanding_amount ?? ((expense.amount || 0) - (expense.paid_amount || 0))) > 0).map((expense) => <option key={expense.id} value={expense.id}>{expense.description} — Outstanding {Number(expense.outstanding_amount ?? ((expense.amount || 0) - (expense.paid_amount || 0))).toLocaleString()}</option>)}
          </select>
          <Input type="date" value={form.debit_date} onChange={(e) => setForm({ ...form, debit_date: e.target.value })} />
          <Input placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <Input type="number" placeholder="Amount" value={form.amount} onChange={(e) => { setError(null); setForm({ ...form, amount: e.target.value }) }} max={selectedOutstanding > 0 ? selectedOutstanding : undefined} />
        </div>
        {selectedExpense && (
          <div className="rounded-xl border border-border/40 bg-background/70 px-3 py-2">
            <p className="text-xs text-muted-foreground">Selected expense: <span className="font-medium text-foreground">{selectedExpense.description}</span></p>
            <p className="text-xs text-muted-foreground">Outstanding balance: <span className="font-semibold text-foreground">{Number(selectedOutstanding || 0).toLocaleString()}</span></p>
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="pt-3 border-t border-border/30">
          <Button size="sm" onClick={createDebitNote}>Apply Debit Note</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead><tr><th>Number</th><th>Expense</th><th>Date</th><th>Reason</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={5} className="!py-12 text-center text-muted-foreground/60">No debit notes found.</td></tr> : filtered.map((note) => (
                <tr key={note.id} className="group"><td className="font-mono text-xs text-muted-foreground">{note.debit_note_number}</td><td className="text-muted-foreground">{note.expenses?.description || '—'}</td><td className="text-xs text-muted-foreground">{note.debit_date}</td><td className="font-medium text-foreground">{note.reason}</td><td className="text-right font-mono font-bold tabular-nums">{Number(note.amount || 0).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
