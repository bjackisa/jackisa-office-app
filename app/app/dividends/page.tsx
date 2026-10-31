'use client'
import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { apiJson } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Users2 } from 'lucide-react'

export default function DividendsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [dividends, setDividends] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [allocations, setAllocations] = useState<Record<string, any[]>>({})
  const [distributing, setDistributing] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState({ dividend_date: new Date().toISOString().split('T')[0], total_amount: '', status: 'pending' })
  const loadData = async () => { const ctx = await getSessionContext(); if (!ctx?.companyId) return; setCompanyId(ctx.companyId); setUserId(ctx.userId || null); const { data } = await supabase.from('dividends').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false }); setDividends(data || []); const { data: allocs } = await supabase.from('dividend_allocations').select('dividend_id, employee_id, allocated_amount').in('dividend_id', (data || []).map((d: any) => d.id)); const grouped: Record<string, any[]> = {}; for (const a of allocs || []) { (grouped[a.dividend_id] ||= []).push(a) }; setAllocations(grouped) }
  useEffect(()=>{loadData()},[])
  const filtered = dividends.filter((d)=>{const s=!searchQuery||d.dividend_date?.includes(searchQuery); const st=!statusFilter||d.status===statusFilter; return s&&st})
  const addDividend = async () => { if (!companyId || !form.total_amount) return; await supabase.from('dividends').insert({ company_id: companyId, dividend_date: form.dividend_date, total_amount: Number(form.total_amount), status: form.status }); setForm({ dividend_date: new Date().toISOString().split('T')[0], total_amount: '', status: 'pending' }); await loadData() }

  const distribute = async (dividendId: string) => {
    setDistributing(dividendId)
    setMessage(null)
    const { data, error } = await supabase.rpc('jo_distribute_dividend', {
      p_dividend_id: dividendId,
      p_recorded_by: userId,
    })
    if (error) {
      setMessage(error.message)
    } else {
      setMessage(`Dividend distributed: ${Number(data || 0).toLocaleString()} allocated to unit holders pro-rata.`)
      void notifyDividendHolders(dividendId)
      await loadData()
    }
    setDistributing(null)
    setTimeout(() => setMessage(null), 8000)
  }

  /** Tell each unit holder their dividend automatically, with an advice PDF. */
  const notifyDividendHolders = async (dividendId: string) => {
    try {
      if (!companyId) return
      const dividend = dividends.find((d) => d.id === dividendId)
      const { data: allocs } = await supabase
        .from('dividend_allocations')
        .select('employee_id, allocated_amount, company_employees(user_id, users(full_name))')
        .eq('dividend_id', dividendId)
      for (const a of allocs || []) {
        const userId = (a as any).company_employees?.user_id
        const name = (a as any).company_employees?.users?.full_name || 'Member'
        if (!userId) continue
        await apiJson('/api/notify/event', {
          method: 'POST',
          body: JSON.stringify({
            companyId,
            event: 'dividend.declared',
            dedupeKey: `dividend.declared:${dividendId}:${a.employee_id}`,
            userIds: [userId],
            subjectType: 'dividend',
            subjectId: dividendId,
            data: {
              memberName: name,
              amount: Number(a.allocated_amount || 0),
              currency: 'UGX',
              payoutDate: dividend?.dividend_date,
            },
          }),
        })
      }
    } catch (err) {
      console.error('[dividend.declared] notify failed', err)
    }
  }
  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Dividends</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage dividend distributions</p>
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02]">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Search className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Create Dividend</h3>
            <p className="text-[11px] text-muted-foreground/60">Record a new dividend distribution</p>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Input type="date" value={form.dividend_date} onChange={e => setForm({ ...form, dividend_date: e.target.value })} />
          <Input type="number" placeholder="Total amount *" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} />
          <select className="form-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            <option value="pending">Pending</option><option value="approved">Approved</option><option value="paid">Paid</option>
          </select>
        </div>
        <div className="mt-4 pt-4 border-t border-border/30">
          <Button size="sm" onClick={addDividend}>Create Dividend</Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input className="pl-10" placeholder="Search by date..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <select className="form-select w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="paid">Paid</option>
          </select>
        </div>
      </Card>

      {message && (
        <Card className="p-3 border-primary/20 bg-primary/[0.04]">
          <p className="text-xs font-medium text-primary">{message}</p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead><tr><th>Date</th><th className="text-right">Amount</th><th>Status</th><th className="text-right">Holders</th><th></th></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="!py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4"><Search className="w-6 h-6 text-muted-foreground/25" /></div>
                  <p className="text-sm text-muted-foreground font-medium">No dividends found</p>
                </td></tr>
              ) : filtered.map((d: any) => (
                <tr key={d.id} className="group">
                  <td className="text-xs text-muted-foreground whitespace-nowrap">{d.dividend_date}</td>
                  <td className="text-right font-mono font-bold tabular-nums text-foreground">{Number(d.total_amount || 0).toLocaleString()}</td>
                  <td><span className={`badge ${d.status === 'paid' ? 'badge-success' : d.status === 'approved' ? 'badge-info' : 'badge-warning'}`}>{d.status}</span></td>
                  <td className="text-right text-xs text-muted-foreground">
                    {allocations[d.id]?.length ? (
                      <span className="inline-flex items-center gap-1"><Users2 className="w-3 h-3" />{allocations[d.id].length}</span>
                    ) : '—'}
                  </td>
                  <td className="text-right">
                    {d.status !== 'paid' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={distributing === d.id}
                        onClick={() => distribute(d.id)}
                      >
                        {distributing === d.id ? 'Distributing…' : 'Distribute'}
                      </Button>
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
