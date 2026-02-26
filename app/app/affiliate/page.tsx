'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function AffiliatePage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [programs, setPrograms] = useState<any[]>([])
  const [form, setForm] = useState({ affiliate_name: '', commission_percent: '' })

  const loadData = async () => {
    const ctx = await getSessionContext(); if (!ctx?.companyId) return
    setCompanyId(ctx.companyId)
    const { data } = await supabase.from('affiliate_programs').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false })
    setPrograms(data || [])
  }
  useEffect(()=>{loadData()},[])

  const addProgram = async () => {
    if (!companyId || !form.affiliate_name || !form.commission_percent) return
    await supabase.from('affiliate_programs').insert({ company_id: companyId, affiliate_name: form.affiliate_name, commission_percent: Number(form.commission_percent), status: 'active' })
    setForm({ affiliate_name: '', commission_percent: '' })
    await loadData()
  }

  return <div className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6"><h1 className="text-2xl font-bold">Affiliate Program</h1><Card className="p-4 space-y-3"><div className="grid md:grid-cols-2 gap-3"><Input placeholder="Affiliate name" value={form.affiliate_name} onChange={e=>setForm({ ...form, affiliate_name: e.target.value })}/><Input type="number" placeholder="Commission %" value={form.commission_percent} onChange={e=>setForm({ ...form, commission_percent: e.target.value })}/></div><Button onClick={addProgram}>Add Affiliate</Button></Card><Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500"><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Commission Paid</th><th className="px-4 py-2 text-left">Status</th></tr></thead><tbody>{programs.length===0?<tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No affiliates</td></tr>:programs.map((p:any)=><tr key={p.id} className="border-b"><td className="px-4 py-2">{p.affiliate_name}</td><td className="px-4 py-2 text-right">{Number(p.commission_percent||0).toFixed(2)}%</td><td className="px-4 py-2 text-right font-mono">{Number(p.commission_paid||0).toLocaleString()}</td><td className="px-4 py-2 capitalize">{p.status}</td></tr>)}</tbody></table></Card></div>
}
