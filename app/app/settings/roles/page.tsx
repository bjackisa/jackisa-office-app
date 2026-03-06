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

  return (
    <div className="p-6 lg:p-8 max-w-[1000px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Roles & Permissions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage roles for your workspace</p>
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02]">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Search className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add Role</h3>
            <p className="text-[11px] text-muted-foreground/60">Create a new role for your team</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <Input placeholder="Role name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="mt-4 pt-4 border-t border-border/30">
          <Button size="sm" onClick={addRole}>Add Role</Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input placeholder="Search role or description..." className="pl-10" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <select className="form-select w-auto" value={defaultFilter} onChange={e => setDefaultFilter(e.target.value)}>
            <option value="">All Types</option>
            <option value="true">Default</option>
            <option value="false">Custom</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Description</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="!py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                      <Search className="w-6 h-6 text-muted-foreground/25" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">No roles found</p>
                    <p className="text-xs text-muted-foreground/40 mt-1">Add a role above to get started</p>
                  </td>
                </tr>
              ) : filtered.map((r: any) => (
                <tr key={r.id} className="group">
                  <td className="font-medium text-foreground">{r.name}</td>
                  <td className="text-muted-foreground">{r.description || '—'}</td>
                  <td>
                    <span className={`badge ${r.is_default ? 'badge-info' : 'badge-neutral'}`}>
                      {r.is_default ? 'Default' : 'Custom'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border/20 bg-muted/10">
            <p className="text-xs text-muted-foreground/50">Showing <span className="font-semibold text-foreground">{filtered.length}</span> roles</p>
          </div>
        )}
      </Card>
    </div>
  )
}
