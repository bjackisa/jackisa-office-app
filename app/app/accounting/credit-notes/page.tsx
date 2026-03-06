'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function CreditNotesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [creditNotes, setCreditNotes] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState({ invoice_id: '', credit_date: new Date().toISOString().split('T')[0], reason: '', amount: '' })
  const [error, setError] = useState<string | null>(null)

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    setCompanyId(ctx.companyId)
    setUserId(ctx.userId)

    const [invoiceRes, noteRes] = await Promise.all([
      supabase.from('invoices').select('id, invoice_number, customer_name, total_amount, paid_amount, outstanding_amount, status').eq('company_id', ctx.companyId).order('created_at', { ascending: false }),
      supabase.from('credit_notes').select('*, invoices(invoice_number, customer_name)').eq('company_id', ctx.companyId).order('created_at', { ascending: false }),
    ])

    if (invoiceRes.error) console.error('Load invoices error', invoiceRes.error)
    if (noteRes.error) console.error('Load credit notes error', noteRes.error)

    setInvoices(invoiceRes.data || [])
    setCreditNotes(noteRes.data || [])
  }

  useEffect(() => {
    loadData()
  }, [])

  const filtered = creditNotes.filter((row:any)=>{const q = searchQuery.toLowerCase(); const matchSearch = !searchQuery || JSON.stringify(row).toLowerCase().includes(q); const matchStatus = !statusFilter || row.status===statusFilter || row.day_name===statusFilter; return matchSearch && matchStatus})

  const selectedInvoice = useMemo(() => invoices.find((invoice) => invoice.id === form.invoice_id) || null, [form.invoice_id, invoices])

  const parseAmount = (value: unknown) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
    if (typeof value === 'string') {
      const normalized = value.replace(/[^\d.-]/g, '')
      const parsed = Number(normalized)
      return Number.isFinite(parsed) ? parsed : NaN
    }
    return NaN
  }

  const getInvoiceOutstanding = (invoice: any) => {
    const total = parseAmount(invoice?.total_amount || 0)
    const paid = parseAmount(invoice?.paid_amount || 0)
    const computed = total - paid
    if (Number.isFinite(computed)) return Math.max(computed, 0)
    return 0
  }

  const invoiceHasBalance = (invoice: any) => {
    const outstanding = getInvoiceOutstanding(invoice)
    if (Number.isFinite(outstanding) && outstanding > 0) return true

    const status = String(invoice?.status || '').toLowerCase()
    return ['sent', 'overdue', 'partially_paid'].includes(status)
  }

  const selectedOutstanding = getInvoiceOutstanding(selectedInvoice)

  const createCreditNote = async () => {
    if (!companyId || !userId || !form.reason || !form.amount) return
    if (form.invoice_id && !selectedInvoice) {
      setError('Select a valid invoice before applying a credit note.')
      return
    }

    const amount = Number(form.amount)
    if (Number.isNaN(amount) || amount <= 0) {
      setError('Enter a valid partial payment amount.')
      return
    }

    if (form.invoice_id && amount > selectedOutstanding) {
      setError(`Amount exceeds invoice outstanding balance of ${selectedOutstanding.toLocaleString()}.`)
      return
    }

    setError(null)

    const { error: noteError } = await supabase.from('credit_notes').insert({
      company_id: companyId,
      credit_note_number: `CN-${Date.now()}`,
      invoice_id: form.invoice_id || null,
      credit_date: form.credit_date,
      reason: form.reason,
      amount,
      created_by: userId,
    })

    if (noteError) {
      setError(noteError.message || 'Failed to create credit note.')
      return
    }

    if (form.invoice_id && selectedInvoice) {
      const total = parseAmount(selectedInvoice.total_amount || 0)
      const currentlyPaid = parseAmount(selectedInvoice.paid_amount || 0)
      const nextPaidAmount = Math.min(Math.max(currentlyPaid + amount, 0), total)
      const nextOutstandingAmount = Math.max(total - nextPaidAmount, 0)
      const nextStatus =
        nextOutstandingAmount <= 0
          ? 'paid'
          : nextPaidAmount > 0
            ? 'partially_paid'
            : selectedInvoice.status

      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({
          paid_amount: nextPaidAmount,
          outstanding_amount: nextOutstandingAmount,
          status: nextStatus,
        })
        .eq('id', form.invoice_id)
        .eq('company_id', companyId)

      if (invoiceError) {
        setError(`Credit note created, but invoice balance was not updated: ${invoiceError.message}`)
      }
    }

    setForm({ invoice_id: '', credit_date: new Date().toISOString().split('T')[0], reason: '', amount: '' })
    await loadData()
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Credit Notes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Create and track credit notes for full or partial invoice settlements</p>
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02] space-y-3">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Search className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Create Credit Note</h3>
            <p className="text-[11px] text-muted-foreground/60">Apply a manual partial or full payment to an invoice</p>
          </div>
        </div>
        <div className="grid md:grid-cols-4 gap-3">
          <select className="form-select" value={form.invoice_id} onChange={(e) => { setError(null); setForm({ ...form, invoice_id: e.target.value }) }}>
            <option value="">No linked invoice</option>
            {invoices.filter(invoiceHasBalance).map((invoice) => {
              const outstanding = getInvoiceOutstanding(invoice)
              return (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoice_number} — {invoice.customer_name} — Outstanding {Number(outstanding || 0).toLocaleString()}
                </option>
              )
            })}
          </select>
          <Input type="date" value={form.credit_date} onChange={(e) => setForm({ ...form, credit_date: e.target.value })} />
          <Input placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <Input type="number" placeholder="Amount" value={form.amount} onChange={(e) => { setError(null); setForm({ ...form, amount: e.target.value }) }} max={selectedOutstanding > 0 ? selectedOutstanding : undefined} />
        </div>
        {selectedInvoice && (
          <div className="rounded-xl border border-border/40 bg-background/70 px-3 py-2">
            <p className="text-xs text-muted-foreground">Selected invoice: <span className="font-medium text-foreground">{selectedInvoice.invoice_number}</span></p>
            <p className="text-xs text-muted-foreground">Outstanding balance: <span className="font-semibold text-foreground">{Number(selectedOutstanding || 0).toLocaleString()}</span></p>
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="pt-3 border-t border-border/30">
          <Button size="sm" onClick={createCreditNote}>Apply Credit Note</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead><tr><th>Number</th><th>Invoice</th><th>Date</th><th>Reason</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={5} className="!py-12 text-center text-muted-foreground/60">No credit notes found.</td></tr> : filtered.map((note) => (
                <tr key={note.id} className="group"><td className="font-mono text-xs text-muted-foreground">{note.credit_note_number}</td><td className="text-muted-foreground">{note.invoices?.invoice_number || '—'}</td><td className="text-xs text-muted-foreground">{note.credit_date}</td><td className="font-medium text-foreground">{note.reason}</td><td className="text-right font-mono font-bold tabular-nums">{Number(note.amount || 0).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
