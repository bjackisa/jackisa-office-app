'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function CreditNotesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [creditNotes, setCreditNotes] = useState<any[]>([])
  const [form, setForm] = useState({ invoice_id: '', credit_date: new Date().toISOString().split('T')[0], reason: '', amount: '' })

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    setCompanyId(ctx.companyId)
    setUserId(ctx.userId)

    const [invoiceRes, noteRes] = await Promise.all([
      supabase.from('invoices').select('id, invoice_number, customer_name').eq('company_id', ctx.companyId).order('created_at', { ascending: false }),
      supabase.from('credit_notes').select('*, invoices(invoice_number, customer_name)').eq('company_id', ctx.companyId).order('created_at', { ascending: false }),
    ])

    setInvoices(invoiceRes.data || [])
    setCreditNotes(noteRes.data || [])
  }

  useEffect(() => {
    loadData()
  }, [])

  const createCreditNote = async () => {
    if (!companyId || !userId || !form.reason || !form.amount) return

    await supabase.from('credit_notes').insert({
      company_id: companyId,
      credit_note_number: `CN-${Date.now()}`,
      invoice_id: form.invoice_id || null,
      credit_date: form.credit_date,
      reason: form.reason,
      amount: Number(form.amount),
      created_by: userId,
    })

    setForm({ invoice_id: '', credit_date: new Date().toISOString().split('T')[0], reason: '', amount: '' })
    await loadData()
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Credit Notes</h1>
        <p className="text-sm text-gray-500">Create and track credit notes for invoice adjustments.</p>
      </div>

      <Card className="p-5 border border-gray-200/60 space-y-3">
        <h2 className="text-sm font-semibold">Create Credit Note</h2>
        <div className="grid md:grid-cols-4 gap-3">
          <select className="px-3 py-2 border rounded-md" value={form.invoice_id} onChange={(e) => setForm({ ...form, invoice_id: e.target.value })}>
            <option value="">No linked invoice</option>
            {invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoice_number} — {invoice.customer_name}</option>)}
          </select>
          <Input type="date" value={form.credit_date} onChange={(e) => setForm({ ...form, credit_date: e.target.value })} />
          <Input placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <Input type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <Button onClick={createCreditNote}>Save Credit Note</Button>
      </Card>

      <Card className="border border-gray-200/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase"><th className="px-4 py-3 text-left">Number</th><th className="px-4 py-3 text-left">Invoice</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Reason</th><th className="px-4 py-3 text-right">Amount</th></tr></thead>
            <tbody>
              {creditNotes.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No credit notes found.</td></tr> : creditNotes.map((note) => (
                <tr key={note.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{note.credit_note_number}</td><td className="px-4 py-3">{note.invoices?.invoice_number || '—'}</td><td className="px-4 py-3">{note.credit_date}</td><td className="px-4 py-3">{note.reason}</td><td className="px-4 py-3 text-right font-mono">{Number(note.amount || 0).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
