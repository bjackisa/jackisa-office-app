'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Search, Download, Check, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

export default function AttendancePage() {
  const [attendance] = useState([
    {
      id: '1',
      date: '2024-02-13',
      employee: 'John Doe',
      checkIn: '09:00 AM',
      checkOut: '05:30 PM',
      status: 'present',
      hours: 8.5,
    },
    {
      id: '2',
      date: '2024-02-13',
      employee: 'Jane Smith',
      checkIn: '08:45 AM',
      checkOut: '05:00 PM',
      status: 'present',
      hours: 8.25,
    },
    {
      id: '3',
      date: '2024-02-13',
      employee: 'Bob Johnson',
      checkIn: '-',
      checkOut: '-',
      status: 'absent',
      hours: 0,
    },
    {
      id: '4',
      date: '2024-02-13',
      employee: 'Alice Brown',
      checkIn: '10:00 AM',
      checkOut: '04:30 PM',
      status: 'late',
      hours: 6.5,
    },
    {
      id: '5',
      date: '2024-02-12',
      employee: 'John Doe',
      checkIn: '09:15 AM',
      checkOut: '05:30 PM',
      status: 'present',
      hours: 8.25,
    },
    {
      id: '6',
      date: '2024-02-12',
      employee: 'Jane Smith',
      checkIn: '09:00 AM',
      checkOut: '05:00 PM',
      status: 'present',
      hours: 8.0,
    },
  ])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-100 text-green-800'
      case 'absent':
        return 'bg-red-100 text-red-800'
      case 'late':
        return 'bg-yellow-100 text-yellow-800'
      case 'leave':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'present':
        return <Check className="w-4 h-4" />
      case 'absent':
      case 'late':
        return <X className="w-4 h-4" />
      default:
        return null
    }
  }

  const attendanceSummary = {
    total: 4,
    present: 2,
    absent: 1,
    late: 1,
    leave: 0,
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Attendance Management</h1>
          <p className="text-muted-foreground">Track employee attendance and working hours</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Record Attendance
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Total Employees</p>
          <p className="text-2xl font-bold text-foreground">{attendanceSummary.total}</p>
        </Card>
        <Card className="p-4 border border-border bg-green-50 dark:bg-green-950/20">
          <p className="text-sm text-muted-foreground mb-1">Present</p>
          <p className="text-2xl font-bold text-green-600">{attendanceSummary.present}</p>
        </Card>
        <Card className="p-4 border border-border bg-red-50 dark:bg-red-950/20">
          <p className="text-sm text-muted-foreground mb-1">Absent</p>
          <p className="text-2xl font-bold text-red-600">{attendanceSummary.absent}</p>
        </Card>
        <Card className="p-4 border border-border bg-yellow-50 dark:bg-yellow-950/20">
          <p className="text-sm text-muted-foreground mb-1">Late</p>
          <p className="text-2xl font-bold text-yellow-600">{attendanceSummary.late}</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">On Leave</p>
          <p className="text-2xl font-bold text-blue-600">{attendanceSummary.leave}</p>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="p-4 border border-border mb-6 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search employee..."
            className="pl-10"
          />
        </div>
        <input
          type="date"
          defaultValue="2024-02-13"
          className="px-3 py-2 border border-border rounded-md text-sm"
        />
        <select className="px-3 py-2 border border-border rounded-md text-sm">
          <option value="">All Status</option>
          <option value="present">Present</option>
          <option value="absent">Absent</option>
          <option value="late">Late</option>
          <option value="leave">On Leave</option>
        </select>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </Card>

      {/* Attendance Table */}
      <Card className="border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Date</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Employee</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Check In</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Check Out</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-foreground">Hours Worked</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {attendance.map((record) => (
                <tr key={record.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-foreground">
                    {new Date(record.date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">{record.employee}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{record.checkIn}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{record.checkOut}</td>
                  <td className="px-6 py-4 text-sm text-center font-medium text-foreground">
                    {record.hours > 0 ? `${record.hours}h` : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
                      {getStatusIcon(record.status)}
                      {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Attendance Guidelines */}
      <Card className="mt-6 p-4 border border-border">
        <h3 className="font-semibold text-foreground mb-3">Attendance Guidelines</h3>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-medium text-foreground">Standard Hours</p>
            <p className="text-muted-foreground">8 hours per day, 40 hours per week</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Late Threshold</p>
            <p className="text-muted-foreground">Marked late after 9:00 AM check-in</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Absence</p>
            <p className="text-muted-foreground">No check-in by end of day</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
