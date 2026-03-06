'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Zap } from 'lucide-react'
import { logEcosystemEvent } from '@/lib/ecosystem'

export default function PerformancePage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [records, setRecords] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [form, setForm] = useState({ employee_id: '', points: '', description: '' })
  const [ecosystemMsg, setEcosystemMsg] = useState<string | null>(null)

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    setCompanyId(ctx.companyId)
    setUserId(ctx.userId)

    const [recRes, empRes] = await Promise.all([
      supabase.from('hr_points').select('*, company_employees(users(full_name))').eq('company_id', ctx.companyId).eq('point_type', 'performance').order('created_at', { ascending: false }),
      supabase.from('company_employees').select('id, users(full_name)').eq('company_id', ctx.companyId).eq('status', 'active'),
    ])

    setRecords(recRes.data || [])
    setEmployees(empRes.data || [])
  }

  useEffect(() => { loadData() }, [])

  const addRecord = async () => {
    if (!companyId || !userId || !form.employee_id || !form.points) return
    const pts = Number(form.points)
    await supabase.from('hr_points').insert({
      company_id: companyId,
      employee_id: form.employee_id,
      point_type: 'performance',
      points: pts,
      description: form.description || null,
      recorded_by: userId,
    })

    // Ecosystem: log performance review event
    await logEcosystemEvent({ companyId, eventType: 'performance_reviewed', sourceTable: 'hr_points', sourceId: form.employee_id, payload: { points: pts, description: form.description } })
    const empName = employees.find(e => e.id === form.employee_id)?.users?.full_name || 'Employee'
    setEcosystemMsg(`${empName}: ${pts > 0 ? '+' : ''}${pts} performance points recorded. Fund signal updated.`)
    setTimeout(() => setEcosystemMsg(null), 4000)

    setForm({ employee_id: '', points: '', description: '' })
    await loadData()
  }

  const leaderboard = useMemo(() => {
    const map: Record<string, { name: string; score: number }> = {}
    for (const r of records) {
      const key = r.employee_id
      const name = r.company_employees?.users?.full_name || 'Unknown'
      if (!map[key]) map[key] = { name, score: 0 }
      map[key].score += Number(r.points || 0)
    }
    return Object.values(map).sort((a, b) => b.score - a.score)
  }, [records])

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Performance Reviews</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track and manage employee performance</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 stagger-children">
        {[
          { label: 'Total Reviews', value: records.length },
          { label: 'Average Score', value: records.length ? (records.reduce((s:number,r:any)=>s+Number(r.points||0),0)/records.length).toFixed(1) : '0.0' },
          { label: 'Employees Rated', value: leaderboard.length },
        ].map(stat => (
          <Card key={stat.label} className="stat-card p-4">
            <p className="text-[11px] text-muted-foreground font-medium mb-1">{stat.label}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
          </Card>
        ))}
      </div>

      {ecosystemMsg && (
        <Card className="p-3 border-blue-200 bg-blue-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-100"><Zap className="w-3.5 h-3.5 text-blue-600" /></div>
            <p className="text-xs font-medium text-blue-700">{ecosystemMsg}</p>
          </div>
        </Card>
      )}

      <Card className="p-5 border border-primary/15 bg-primary/[0.02] space-y-3">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add Performance Record</h3>
            <p className="text-[11px] text-muted-foreground/60">Rate an employee&apos;s performance</p>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <select className="form-select" value={form.employee_id} onChange={(e)=>setForm({ ...form, employee_id: e.target.value })}><option value="">Employee</option>{employees.map((e:any)=><option key={e.id} value={e.id}>{e.users?.full_name || 'Unnamed'}</option>)}</select>
          <Input type="number" placeholder="Points" value={form.points} onChange={(e)=>setForm({ ...form, points: e.target.value })} />
          <Input placeholder="Description" value={form.description} onChange={(e)=>setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="pt-3 border-t border-border/30">
          <Button size="sm" onClick={addRecord}>Save Record</Button>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Leaderboard</h3>
          <div className="space-y-2 text-sm">
            {leaderboard.length === 0 ? <p className="text-muted-foreground/60 text-xs">No scores yet</p> : leaderboard.map((l, idx) => (
              <div key={idx} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{idx + 1}</span>
                  <span className="text-foreground">{l.name}</span>
                </div>
                <span className="font-mono font-bold tabular-nums">{l.score}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Recent Records</h3>
          <div className="space-y-2 text-sm">
            {records.length === 0 ? <p className="text-muted-foreground/60 text-xs">No records</p> : records.slice(0, 12).map((r: any) => (
              <div key={r.id} className="border border-border/30 rounded-xl px-3 py-2">
                <div className="flex justify-between">
                  <span className="font-medium text-foreground">{r.company_employees?.users?.full_name || 'Unknown'}</span>
                  <span className="font-mono font-bold tabular-nums">{r.points}</span>
                </div>
                <p className="text-xs text-muted-foreground/60 mt-0.5">{r.description || 'No note'}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
