'use client'
import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function DividendsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [dividends, setDividends] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState({ dividend_date: new Date().toISOString().split('T')[0], total_amount: '', status: 'pending' })
  const loadData = async () => { const ctx = await getSessionContext(); if (!ctx?.companyId) return; setCompanyId(ctx.companyId); const { data } = await supabase.from('dividends').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false }); setDividends(data || []) }
  useEffect(()=>{loadData()},[])
  const filtered = dividends.filter((d)=>{const s=!searchQuery||d.dividend_date?.includes(searchQuery); const st=!statusFilter||d.status===statusFilter; return s&&st})
  const addDividend = async () => { if (!companyId || !form.total_amount) return; await supabase.from('dividends').insert({ company_id: companyId, dividend_date: form.dividend_date, total_amount: Number(form.total_amount), status: form.status }); setForm({ dividend_date: new Date().toISOString().split('T')[0], total_amount: '', status: 'pending' }); await loadData() }
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

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead><tr><th>Date</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={3} className="!py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4"><Search className="w-6 h-6 text-muted-foreground/25" /></div>
                  <p className="text-sm text-muted-foreground font-medium">No dividends found</p>
                </td></tr>
              ) : filtered.map((d: any) => (
                <tr key={d.id} className="group">
                  <td className="text-xs text-muted-foreground whitespace-nowrap">{d.dividend_date}</td>
                  <td className="text-right font-mono font-bold tabular-nums text-foreground">{Number(d.total_amount || 0).toLocaleString()}</td>
                  <td><span className={`badge ${d.status === 'paid' ? 'badge-success' : d.status === 'approved' ? 'badge-info' : 'badge-warning'}`}>{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
