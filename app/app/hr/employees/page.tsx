'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Mail, Phone, Edit, Trash2, User } from 'lucide-react'

export default function EmployeesPage() {
  const [employees] = useState([
    {
      id: '1',
      name: 'John Doe',
      email: 'john@company.com',
      phone: '+256 700 123456',
      role: 'Accountant',
      department: 'Finance',
      hireDate: '2023-01-15',
      status: 'active',
    },
    {
      id: '2',
      name: 'Jane Smith',
      email: 'jane@company.com',
      phone: '+256 701 234567',
      role: 'HR Manager',
      department: 'Human Resources',
      hireDate: '2023-06-01',
      status: 'active',
    },
    {
      id: '3',
      name: 'Bob Johnson',
      email: 'bob@company.com',
      phone: '+256 702 345678',
      role: 'Developer',
      department: 'IT',
      hireDate: '2022-03-10',
      status: 'active',
    },
    {
      id: '4',
      name: 'Alice Brown',
      email: 'alice@company.com',
      phone: '+256 703 456789',
      role: 'Sales Manager',
      department: 'Sales',
      hireDate: '2023-09-20',
      status: 'suspended',
    },
  ])

  const getStatusColor = (status: string) => {
    return status === 'active'
      ? 'bg-green-100 text-green-800'
      : 'bg-red-100 text-red-800'
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Employee Management</h1>
          <p className="text-muted-foreground">Manage your team members and their information</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Employee
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Total Employees</p>
          <p className="text-2xl font-bold text-foreground">4</p>
          <p className="text-xs text-muted-foreground mt-2">Company wide</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Active</p>
          <p className="text-2xl font-bold text-green-600">3</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Suspended</p>
          <p className="text-2xl font-bold text-red-600">1</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Departments</p>
          <p className="text-2xl font-bold text-foreground">4</p>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="p-4 border border-border mb-6 flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
            className="pl-10"
          />
        </div>
        <select className="px-3 py-2 border border-border rounded-md text-sm">
          <option value="">All Departments</option>
          <option value="finance">Finance</option>
          <option value="hr">Human Resources</option>
          <option value="it">IT</option>
          <option value="sales">Sales</option>
        </select>
        <select className="px-3 py-2 border border-border rounded-md text-sm">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </Card>

      {/* Employees Table */}
      <Card className="border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Role</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Department</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Email</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Hire Date</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Status</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.map((employee) => (
                <tr key={employee.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-foreground">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      {employee.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">{employee.role}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{employee.department}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    <a href={`mailto:${employee.email}`} className="hover:text-primary flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5" />
                      {employee.email}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{new Date(employee.hireDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(employee.status)}`}>
                      {employee.status.charAt(0).toUpperCase() + employee.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
