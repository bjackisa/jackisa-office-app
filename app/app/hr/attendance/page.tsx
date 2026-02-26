'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Search, Check, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

type AttendanceRow = any

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRow[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0])
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ employee_id: '', status: 'present', clock_in: '09:00', clock_out: '17:00', notes: '' })

  const loadData = async () => {
    try {
      const context = await getSessionContext()
      if (!context?.companyId) return
      setCompanyId(context.companyId)

      const [recordsRes, employeesRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('id, attendance_date, clock_in, clock_out, status, company_employees(users(full_name))')
          .eq('company_id', context.companyId)
          .order('attendance_date', { ascending: false })
          .limit(200),
        supabase
          .from('company_employees')
          .select('id, users(full_name)')
          .eq('company_id', context.companyId)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
      ])

      setRecords((recordsRes.data as AttendanceRow[]) || [])
      setEmployees(employeesRes.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const getEmployeeName = (row: any) => row.company_employees?.users?.full_name || row.company_employees?.[0]?.users?.[0]?.full_name || row.company_employees?.[0]?.users?.full_name || ''

  const filtered = useMemo(() => records.filter((r) => {
    const employee = getEmployeeName(r) || ''
    const searchMatch = !search || employee.toLowerCase().includes(search.toLowerCase())
    const dateMatch = !dateFilter || r.attendance_date === dateFilter
    const statusMatch = !statusFilter || r.status === statusFilter
    return searchMatch && dateMatch && statusMatch
  }), [records, search, dateFilter, statusFilter])

  const attendanceSummary = {
    total: employees.length,
    present: filtered.filter(r => r.status === 'present').length,
    absent: filtered.filter(r => r.status === 'absent').length,
    late: filtered.filter(r => r.status === 'late').length,
    leave: filtered.filter(r => r.status === 'leave').length,
  }

  const handleRecordAttendance = async () => {
    if (!companyId || !form.employee_id) return
    await supabase
      .from('attendance_records')
      .upsert({
        company_id: companyId,
        employee_id: form.employee_id,
        attendance_date: dateFilter,
        status: form.status,
        clock_in: form.clock_in || null,
        clock_out: form.clock_out || null,
        notes: form.notes || null,
      }, { onConflict: 'employee_id,attendance_date' })

    setShowForm(false)
    setForm({ employee_id: '', status: 'present', clock_in: '09:00', clock_out: '17:00', notes: '' })
    await loadData()
  }

  const getStatusColor = (status: string) => ({
    present: 'bg-green-100 text-green-800', absent: 'bg-red-100 text-red-800', late: 'bg-yellow-100 text-yellow-800', leave: 'bg-blue-100 text-blue-800',
  }[status] || 'bg-gray-100 text-gray-800')

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Attendance Management</h1>
          <p className="text-muted-foreground">Track employee attendance and working hours</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" />
          Record Attendance
        </Button>
      </div>

      {showForm && (
        <Card className="p-4 border border-border mb-6 grid md:grid-cols-5 gap-3">
          <select className="px-3 py-2 border rounded-md" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">Select employee</option>
            {employees.map((e: any) => <option key={e.id} value={e.id}>{e.users?.full_name || 'Unnamed'}</option>)}
          </select>
          <select className="px-3 py-2 border rounded-md" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="leave">Leave</option>
          </select>
          <Input type="time" value={form.clock_in} onChange={(e) => setForm({ ...form, clock_in: e.target.value })} />
          <Input type="time" value={form.clock_out} onChange={(e) => setForm({ ...form, clock_out: e.target.value })} />
          <Button onClick={handleRecordAttendance}>Save</Button>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <Card className="p-4 border border-border"><p className="text-sm text-muted-foreground mb-1">Total Employees</p><p className="text-2xl font-bold">{attendanceSummary.total}</p></Card>
        <Card className="p-4 border border-border bg-green-50"><p className="text-sm mb-1">Present</p><p className="text-2xl font-bold text-green-600">{attendanceSummary.present}</p></Card>
        <Card className="p-4 border border-border bg-red-50"><p className="text-sm mb-1">Absent</p><p className="text-2xl font-bold text-red-600">{attendanceSummary.absent}</p></Card>
        <Card className="p-4 border border-border bg-yellow-50"><p className="text-sm mb-1">Late</p><p className="text-2xl font-bold text-yellow-600">{attendanceSummary.late}</p></Card>
        <Card className="p-4 border border-border"><p className="text-sm mb-1">On Leave</p><p className="text-2xl font-bold text-blue-600">{attendanceSummary.leave}</p></Card>
      </div>

      <Card className="p-4 border border-border mb-6 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-48 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search employee..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="px-3 py-2 border border-border rounded-md text-sm" />
        <select className="px-3 py-2 border border-border rounded-md text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="leave">On Leave</option>
        </select>
      </Card>

      <Card className="border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border"><tr><th className="px-6 py-3 text-left text-sm font-medium">Date</th><th className="px-6 py-3 text-left text-sm font-medium">Employee</th><th className="px-6 py-3 text-left text-sm font-medium">Check In</th><th className="px-6 py-3 text-left text-sm font-medium">Check Out</th><th className="px-6 py-3 text-left text-sm font-medium">Status</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-400">Loading attendance...</td></tr> : filtered.length === 0 ? <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-400">No attendance records found</td></tr> : filtered.map((record) => (
                <tr key={record.id} className="border-b border-border"><td className="px-6 py-3">{record.attendance_date}</td><td className="px-6 py-3">{getEmployeeName(record) || 'Unknown'}</td><td className="px-6 py-3">{record.clock_in || '—'}</td><td className="px-6 py-3">{record.clock_out || '—'}</td><td className="px-6 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${getStatusColor(record.status)}`}>{record.status === 'present' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} {record.status}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
