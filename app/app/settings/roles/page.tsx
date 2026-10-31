'use client'

import { useEffect, useState, Fragment } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Lock, ChevronDown, ChevronRight, Save } from 'lucide-react'
import { FEATURES } from '@/lib/lic/features'

export default function RolesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [roles, setRoles] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [defaultFilter, setDefaultFilter] = useState('')
  const [form, setForm] = useState({ name: '', description: '' })
  const [expanded, setExpanded] = useState<string | null>(null)
  const [grants, setGrants] = useState<Record<string, Record<string, boolean>>>({})
  const [savingRole, setSavingRole] = useState<string | null>(null)

  const loadData = async () => {
    const ctx = await getSessionContext(); if (!ctx?.companyId) return
    setCompanyId(ctx.companyId)
    const { data } = await supabase.from('company_roles').select('*').eq('company_id', ctx.companyId).order('name')
    setRoles(data || [])

    const { data: roleGrants } = await supabase
      .from('company_role_features')
      .select('company_role_id, feature_slug, enabled')
    const byRole: Record<string, Record<string, boolean>> = {}
    for (const g of roleGrants || []) {
      byRole[g.company_role_id] = byRole[g.company_role_id] || {}
      byRole[g.company_role_id][g.feature_slug] = g.enabled
    }
    setGrants(byRole)
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

  const setGrant = (roleId: string, slug: string, enabled: boolean) => {
    setGrants((g) => ({ ...g, [roleId]: { ...(g[roleId] || {}), [slug]: enabled } }))
  }

  const saveGrants = async (roleId: string) => {
    setSavingRole(roleId)
    const rows = Object.entries(grants[roleId] || {}).map(([feature_slug, enabled]) => ({
      company_role_id: roleId,
      feature_slug,
      enabled,
    }))
    if (rows.length) {
      await supabase.from('company_role_features').upsert(rows, { onConflict: 'company_role_id,feature_slug' })
    }
    setSavingRole(null)
  }

  const featureSlugs = Object.keys(FEATURES)

  return (
    <div className="p-6 lg:p-8 max-w-[1000px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Roles & Permissions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Decide exactly which modules each role can open</p>
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
                <th className="text-right">Access</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="!py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                      <Search className="w-6 h-6 text-muted-foreground/25" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">No roles found</p>
                    <p className="text-xs text-muted-foreground/40 mt-1">Add a role above to get started</p>
                  </td>
                </tr>
              ) : filtered.map((r: any) => {
                const isOpen = expanded === r.id
                const roleGrants = grants[r.id] || {}
                const grantedCount = Object.values(roleGrants).filter(Boolean).length
                return (
                  <Fragment key={r.id}>
                    <tr className="group">
                      <td className="font-medium text-foreground">{r.name}</td>
                      <td className="text-muted-foreground">{r.description || '—'}</td>
                      <td>
                        <span className={`badge ${r.is_default ? 'badge-info' : 'badge-neutral'}`}>
                          {r.is_default ? 'Default' : 'Custom'}
                        </span>
                      </td>
                      <td className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setExpanded(isOpen ? null : r.id)}
                        >
                          {isOpen ? <ChevronDown className="w-3.5 h-3.5 mr-1" /> : <ChevronRight className="w-3.5 h-3.5 mr-1" />}
                          {grantedCount > 0 ? `${grantedCount} granted` : 'Configure'}
                        </Button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={4} className="!py-0">
                          <div className="py-5">
                            <div className="flex items-center gap-2 mb-3">
                              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Modules for {r.name}
                              </p>
                            </div>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {featureSlugs.map((slug) => {
                                const def = FEATURES[slug]
                                const on = roleGrants[slug] ?? false
                                return (
                                  <label key={slug} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/40 hover:bg-muted/30 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={(e) => setGrant(r.id, slug, e.target.checked)}
                                      className="accent-primary"
                                    />
                                    <span className="min-w-0">
                                      <span className="block text-xs font-medium text-foreground truncate">{def.name}</span>
                                      <span className="block text-[10px] text-muted-foreground/50 capitalize">
                                        needs {def.minTier} · {def.category}
                                      </span>
                                    </span>
                                  </label>
                                )
                              })}
                            </div>
                            <div className="mt-4 flex items-center gap-3">
                              <Button size="sm" onClick={() => saveGrants(r.id)} disabled={savingRole === r.id}>
                                <Save className="w-3.5 h-3.5 mr-1.5" />
                                {savingRole === r.id ? 'Saving...' : 'Save access'}
                              </Button>
                              <p className="text-[11px] text-muted-foreground/50">
                                A module still needs the licence tier to unlock it — role grants narrow, never widen, the plan.
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
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
