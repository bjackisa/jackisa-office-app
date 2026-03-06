'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function LegalPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [docs, setDocs] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [form, setForm] = useState({ name: '', document_type: '', template_content: '' })

  const loadData = async () => {
    const ctx = await getSessionContext(); if (!ctx?.companyId) return
    setCompanyId(ctx.companyId); setUserId(ctx.userId)
    const { data } = await supabase.from('legal_document_templates').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false })
    setDocs(data || [])
  }
  useEffect(()=>{loadData()},[])

  const filtered = docs.filter((d)=>!searchQuery||d.name?.toLowerCase().includes(searchQuery.toLowerCase())||d.document_type?.toLowerCase().includes(searchQuery.toLowerCase()))

  const addDoc = async () => {
    if (!companyId || !userId || !form.name || !form.document_type || !form.template_content) return
    await supabase.from('legal_document_templates').insert({ company_id: companyId, name: form.name, document_type: form.document_type, template_content: form.template_content, created_by: userId })
    setForm({ name: '', document_type: '', template_content: '' })
    await loadData()
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Legal Documents</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage legal document templates</p>
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02]">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Search className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add Template</h3>
            <p className="text-[11px] text-muted-foreground/60">Create a new legal document template</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <Input placeholder="Template name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Document type *" value={form.document_type} onChange={e => setForm({ ...form, document_type: e.target.value })} />
        </div>
        <textarea
          className="w-full mt-3 border border-input rounded-xl px-3.5 py-2.5 text-sm bg-background placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary/40 transition-all"
          rows={5}
          placeholder="Template content *"
          value={form.template_content}
          onChange={e => setForm({ ...form, template_content: e.target.value })}
        />
        <div className="mt-4 pt-4 border-t border-border/30">
          <Button size="sm" onClick={addDoc}>Save Template</Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
          <Input className="pl-10" placeholder="Search template or type..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="!py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                      <Search className="w-6 h-6 text-muted-foreground/25" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">No templates found</p>
                    <p className="text-xs text-muted-foreground/40 mt-1">Add a template above to get started</p>
                  </td>
                </tr>
              ) : filtered.map((d: any) => (
                <tr key={d.id} className="group">
                  <td className="font-medium text-foreground">{d.name}</td>
                  <td className="text-muted-foreground">{d.document_type}</td>
                  <td className="text-xs text-muted-foreground/50">{new Date(d.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border/20 bg-muted/10">
            <p className="text-xs text-muted-foreground/50">Showing <span className="font-semibold text-foreground">{filtered.length}</span> templates</p>
          </div>
        )}
      </Card>
    </div>
  )
}
