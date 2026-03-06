'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const accountTypes = ['asset', 'liability', 'equity', 'revenue', 'expense']

export default function ChartOfAccountsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<any[]>([])
  const [form, setForm] = useState({ account_code: '', account_name: '', account_type: 'asset', currency: 'UGX' })

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    setCompanyId(ctx.companyId)

    const { data } = await supabase
      .from('accounting_accounts')
      .select('*')
      .eq('company_id', ctx.companyId)
      .order('account_code', { ascending: true })

    setAccounts(data || [])
  }

  useEffect(() => {
    loadData()
  }, [])

  const createAccount = async () => {
    if (!companyId || !form.account_code || !form.account_name) return

    await supabase.from('accounting_accounts').insert({
      company_id: companyId,
      account_code: form.account_code,
      account_name: form.account_name,
      account_type: form.account_type,
      currency: form.currency || 'UGX',
      balance: 0,
    })

    setForm({ account_code: '', account_name: '', account_type: 'asset', currency: 'UGX' })
    await loadData()
  }

  const grouped = useMemo(() => accountTypes.map((t) => ({
    type: t,
    count: accounts.filter((a) => (a.account_type || '').toLowerCase() === t).length,
    balance: accounts.filter((a) => (a.account_type || '').toLowerCase() === t).reduce((s, a) => s + Number(a.balance || 0), 0),
  })), [accounts])

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Chart of Accounts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Create and analyze your company ledger accounts</p>
      </div>

      <div className="grid md:grid-cols-5 gap-3">
        {grouped.map((group) => (
          <Card key={group.type} className="stat-card p-4">
            <p className="text-[11px] uppercase text-muted-foreground font-medium">{group.type}</p>
            <p className="text-xl font-bold text-foreground tracking-tight">{group.count}</p>
            <p className="text-[10px] text-muted-foreground/60 font-mono">Bal: {group.balance.toLocaleString()}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02] space-y-3">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add Account</h3>
            <p className="text-[11px] text-muted-foreground/60">Create a new ledger account</p>
          </div>
        </div>
        <div className="grid md:grid-cols-4 gap-3">
          <Input placeholder="Account code (e.g. 1001)" value={form.account_code} onChange={(e) => setForm({ ...form, account_code: e.target.value })} />
          <Input placeholder="Account name" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
          <select className="form-select" value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })}>{accountTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <Input placeholder="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
        </div>
        <div className="pt-3 border-t border-border/30">
          <Button size="sm" onClick={createAccount}>Create Account</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Currency</th><th className="text-right">Balance</th></tr></thead>
            <tbody>
              {accounts.length === 0 ? <tr><td colSpan={5} className="!py-12 text-center text-muted-foreground/60">No accounts yet.</td></tr> : accounts.map((account) => (
                <tr key={account.id} className="group"><td className="font-mono text-xs text-muted-foreground">{account.account_code}</td><td className="font-medium text-foreground">{account.account_name}</td><td><span className="badge badge-neutral capitalize">{account.account_type}</span></td><td className="text-muted-foreground">{account.currency}</td><td className="text-right font-mono font-bold tabular-nums">{Number(account.balance || 0).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
