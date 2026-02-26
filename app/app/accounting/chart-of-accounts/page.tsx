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
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Chart of Accounts</h1>
        <p className="text-sm text-gray-500">Create and analyze your company ledger accounts.</p>
      </div>

      <div className="grid md:grid-cols-5 gap-3">
        {grouped.map((group) => (
          <Card key={group.type} className="p-4 border border-gray-200/60">
            <p className="text-xs uppercase text-gray-500">{group.type}</p>
            <p className="text-xl font-bold text-gray-900">{group.count}</p>
            <p className="text-xs text-gray-500">Bal: {group.balance.toLocaleString()}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5 border border-gray-200/60 space-y-3">
        <h2 className="text-sm font-semibold">Add Account</h2>
        <div className="grid md:grid-cols-4 gap-3">
          <Input placeholder="Account code (e.g. 1001)" value={form.account_code} onChange={(e) => setForm({ ...form, account_code: e.target.value })} />
          <Input placeholder="Account name" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
          <select className="px-3 py-2 border rounded-md" value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })}>{accountTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <Input placeholder="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
        </div>
        <Button onClick={createAccount}>Create Account</Button>
      </Card>

      <Card className="border border-gray-200/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500"><th className="px-4 py-3 text-left">Code</th><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Currency</th><th className="px-4 py-3 text-right">Balance</th></tr></thead>
            <tbody>
              {accounts.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No accounts yet.</td></tr> : accounts.map((account) => (
                <tr key={account.id} className="border-b last:border-0"><td className="px-4 py-3 font-mono">{account.account_code}</td><td className="px-4 py-3">{account.account_name}</td><td className="px-4 py-3 capitalize">{account.account_type}</td><td className="px-4 py-3">{account.currency}</td><td className="px-4 py-3 text-right font-mono">{Number(account.balance || 0).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
