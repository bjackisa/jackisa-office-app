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
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const context = await getSessionContext()
        if (!context?.companyId) return

        const { data } = await supabase
          .from('company_employees')
          .select('*, users(full_name, email, avatar_url), company_roles(name)')
          .eq('company_id', context.companyId)
          .order('created_at', { ascending: false })

        setEmployees(data || [])
      } catch (error) {
        console.error('Failed to load employees:', error)
      } finally {
        setLoading(false)
      }
    }
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
      terminated: 'bg-gray-100 text-gray-500 border-gray-200',
    }
    return map[status] || 'bg-gray-100 text-gray-500 border-gray-200'
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

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Employee Management</h1>
          <p className="text-sm text-gray-500">Manage your team members and their information</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-gray-600">
            <Download className="w-4 h-4 mr-1.5" />
            Export
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Employee
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: employees.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Active', value: activeCount, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Pending', value: pendingCount, icon: Mail, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Departments', value: departments.length, icon: Building2, color: 'text-violet-600', bg: 'bg-violet-50' },
        ].map(stat => (
          <Card key={stat.label} className="p-4 border border-gray-200/60 bg-white">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-3 border border-gray-200/60 bg-white mb-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name or email..."
              className="pl-10 bg-gray-50 border-gray-200"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 bg-gray-50"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="pending_invitation">Pending</option>
            <option value="suspended">Suspended</option>
            <option value="terminated">Terminated</option>
          </select>
          <select
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 bg-gray-50"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card className="border border-gray-200/60 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-400">Loading employees...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <Users className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400 font-medium">No employees found</p>
                    <p className="text-xs text-gray-300 mt-1">Add team members to get started</p>
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {emp.users?.avatar_url ? (
                          <img src={emp.users.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-xs font-semibold">
                            {getInitials(emp.users?.full_name || '')}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-900">{emp.users?.full_name || 'Unnamed'}</p>
                          <p className="text-[11px] text-gray-400">{emp.employee_id_number || 'No ID'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm text-gray-700">{emp.position || emp.company_roles?.name || '—'}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm text-gray-500">{emp.department || '—'}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="space-y-0.5">
                        <p className="text-xs text-gray-500 flex items-center gap-1.5">
                          <Mail className="w-3 h-3" />
                          {emp.users?.email || '—'}
                        </p>
                        {emp.phone_number && (
                          <p className="text-xs text-gray-400 flex items-center gap-1.5">
                            <Phone className="w-3 h-3" />
                            {emp.phone_number}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${getStatusBadge(emp.status)}`}>
                        {getStatusLabel(emp.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100">
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
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">Showing {filtered.length} of {employees.length} employees</p>
          </div>
        )}
      </Card>
    </div>
  )
}
