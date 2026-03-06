'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function BookkeepingPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
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

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return entries.filter(e => {
      if (!q) return true
      return (e.description || '').toLowerCase().includes(q) || (e.reference_number || '').toLowerCase().includes(q)
    })
  }, [entries, searchQuery])

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
    <div className="p-6 lg:p-8 max-w-[1300px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Bookkeeping</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Record journal entries and track bookkeeping totals.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 stagger-children">
        {[
          { label: 'Total Entries', value: entries.length, gradient: 'from-blue-500 to-blue-600' },
          { label: 'Total Debits', value: totals.debit.toLocaleString(), gradient: 'from-emerald-500 to-green-600' },
          { label: 'Total Credits', value: totals.credit.toLocaleString(), gradient: 'from-violet-500 to-purple-600' },
        ].map(stat => (
          <Card key={stat.label} className="stat-card p-4">
            <p className="text-[11px] text-muted-foreground font-medium mb-1">{stat.label}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02]">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Search className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Record Entry</h3>
            <p className="text-[11px] text-muted-foreground/60">Add a new journal entry</p>
          </div>
        </div>
        <div className="grid md:grid-cols-6 gap-3">
          <Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
          <Input placeholder="Description *" className="md:col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input placeholder="Reference" value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} />
          <select className="form-select" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
            <option value="">Select account *</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.account_code} - {account.account_name}</option>)}
          </select>
          <Input type="number" placeholder="Debit" value={form.debit} onChange={(e) => setForm({ ...form, debit: e.target.value })} />
          <Input type="number" placeholder="Credit" value={form.credit} onChange={(e) => setForm({ ...form, credit: e.target.value })} />
        </div>
        <div className="mt-4 pt-4 border-t border-border/30">
          <Button size="sm" onClick={createEntry}>Save Entry</Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40"/>
          <Input className="pl-10" placeholder="Search description or reference..." value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Reference</th>
                <th>Journal Lines</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="!py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                      <Search className="w-6 h-6 text-muted-foreground/25" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">No entries recorded</p>
                    <p className="text-xs text-muted-foreground/40 mt-1">Create your first journal entry above</p>
                  </td>
                </tr>
              ) : filtered.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <td className="text-muted-foreground text-xs whitespace-nowrap">{entry.entry_date}</td>
                  <td className="font-medium text-foreground">{entry.description}</td>
                  <td className="text-muted-foreground">{entry.reference_number || '—'}</td>
                  <td>
                    {(entry.journal_entries || []).length === 0 ? '—' : (
                      <div className="space-y-1.5">
                        {(entry.journal_entries || []).map((journal: any) => (
                          <div key={journal.id} className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-2.5 py-1.5 flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground">{journal.accounting_accounts?.account_code}</span>
                            <span>{journal.accounting_accounts?.account_name}</span>
                            <span className="text-muted-foreground/30">|</span>
                            <span className="text-emerald-600 font-mono tabular-nums">Dr {Number(journal.debit || 0).toLocaleString()}</span>
                            <span className="text-muted-foreground/30">|</span>
                            <span className="text-blue-600 font-mono tabular-nums">Cr {Number(journal.credit || 0).toLocaleString()}</span>
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
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border/20 bg-muted/10">
            <p className="text-xs text-muted-foreground/50">Showing <span className="font-semibold text-foreground">{filtered.length}</span> entries</p>
          </div>
        )}
      </Card>
    </div>
  )
}
