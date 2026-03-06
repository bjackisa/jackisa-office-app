'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function CMSPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [pages, setPages] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState({ title: '', slug: '', content: '' })

  const loadData = async () => {
    const ctx = await getSessionContext(); if (!ctx?.companyId) return
    setCompanyId(ctx.companyId); setUserId(ctx.userId)
    const { data } = await supabase.from('cms_pages').select('*').eq('company_id', ctx.companyId).order('updated_at', { ascending: false })
    setPages(data || [])
  }
  useEffect(()=>{loadData()},[])
  const filtered = pages.filter((p)=>{const s=!searchQuery||p.title?.toLowerCase().includes(searchQuery.toLowerCase())||p.slug?.toLowerCase().includes(searchQuery.toLowerCase()); const st=!statusFilter||p.status===statusFilter; return s&&st})

  const savePage = async () => { if (!companyId || !userId || !form.title || !form.slug || !form.content) return; await supabase.from('cms_pages').upsert({ company_id: companyId, title: form.title, slug: form.slug, content: form.content, status: 'draft', updated_by: userId }, { onConflict: 'company_id,slug' }); setForm({ title: '', slug: '', content: '' }); await loadData() }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">CMS</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage website pages and content</p>
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02]">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Search className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Create Page</h3>
            <p className="text-[11px] text-muted-foreground/60">Add a new CMS page</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <Input placeholder="Title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <Input placeholder="Slug *" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} />
        </div>
        <textarea
          className="w-full mt-3 border border-input rounded-xl px-3.5 py-2.5 text-sm bg-background placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary/40 transition-all"
          rows={6}
          placeholder="Page content *"
          value={form.content}
          onChange={e => setForm({ ...form, content: e.target.value })}
        />
        <div className="mt-4 pt-4 border-t border-border/30">
          <Button size="sm" onClick={savePage}>Save Page</Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input className="pl-10" placeholder="Search title or slug..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <select className="form-select w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead><tr><th>Title</th><th>Slug</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="!py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4"><Search className="w-6 h-6 text-muted-foreground/25" /></div>
                  <p className="text-sm text-muted-foreground font-medium">No CMS pages found</p>
                </td></tr>
              ) : filtered.map((p: any) => (
                <tr key={p.id} className="group">
                  <td className="font-medium text-foreground">{p.title}</td>
                  <td className="font-mono text-xs text-muted-foreground">{p.slug}</td>
                  <td><span className={`badge ${p.status === 'published' ? 'badge-success' : p.status === 'draft' ? 'badge-warning' : 'badge-neutral'}`}>{p.status}</span></td>
                  <td className="text-xs text-muted-foreground/50">{new Date(p.updated_at || p.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
