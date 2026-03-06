'use client'
import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function AffiliatePage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [programs, setPrograms] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState({ affiliate_name: '', commission_percent: '' })
  const loadData = async () => { const ctx = await getSessionContext(); if (!ctx?.companyId) return; setCompanyId(ctx.companyId); const { data } = await supabase.from('affiliate_programs').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false }); setPrograms(data || []) }
  useEffect(()=>{loadData()},[])
  const filtered = programs.filter((p)=>{const s=!searchQuery||p.affiliate_name?.toLowerCase().includes(searchQuery.toLowerCase()); const st=!statusFilter||p.status===statusFilter; return s&&st})
  const addProgram = async () => { if (!companyId || !form.affiliate_name || !form.commission_percent) return; await supabase.from('affiliate_programs').insert({ company_id: companyId, affiliate_name: form.affiliate_name, commission_percent: Number(form.commission_percent), status: 'active' }); setForm({ affiliate_name: '', commission_percent: '' }); await loadData() }
  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Affiliate Program</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage affiliate partnerships and commissions</p>
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02]">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Search className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add Affiliate</h3>
            <p className="text-[11px] text-muted-foreground/60">Register a new affiliate partner</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <Input placeholder="Affiliate name *" value={form.affiliate_name} onChange={e => setForm({ ...form, affiliate_name: e.target.value })} />
          <Input type="number" placeholder="Commission % *" value={form.commission_percent} onChange={e => setForm({ ...form, commission_percent: e.target.value })} />
        </div>
        <div className="mt-4 pt-4 border-t border-border/30">
          <Button size="sm" onClick={addProgram}>Add Affiliate</Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input className="pl-10" placeholder="Search affiliate..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <select className="form-select w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead><tr><th>Name</th><th className="text-right">Rate</th><th className="text-right">Commission Paid</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="!py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4"><Search className="w-6 h-6 text-muted-foreground/25" /></div>
                  <p className="text-sm text-muted-foreground font-medium">No affiliates found</p>
                </td></tr>
              ) : filtered.map((p: any) => (
                <tr key={p.id} className="group">
                  <td className="font-medium text-foreground">{p.affiliate_name}</td>
                  <td className="text-right font-mono text-sm">{Number(p.commission_percent || 0).toFixed(2)}%</td>
                  <td className="text-right font-mono font-bold tabular-nums text-foreground">{Number(p.commission_paid || 0).toLocaleString()}</td>
                  <td><span className={`badge ${p.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
