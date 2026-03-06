'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Wallet, Plus, Search } from 'lucide-react'

export default function SalaryStructuresPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [structures, setStructures] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [form, setForm] = useState({ employee_id: '', basic_salary: '', housing_allowance: '0', transport_allowance: '0', medical_allowance: '0', effective_from: new Date().toISOString().split('T')[0] })

  const loadData = async () => {
    setLoading(true)
    const context = await getSessionContext()
    if (!context?.companyId) {
      setLoading(false)
      return
    }
    setCompanyId(context.companyId)

    const [employeesRes, structuresRes] = await Promise.all([
      supabase.from('company_employees').select('id, users(full_name)').eq('company_id', context.companyId).eq('status', 'active'),
      supabase.from('salary_structures').select('*, company_employees(users(full_name))').eq('company_id', context.companyId).eq('is_current', true).order('created_at', { ascending: false }),
    ])

    setEmployees(employeesRes.data || [])
    setStructures(structuresRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const saveStructure = async () => {
    if (!companyId || !form.employee_id || !form.basic_salary) return

    await supabase
      .from('salary_structures')
      .update({ is_current: false, effective_to: form.effective_from })
      .eq('company_id', companyId)
      .eq('employee_id', form.employee_id)
      .eq('is_current', true)

    await supabase.from('salary_structures').insert({
      company_id: companyId,
      employee_id: form.employee_id,
      basic_salary: Number(form.basic_salary),
      housing_allowance: Number(form.housing_allowance || 0),
      transport_allowance: Number(form.transport_allowance || 0),
      medical_allowance: Number(form.medical_allowance || 0),
      effective_from: form.effective_from,
      is_current: true,
    })

    setForm({ employee_id: '', basic_salary: '', housing_allowance: '0', transport_allowance: '0', medical_allowance: '0', effective_from: new Date().toISOString().split('T')[0] })
    await loadData()
  }

  const filtered = structures.filter((row:any)=>!searchQuery || row.company_employees?.users?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()))

  const total = (row: any) => Number(row.basic_salary || 0) + Number(row.housing_allowance || 0) + Number(row.transport_allowance || 0) + Number(row.medical_allowance || 0)

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Salary Structures</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Create and maintain employee salary structures</p>
      </div>

      <Card className="p-5 border border-primary/15 bg-primary/[0.02] space-y-4">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Plus className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add Salary Structure</h3>
            <p className="text-[11px] text-muted-foreground/60">Define salary components for an employee</p>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <select className="form-select" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">Select employee</option>
            {employees.map((employee: any) => <option key={employee.id} value={employee.id}>{employee.users?.full_name || 'Unnamed'}</option>)}
          </select>
          <Input type="number" placeholder="Basic salary" value={form.basic_salary} onChange={(e) => setForm({ ...form, basic_salary: e.target.value })} />
          <Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
          <Input type="number" placeholder="Housing allowance" value={form.housing_allowance} onChange={(e) => setForm({ ...form, housing_allowance: e.target.value })} />
          <Input type="number" placeholder="Transport allowance" value={form.transport_allowance} onChange={(e) => setForm({ ...form, transport_allowance: e.target.value })} />
          <Input type="number" placeholder="Medical allowance" value={form.medical_allowance} onChange={(e) => setForm({ ...form, medical_allowance: e.target.value })} />
        </div>
        <div className="pt-3 border-t border-border/30">
          <Button size="sm" onClick={saveStructure}>Save Structure</Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
          <Input className="pl-10" placeholder="Search employee..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead><tr><th>Employee</th><th className="text-right">Basic</th><th className="text-right">Allowances</th><th className="text-right">Total</th><th>Effective</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="!py-12 text-center text-muted-foreground/60">Loading...</td></tr> : filtered.length === 0 ? <tr><td colSpan={5} className="!py-12 text-center text-muted-foreground/60">No salary structures found.</td></tr> : filtered.map((row: any) => (
                <tr key={row.id} className="group">
                  <td className="font-medium text-foreground">{row.company_employees?.users?.full_name || 'Unknown'}</td>
                  <td className="text-right font-mono tabular-nums">{Number(row.basic_salary || 0).toLocaleString()}</td>
                  <td className="text-right font-mono tabular-nums text-muted-foreground">{(Number(row.housing_allowance || 0) + Number(row.transport_allowance || 0) + Number(row.medical_allowance || 0)).toLocaleString()}</td>
                  <td className="text-right font-mono font-bold tabular-nums text-foreground">{total(row).toLocaleString()}</td>
                  <td className="text-xs text-muted-foreground">{row.effective_from}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
