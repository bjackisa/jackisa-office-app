'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function BookkeepingPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [form, setForm] = useState({ entry_date: new Date().toISOString().split('T')[0], description: '', reference_number: '', account_id: '', debit: '', credit: '' })

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    setCompanyId(ctx.companyId)
    setUserId(ctx.userId)

    const [entryRes, accountRes] = await Promise.all([
      supabase
        .from('bookkeeping_entries')
        .select('*, journal_entries(*, accounting_accounts(account_code, account_name))')
        .eq('company_id', ctx.companyId)
        .order('entry_date', { ascending: false })
        .limit(100),
      supabase
        .from('accounting_accounts')
        .select('id, account_code, account_name')
        .eq('company_id', ctx.companyId)
        .order('account_code', { ascending: true }),
    ])

    setEntries(entryRes.data || [])
    setAccounts(accountRes.data || [])
  }

  useEffect(() => {
    loadData()
  }, [])

  const createEntry = async () => {
    if (!companyId || !userId || !form.description || !form.account_id) return
    const debit = Number(form.debit || 0)
    const credit = Number(form.credit || 0)
    if (debit <= 0 && credit <= 0) return

    const { data: created } = await supabase
      .from('bookkeeping_entries')
      .insert({
        company_id: companyId,
        entry_date: form.entry_date,
        description: form.description,
        reference_number: form.reference_number || null,
        created_by: userId,
      })
      .select('id')
      .single()

    if (created?.id) {
      await supabase.from('journal_entries').insert({
        bookkeeping_entry_id: created.id,
        accounting_account_id: form.account_id,
        debit,
        credit,
      })
    }

    setForm({ entry_date: new Date().toISOString().split('T')[0], description: '', reference_number: '', account_id: '', debit: '', credit: '' })
    await loadData()
  }

  const totals = useMemo(() => {
    let debit = 0
    let credit = 0
    entries.forEach((entry) => {
      ;(entry.journal_entries || []).forEach((journal: any) => {
        debit += Number(journal.debit || 0)
        credit += Number(journal.credit || 0)
      })
    })
    return { debit, credit }
  }, [entries])

  return (
    <div className="p-6 lg:p-8 max-w-[1300px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Bookkeeping</h1>
        <p className="text-sm text-gray-500">Record journal entries and track bookkeeping totals.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4 border border-gray-200/60"><p className="text-xs text-gray-500">Entries</p><p className="text-2xl font-bold">{entries.length}</p></Card>
        <Card className="p-4 border border-gray-200/60"><p className="text-xs text-gray-500">Total Debits</p><p className="text-2xl font-bold">{totals.debit.toLocaleString()}</p></Card>
        <Card className="p-4 border border-gray-200/60"><p className="text-xs text-gray-500">Total Credits</p><p className="text-2xl font-bold">{totals.credit.toLocaleString()}</p></Card>
      </div>

      <Card className="p-5 border border-gray-200/60 space-y-3">
        <h2 className="text-sm font-semibold">Record Entry</h2>
        <div className="grid md:grid-cols-6 gap-3">
          <Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
          <Input placeholder="Description" className="md:col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input placeholder="Reference" value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} />
          <select className="px-3 py-2 border rounded-md" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.account_code} - {account.account_name}</option>)}</select>
          <Input type="number" placeholder="Debit" value={form.debit} onChange={(e) => setForm({ ...form, debit: e.target.value })} />
          <Input type="number" placeholder="Credit" value={form.credit} onChange={(e) => setForm({ ...form, credit: e.target.value })} />
        </div>
        <Button onClick={createEntry}>Save Entry</Button>
      </Card>

      <Card className="border border-gray-200/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase"><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Description</th><th className="px-4 py-3 text-left">Reference</th><th className="px-4 py-3 text-left">Journal Lines</th></tr></thead>
            <tbody>
              {entries.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No entries recorded.</td></tr> : entries.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0 align-top">
                  <td className="px-4 py-3">{entry.entry_date}</td>
                  <td className="px-4 py-3">{entry.description}</td>
                  <td className="px-4 py-3">{entry.reference_number || '—'}</td>
                  <td className="px-4 py-3">
                    {(entry.journal_entries || []).length === 0 ? '—' : (
                      <div className="space-y-1">
                        {(entry.journal_entries || []).map((journal: any) => (
                          <div key={journal.id} className="text-xs text-gray-600 border rounded px-2 py-1">
                            {journal.accounting_accounts?.account_code} {journal.accounting_accounts?.account_name} | Dr {Number(journal.debit || 0).toLocaleString()} | Cr {Number(journal.credit || 0).toLocaleString()}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
