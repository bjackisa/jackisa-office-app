'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function RolesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [roles, setRoles] = useState<any[]>([])
  const [form, setForm] = useState({ name: '', description: '' })

  const loadData = async () => {
    const ctx = await getSessionContext(); if (!ctx?.companyId) return
    setCompanyId(ctx.companyId)
    const { data } = await supabase.from('company_roles').select('*').eq('company_id', ctx.companyId).order('name')
    setRoles(data || [])
  }
  useEffect(()=>{loadData()},[])

  const addRole = async () => {
    if (!companyId || !form.name) return
    await supabase.from('company_roles').insert({ company_id: companyId, name: form.name, description: form.description || null, is_default: false })
    setForm({ name: '', description: '' })
    await loadData()
  }

  return <div className="p-6 lg:p-8 max-w-[1000px] mx-auto space-y-6"><h1 className="text-2xl font-bold">Roles & Permissions</h1><Card className="p-4 space-y-3"><div className="grid md:grid-cols-2 gap-3"><Input placeholder="Role name" value={form.name} onChange={e=>setForm({ ...form, name: e.target.value })}/><Input placeholder="Description" value={form.description} onChange={e=>setForm({ ...form, description: e.target.value })}/></div><Button onClick={addRole}>Add Role</Button></Card><Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500"><th className="px-4 py-2 text-left">Role</th><th className="px-4 py-2 text-left">Description</th><th className="px-4 py-2 text-left">Default</th></tr></thead><tbody>{roles.length===0?<tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No roles</td></tr>:roles.map((r:any)=><tr key={r.id} className="border-b"><td className="px-4 py-2">{r.name}</td><td className="px-4 py-2">{r.description || '—'}</td><td className="px-4 py-2">{r.is_default ? 'Yes' : 'No'}</td></tr>)}</tbody></table></Card></div>
}
