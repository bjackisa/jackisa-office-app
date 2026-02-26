'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Wallet, Plus } from 'lucide-react'

export default function SalaryStructuresPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [structures, setStructures] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
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

  const total = (row: any) => Number(row.basic_salary || 0) + Number(row.housing_allowance || 0) + Number(row.transport_allowance || 0) + Number(row.medical_allowance || 0)

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Salary Structures</h1>
        <p className="text-sm text-gray-500">Create and maintain employee salary structures from the database.</p>
      </div>

      <Card className="p-5 border border-gray-200/60 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Add Salary Structure</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <select className="px-3 py-2 border rounded-lg text-sm" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">Select employee</option>
            {employees.map((employee: any) => <option key={employee.id} value={employee.id}>{employee.users?.full_name || 'Unnamed'}</option>)}
          </select>
          <Input type="number" placeholder="Basic salary" value={form.basic_salary} onChange={(e) => setForm({ ...form, basic_salary: e.target.value })} />
          <Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
          <Input type="number" placeholder="Housing allowance" value={form.housing_allowance} onChange={(e) => setForm({ ...form, housing_allowance: e.target.value })} />
          <Input type="number" placeholder="Transport allowance" value={form.transport_allowance} onChange={(e) => setForm({ ...form, transport_allowance: e.target.value })} />
          <Input type="number" placeholder="Medical allowance" value={form.medical_allowance} onChange={(e) => setForm({ ...form, medical_allowance: e.target.value })} />
        </div>
        <Button onClick={saveStructure} className="bg-blue-600 hover:bg-blue-700">Save Structure</Button>
      </Card>

      <Card className="border border-gray-200/60 overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50/60"><h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Wallet className="w-4 h-4" /> Current Salary Structures</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b text-xs text-gray-500 uppercase"><th className="px-5 py-3 text-left">Employee</th><th className="px-5 py-3 text-right">Basic</th><th className="px-5 py-3 text-right">Allowances</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3 text-left">Effective</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">Loading salary structures...</td></tr> : structures.length === 0 ? <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">No salary structures found.</td></tr> : structures.map((row: any) => (
                <tr key={row.id} className="border-b last:border-0 text-sm">
                  <td className="px-5 py-3">{row.company_employees?.users?.full_name || 'Unknown'}</td>
                  <td className="px-5 py-3 text-right">{Number(row.basic_salary || 0).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right">{(Number(row.housing_allowance || 0) + Number(row.transport_allowance || 0) + Number(row.medical_allowance || 0)).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right font-semibold">{total(row).toLocaleString()}</td>
                  <td className="px-5 py-3">{row.effective_from}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
