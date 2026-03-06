'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Search, Check, X, Landmark, Zap } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { logEcosystemEvent, awardAttendancePoints } from '@/lib/ecosystem'

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
  const [userId, setUserId] = useState<string | null>(null)
  const [ecosystemMsg, setEcosystemMsg] = useState<string | null>(null)

  const loadData = async () => {
    try {
      const context = await getSessionContext()
      if (!context?.companyId) return
      setCompanyId(context.companyId)
      setUserId(context.userId)

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

    // Ecosystem: award/deduct HR points based on attendance
    if (userId) {
      await logEcosystemEvent({ companyId, eventType: 'attendance_recorded', sourceTable: 'attendance_records', sourceId: form.employee_id, payload: { status: form.status, date: dateFilter } })
      const pts = await awardAttendancePoints({ companyId, employeeId: form.employee_id, status: form.status, userId })
      if (pts) {
        const empName = employees.find(e => e.id === form.employee_id)?.users?.full_name || 'Employee'
        setEcosystemMsg(`${empName}: ${pts.points > 0 ? '+' : ''}${pts.points} HR points (${pts.status})`)
        setTimeout(() => setEcosystemMsg(null), 4000)
      }
    }

    setShowForm(false)
    setForm({ employee_id: '', status: 'present', clock_in: '09:00', clock_out: '17:00', notes: '' })
    await loadData()
  }

  const getStatusColor = (status: string) => ({
    present: 'bg-green-100 text-green-800', absent: 'bg-red-100 text-red-800', late: 'bg-yellow-100 text-yellow-800', leave: 'bg-blue-100 text-blue-800',
  }[status] || 'bg-muted text-foreground')

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Attendance Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track employee attendance and working hours</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Record Attendance
        </Button>
      </div>

      {ecosystemMsg && (
        <Card className="mb-6 p-3 border-blue-200 bg-blue-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-100"><Zap className="w-3.5 h-3.5 text-blue-600" /></div>
            <p className="text-xs font-medium text-blue-700">{ecosystemMsg}</p>
          </div>
        </Card>
      )}

      {showForm && (
        <Card className="mb-6 p-5 border border-primary/15 bg-primary/[0.02]">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Check className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Record Attendance</h3>
              <p className="text-[11px] text-muted-foreground/60">Log attendance for an employee</p>
            </div>
          </div>
          <div className="grid md:grid-cols-5 gap-3">
            <select className="form-select" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
              <option value="">Select employee</option>
              {employees.map((e: any) => <option key={e.id} value={e.id}>{e.users?.full_name || 'Unnamed'}</option>)}
            </select>
            <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="leave">Leave</option>
            </select>
            <Input type="time" value={form.clock_in} onChange={(e) => setForm({ ...form, clock_in: e.target.value })} />
            <Input type="time" value={form.clock_out} onChange={(e) => setForm({ ...form, clock_out: e.target.value })} />
            <Button size="sm" onClick={handleRecordAttendance}>Save</Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 stagger-children">
        {[
          { label: 'Total', value: attendanceSummary.total, gradient: 'from-slate-500 to-slate-600' },
          { label: 'Present', value: attendanceSummary.present, gradient: 'from-emerald-500 to-green-600' },
          { label: 'Absent', value: attendanceSummary.absent, gradient: 'from-red-500 to-rose-600' },
          { label: 'Late', value: attendanceSummary.late, gradient: 'from-amber-500 to-orange-500' },
          { label: 'On Leave', value: attendanceSummary.leave, gradient: 'from-blue-500 to-blue-600' },
        ].map(stat => (
          <Card key={stat.label} className="stat-card p-4">
            <p className="text-[11px] text-muted-foreground font-medium mb-1">{stat.label}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input placeholder="Search employee..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-auto" />
          <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="leave">On Leave</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="!py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading attendance...</p>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="!py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-6 h-6 text-muted-foreground/25" />
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">No attendance records found</p>
                  <p className="text-xs text-muted-foreground/40 mt-1">Record attendance above to get started</p>
                </td></tr>
              ) : filtered.map((record) => (
                <tr key={record.id} className="group">
                  <td className="text-xs text-muted-foreground whitespace-nowrap">{record.attendance_date}</td>
                  <td className="font-medium text-foreground">{getEmployeeName(record) || 'Unknown'}</td>
                  <td className="text-muted-foreground font-mono text-xs">{record.clock_in || '—'}</td>
                  <td className="text-muted-foreground font-mono text-xs">{record.clock_out || '—'}</td>
                  <td>
                    <span className={`badge ${
                      record.status === 'present' ? 'badge-success' :
                      record.status === 'absent' ? 'badge-danger' :
                      record.status === 'late' ? 'badge-warning' :
                      'badge-info'
                    }`}>
                      {record.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border/20 bg-muted/10">
            <p className="text-xs text-muted-foreground/50">Showing <span className="font-semibold text-foreground">{filtered.length}</span> records</p>
          </div>
        )}
      </Card>
    </div>
  )
}
