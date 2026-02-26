'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function CMSPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [pages, setPages] = useState<any[]>([])
  const [form, setForm] = useState({ title: '', slug: '', content: '' })

  const loadData = async () => {
    const ctx = await getSessionContext(); if (!ctx?.companyId) return
    setCompanyId(ctx.companyId); setUserId(ctx.userId)
    const { data } = await supabase.from('cms_pages').select('*').eq('company_id', ctx.companyId).order('updated_at', { ascending: false })
    setPages(data || [])
  }
  useEffect(()=>{loadData()},[])

  const savePage = async () => {
    if (!companyId || !userId || !form.title || !form.slug || !form.content) return
    await supabase.from('cms_pages').upsert({ company_id: companyId, title: form.title, slug: form.slug, content: form.content, status: 'draft', updated_by: userId }, { onConflict: 'company_id,slug' })
    setForm({ title: '', slug: '', content: '' })
    await loadData()
  }

  return <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6"><h1 className="text-2xl font-bold">CMS</h1><Card className="p-4 space-y-3"><div className="grid md:grid-cols-2 gap-3"><Input placeholder="Title" value={form.title} onChange={e=>setForm({ ...form, title: e.target.value })}/><Input placeholder="Slug" value={form.slug} onChange={e=>setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g,'-') })}/></div><textarea className="w-full border rounded p-2 text-sm" rows={6} placeholder="Page content" value={form.content} onChange={e=>setForm({ ...form, content: e.target.value })}/><Button onClick={savePage}>Save Page</Button></Card><Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500"><th className="px-4 py-2 text-left">Title</th><th className="px-4 py-2 text-left">Slug</th><th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2 text-left">Updated</th></tr></thead><tbody>{pages.length===0?<tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No CMS pages</td></tr>:pages.map((p:any)=><tr key={p.id} className="border-b"><td className="px-4 py-2">{p.title}</td><td className="px-4 py-2">{p.slug}</td><td className="px-4 py-2 capitalize">{p.status}</td><td className="px-4 py-2">{new Date(p.updated_at || p.created_at).toLocaleString()}</td></tr>)}</tbody></table></Card></div>
}
