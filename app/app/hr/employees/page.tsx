'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Plus, Search, Mail, Phone, Edit, MoreHorizontal, User,
  Users, UserCheck, UserX, Building2, Download, Filter,
} from 'lucide-react'
import type { CompanyEmployee } from '@/types'

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [employeeForm, setEmployeeForm] = useState({
    email: '',
    roleId: '',
    department: '',
    position: '',
    salary: '',
    phoneNumber: '',
    employeeIdNumber: '',
  })

  const loadEmployees = async () => {
    try {
      const context = await getSessionContext()
      if (!context?.companyId) return
      setCompanyId(context.companyId)

      const [{ data }, { data: roleData }] = await Promise.all([
        supabase
          .from('company_employees')
          .select('*, users(full_name, email, avatar_url), company_roles(name)')
          .eq('company_id', context.companyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('company_roles')
          .select('id, name')
          .eq('company_id', context.companyId)
          .order('name', { ascending: true }),
      ])

      setEmployees(data || [])
      setRoles(roleData || [])
    } catch (error) {
      console.error('Failed to load employees:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEmployees()
  }, [])

  const filtered = employees.filter(emp => {
    const name = emp.users?.full_name || ''
    const email = emp.users?.email || ''
    const matchSearch = !searchQuery || name.toLowerCase().includes(searchQuery.toLowerCase()) || email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchStatus = !statusFilter || emp.status === statusFilter
    const matchDept = !deptFilter || emp.department === deptFilter
    return matchSearch && matchStatus && matchDept
  })

  const departments = [...new Set(employees.map(e => e.department).filter(Boolean))]
  const activeCount = employees.filter(e => e.status === 'active').length
  const pendingCount = employees.filter(e => e.status === 'pending_invitation').length
  const suspendedCount = employees.filter(e => e.status === 'suspended').length

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      pending_invitation: 'bg-amber-50 text-amber-700 border-amber-200',
      suspended: 'bg-red-50 text-red-600 border-red-200',
      terminated: 'bg-muted text-muted-foreground border-border',
    }
    return map[status] || 'bg-muted text-muted-foreground border-border'
  }

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      active: 'Active',
      pending_invitation: 'Pending',
      suspended: 'Suspended',
      terminated: 'Terminated',
    }
    return map[status] || status
  }

  const getInitials = (name: string) =>
    name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'

  const exportEmployees = () => {
    const headers = ['name', 'email', 'employee_id_number', 'department', 'position', 'phone_number', 'status']
    const rows = filtered.map((emp) => [
      emp.users?.full_name || '',
      emp.users?.email || '',
      emp.employee_id_number || '',
      emp.department || '',
      emp.position || emp.company_roles?.name || '',
      emp.phone_number || '',
      emp.status || '',
    ].map((value) => JSON.stringify(value)).join(','))

    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleAddEmployee = async () => {
    if (!companyId || !employeeForm.email || !employeeForm.roleId) {
      setMessage({ type: 'error', text: 'Email and role are required to add an employee.' })
      return
    }

    try {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', employeeForm.email.trim().toLowerCase())
        .single()

      if (userError || !user) {
        throw new Error('No existing user found with that email. Ask the employee to sign up first.')
      }

      const { error } = await supabase
        .from('company_employees')
        .insert({
          company_id: companyId,
          user_id: user.id,
          company_role_id: employeeForm.roleId,
          department: employeeForm.department || null,
          position: employeeForm.position || null,
          employee_id_number: employeeForm.employeeIdNumber || null,
          salary: employeeForm.salary ? Number(employeeForm.salary) : null,
          phone_number: employeeForm.phoneNumber || null,
          status: 'active',
          joined_at: new Date().toISOString(),
        })

      if (error) throw error

      setMessage({ type: 'success', text: 'Employee added successfully.' })
      setEmployeeForm({ email: '', roleId: '', department: '', position: '', salary: '', phoneNumber: '', employeeIdNumber: '' })
      setShowAddForm(false)
      setLoading(true)
      await loadEmployees()
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to add employee.' })
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your team members and their information</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportEmployees}>
            <Download className="w-4 h-4 mr-1.5" />
            Export CSV
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Employee
          </Button>
        </div>
      </div>

      {message && (
        <div className={`mb-5 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
          message.type === 'success' ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' : 'bg-red-500/10 text-red-600 border border-red-500/20'
        }`}>
          {message.text}
        </div>
      )}

      {showAddForm && (
        <Card className="mb-6 p-5 border border-primary/15 bg-primary/[0.02]">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Add New Employee</h3>
              <p className="text-[11px] text-muted-foreground/60">Enter details to invite a team member</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Employee email *" value={employeeForm.email} onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })} />
            <select
              className="form-select"
              value={employeeForm.roleId}
              onChange={(e) => setEmployeeForm({ ...employeeForm, roleId: e.target.value })}
            >
              <option value="">Select role *</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
            <Input placeholder="Employee ID" value={employeeForm.employeeIdNumber} onChange={(e) => setEmployeeForm({ ...employeeForm, employeeIdNumber: e.target.value })} />
            <Input placeholder="Department" value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })} />
            <Input placeholder="Position" value={employeeForm.position} onChange={(e) => setEmployeeForm({ ...employeeForm, position: e.target.value })} />
            <Input type="number" placeholder="Salary (UGX)" value={employeeForm.salary} onChange={(e) => setEmployeeForm({ ...employeeForm, salary: e.target.value })} />
            <Input placeholder="Phone number" value={employeeForm.phoneNumber} onChange={(e) => setEmployeeForm({ ...employeeForm, phoneNumber: e.target.value })} className="md:col-span-2" />
          </div>
          <div className="mt-4 flex items-center gap-2 pt-4 border-t border-border/30">
            <Button size="sm" onClick={handleAddEmployee}>Save Employee</Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger-children">
        {[
          { label: 'Total Employees', value: employees.length, icon: Users, gradient: 'from-blue-500 to-blue-600' },
          { label: 'Active', value: activeCount, icon: UserCheck, gradient: 'from-emerald-500 to-green-600' },
          { label: 'Pending Invite', value: pendingCount, icon: Mail, gradient: 'from-amber-500 to-orange-500' },
          { label: 'Departments', value: departments.length, icon: Building2, gradient: 'from-violet-500 to-purple-600' },
        ].map(stat => (
          <Card key={stat.label} className="stat-card p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-sm flex-shrink-0`}>
                <stat.icon className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-3 mb-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input
              placeholder="Search by name or email..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="pending_invitation">Pending</option>
            <option value="suspended">Suspended</option>
            <option value="terminated">Terminated</option>
          </select>
          <select className="form-select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Department</th>
                <th>Contact</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="!py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <p className="text-sm text-muted-foreground">Loading employees...</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="!py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                      <Users className="w-6 h-6 text-muted-foreground/25" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">No employees found</p>
                    <p className="text-xs text-muted-foreground/40 mt-1">Add team members to get started</p>
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => (
                  <tr key={emp.id} className="group">
                    <td>
                      <div className="flex items-center gap-3">
                        {emp.users?.avatar_url ? (
                          <img src={emp.users.avatar_url} alt="" className="w-9 h-9 rounded-xl object-cover ring-1 ring-border/30" />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/10 to-blue-500/10 flex items-center justify-center text-primary text-xs font-bold ring-1 ring-primary/10">
                            {getInitials(emp.users?.full_name || '')}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-foreground">{emp.users?.full_name || 'Unnamed'}</p>
                          <p className="text-[11px] text-muted-foreground/50">{emp.employee_id_number || 'No ID assigned'}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="text-sm text-foreground">{emp.position || emp.company_roles?.name || '—'}</p>
                    </td>
                    <td>
                      <p className="text-sm text-muted-foreground">{emp.department || '—'}</p>
                    </td>
                    <td>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-muted-foreground/40" />
                          {emp.users?.email || '—'}
                        </p>
                        {emp.phone_number && (
                          <p className="text-xs text-muted-foreground/50 flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-muted-foreground/30" />
                            {emp.phone_number}
                          </p>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${
                        emp.status === 'active' ? 'badge-success' :
                        emp.status === 'pending_invitation' ? 'badge-warning' :
                        emp.status === 'suspended' ? 'badge-danger' : 'badge-neutral'
                      }`}>
                        {getStatusLabel(emp.status)}
                      </span>
                    </td>
                    <td className="text-right">
                      <button className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-all opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border/20 flex items-center justify-between bg-muted/10">
            <p className="text-xs text-muted-foreground/50">Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {employees.length} employees</p>
          </div>
        )}
      </Card>
    </div>
  )
}
