'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Mail, Edit, Trash2, User } from 'lucide-react'

export default function StudentsPage() {
  const [students] = useState([
    {
      id: '1',
      name: 'Alice Johnson',
      studentID: 'STU001',
      email: 'alice@university.edu',
      module: 'CS101',
      enrollmentDate: '2024-01-15',
      status: 'enrolled',
    },
    {
      id: '2',
      name: 'Bob Smith',
      studentID: 'STU002',
      email: 'bob@university.edu',
      module: 'CS101',
      enrollmentDate: '2024-01-15',
      status: 'enrolled',
    },
    {
      id: '3',
      name: 'Carol White',
      studentID: 'STU003',
      email: 'carol@university.edu',
      module: 'CS102',
      enrollmentDate: '2024-01-15',
      status: 'enrolled',
    },
    {
      id: '4',
      name: 'David Brown',
      studentID: 'STU004',
      email: 'david@university.edu',
      module: 'CS102',
      enrollmentDate: '2024-01-15',
      status: 'suspended',
    },
    {
      id: '5',
      name: 'Eve Davis',
      studentID: 'STU005',
      email: 'eve@university.edu',
      module: 'CS201',
      enrollmentDate: '2024-01-15',
      status: 'enrolled',
    },
  ])

  const getStatusColor = (status: string) => {
    return status === 'enrolled'
      ? 'bg-green-100 text-green-800'
      : 'bg-red-100 text-red-800'
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Student Management</h1>
          <p className="text-muted-foreground">Manage enrolled students and their information</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Enroll Student
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Total Students</p>
          <p className="text-2xl font-bold text-foreground">{students.length}</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Enrolled</p>
          <p className="text-2xl font-bold text-green-600">{students.filter(s => s.status === 'enrolled').length}</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Suspended</p>
          <p className="text-2xl font-bold text-red-600">{students.filter(s => s.status === 'suspended').length}</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Unique Modules</p>
          <p className="text-2xl font-bold text-primary">{new Set(students.map(s => s.module)).size}</p>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card className="p-4 border border-border mb-6 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search students..."
            className="pl-10"
          />
        </div>
        <select className="px-3 py-2 border border-border rounded-md text-sm">
          <option value="">All Modules</option>
          <option value="CS101">CS101</option>
          <option value="CS102">CS102</option>
          <option value="CS201">CS201</option>
        </select>
        <select className="px-3 py-2 border border-border rounded-md text-sm">
          <option value="">All Status</option>
          <option value="enrolled">Enrolled</option>
          <option value="suspended">Suspended</option>
        </select>
      </Card>

      {/* Students Table */}
      <Card className="border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Student ID</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Email</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Module</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Enrollment Date</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Status</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-foreground">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      {student.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground font-mono">{student.studentID}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    <a href={`mailto:${student.email}`} className="hover:text-primary flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5" />
                      {student.email}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-foreground">{student.module}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{new Date(student.enrollmentDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(student.status)}`}>
                      {student.status.charAt(0).toUpperCase() + student.status.slice(1)}
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

      {/* Module Distribution */}
      <Card className="mt-6 p-6 border border-border">
        <h2 className="text-lg font-semibold text-foreground mb-4">Student Distribution by Module</h2>
        <div className="space-y-3">
          {Array.from(new Set(students.map(s => s.module))).map((module) => {
            const count = students.filter(s => s.module === module).length
            const percentage = (count / students.length) * 100
            return (
              <div key={module} className="flex items-center gap-4">
                <span className="font-mono text-sm font-medium w-16">{module}</span>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-sm font-medium w-12 text-right">{count}</span>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
