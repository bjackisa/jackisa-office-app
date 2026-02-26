'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function PerformancePage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [records, setRecords] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [form, setForm] = useState({ employee_id: '', points: '', description: '' })

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
    await supabase.from('hr_points').insert({
      company_id: companyId,
      employee_id: form.employee_id,
      point_type: 'performance',
      points: Number(form.points),
      description: form.description || null,
      recorded_by: userId,
    })
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
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Performance Reviews</h1>
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4"><p className="text-xs text-gray-500">Total Reviews</p><p className="text-2xl font-bold">{records.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-gray-500">Average Score</p><p className="text-2xl font-bold">{records.length ? (records.reduce((s:number,r:any)=>s+Number(r.points||0),0)/records.length).toFixed(1) : '0.0'}</p></Card>
        <Card className="p-4"><p className="text-xs text-gray-500">Employees Rated</p><p className="text-2xl font-bold">{leaderboard.length}</p></Card>
      </div>

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">Add Performance Record</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <select className="px-3 py-2 border rounded" value={form.employee_id} onChange={(e)=>setForm({ ...form, employee_id: e.target.value })}><option value="">Employee</option>{employees.map((e:any)=><option key={e.id} value={e.id}>{e.users?.full_name || 'Unnamed'}</option>)}</select>
          <Input type="number" placeholder="Points" value={form.points} onChange={(e)=>setForm({ ...form, points: e.target.value })} />
          <Input placeholder="Description" value={form.description} onChange={(e)=>setForm({ ...form, description: e.target.value })} />
        </div>
        <Button onClick={addRecord}>Save Record</Button>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Leaderboard</h3>
          <div className="space-y-2 text-sm">{leaderboard.length===0?<p className="text-gray-400">No scores yet</p>:leaderboard.map((l,idx)=><div key={idx} className="flex justify-between"><span>{l.name}</span><span className="font-mono">{l.score}</span></div>)}</div>
        </Card>
        <Card className="p-4 overflow-x-auto">
          <h3 className="font-semibold mb-2">Recent Records</h3>
          <div className="space-y-2 text-sm">{records.length===0?<p className="text-gray-400">No records</p>:records.slice(0,12).map((r:any)=><div key={r.id} className="border rounded px-2 py-1"><div className="flex justify-between"><span>{r.company_employees?.users?.full_name || 'Unknown'}</span><span className="font-mono">{r.points}</span></div><p className="text-xs text-gray-500">{r.description || 'No note'}</p></div>)}</div>
        </Card>
      </div>
    </div>
  )
}
