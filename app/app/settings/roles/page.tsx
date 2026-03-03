'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function RolesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [roles, setRoles] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [defaultFilter, setDefaultFilter] = useState('')
  const [form, setForm] = useState({ name: '', description: '' })

  const loadData = async () => {
    const ctx = await getSessionContext(); if (!ctx?.companyId) return
    setCompanyId(ctx.companyId)
    const { data } = await supabase.from('company_roles').select('*').eq('company_id', ctx.companyId).order('name')
    setRoles(data || [])
  }
  useEffect(()=>{loadData()},[])

  const filtered = roles.filter((role) => {
    const matchSearch = !searchQuery || role.name?.toLowerCase().includes(searchQuery.toLowerCase()) || role.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchDefault = !defaultFilter || String(role.is_default) === defaultFilter
    return matchSearch && matchDefault
  })

  const addRole = async () => {
    if (!companyId || !form.name) return
    await supabase.from('company_roles').insert({ company_id: companyId, name: form.name, description: form.description || null, is_default: false })
    setForm({ name: '', description: '' })
    await loadData()
  }

  return <div className="p-6 lg:p-8 max-w-[1000px] mx-auto space-y-6"><h1 className="text-2xl font-bold">Roles & Permissions</h1><Card className="p-4 space-y-3"><div className="grid md:grid-cols-2 gap-3"><Input placeholder="Role name" value={form.name} onChange={e=>setForm({ ...form, name: e.target.value })}/><Input placeholder="Description" value={form.description} onChange={e=>setForm({ ...form, description: e.target.value })}/></div><Button onClick={addRole}>Add Role</Button></Card><Card className="p-3 border border-gray-200/60"><div className="flex flex-col sm:flex-row gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/><Input placeholder="Search role or description..." className="pl-10" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}/></div><select className="px-3 py-2 border border-gray-200 rounded-lg text-sm" value={defaultFilter} onChange={e=>setDefaultFilter(e.target.value)}><option value="">All Types</option><option value="true">Default</option><option value="false">Custom</option></select></div></Card><Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500"><th className="px-4 py-2 text-left">Role</th><th className="px-4 py-2 text-left">Description</th><th className="px-4 py-2 text-left">Default</th></tr></thead><tbody>{filtered.length===0?<tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No roles</td></tr>:filtered.map((r:any)=><tr key={r.id} className="border-b"><td className="px-4 py-2">{r.name}</td><td className="px-4 py-2">{r.description || '—'}</td><td className="px-4 py-2">{r.is_default ? 'Yes' : 'No'}</td></tr>)}</tbody></table></Card></div>
}
