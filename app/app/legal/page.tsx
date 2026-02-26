'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LegalPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [docs, setDocs] = useState<any[]>([])
  const [form, setForm] = useState({ name: '', document_type: '', template_content: '' })

  const loadData = async () => {
    const ctx = await getSessionContext(); if (!ctx?.companyId) return
    setCompanyId(ctx.companyId); setUserId(ctx.userId)
    const { data } = await supabase.from('legal_document_templates').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false })
    setDocs(data || [])
  }
  useEffect(()=>{loadData()},[])

  const addDoc = async () => {
    if (!companyId || !userId || !form.name || !form.document_type || !form.template_content) return
    await supabase.from('legal_document_templates').insert({ company_id: companyId, name: form.name, document_type: form.document_type, template_content: form.template_content, created_by: userId })
    setForm({ name: '', document_type: '', template_content: '' })
    await loadData()
  }

  return <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6"><h1 className="text-2xl font-bold">Legal Documents</h1><Card className="p-4 space-y-3"><div className="grid md:grid-cols-2 gap-3"><Input placeholder="Template name" value={form.name} onChange={e=>setForm({ ...form, name: e.target.value })}/><Input placeholder="Document type" value={form.document_type} onChange={e=>setForm({ ...form, document_type: e.target.value })}/></div><textarea className="w-full border rounded p-2 text-sm" rows={5} placeholder="Template content" value={form.template_content} onChange={e=>setForm({ ...form, template_content: e.target.value })}/><Button onClick={addDoc}>Save Template</Button></Card><Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500"><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-left">Type</th><th className="px-4 py-2 text-left">Updated</th></tr></thead><tbody>{docs.length===0?<tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No templates</td></tr>:docs.map((d:any)=><tr key={d.id} className="border-b"><td className="px-4 py-2">{d.name}</td><td className="px-4 py-2">{d.document_type}</td><td className="px-4 py-2">{new Date(d.created_at).toLocaleString()}</td></tr>)}</tbody></table></Card></div>
}
