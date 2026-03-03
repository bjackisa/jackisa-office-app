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
  return <div className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6"><h1 className="text-2xl font-bold">Dividends</h1><Card className="p-4 space-y-3"><div className="grid md:grid-cols-3 gap-3"><Input type="date" value={form.dividend_date} onChange={e=>setForm({ ...form, dividend_date: e.target.value })}/><Input type="number" placeholder="Total amount" value={form.total_amount} onChange={e=>setForm({ ...form, total_amount: e.target.value })}/><select className="px-3 py-2 border rounded" value={form.status} onChange={e=>setForm({ ...form, status: e.target.value })}><option value="pending">pending</option><option value="approved">approved</option><option value="paid">paid</option></select></div><Button onClick={addDividend}>Create Dividend</Button></Card><Card className="p-3 border border-gray-200/60"><div className="flex flex-col sm:flex-row gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/><Input className="pl-10" placeholder="Search by date..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}/></div><select className="px-3 py-2 border rounded-lg text-sm" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All Status</option><option value="pending">pending</option><option value="approved">approved</option><option value="paid">paid</option></select></div></Card><Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500"><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-left">Status</th></tr></thead><tbody>{filtered.length===0?<tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No dividends</td></tr>:filtered.map((d:any)=><tr key={d.id} className="border-b"><td className="px-4 py-2">{d.dividend_date}</td><td className="px-4 py-2 text-right font-mono">{Number(d.total_amount||0).toLocaleString()}</td><td className="px-4 py-2 capitalize">{d.status}</td></tr>)}</tbody></table></Card></div>
}
