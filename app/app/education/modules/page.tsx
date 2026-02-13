'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Edit, Trash2, Users, BookOpen, Calendar } from 'lucide-react'
import { Input } from '@/components/ui/input'

export default function ModulesPage() {
  const [modules] = useState([
    {
      id: '1',
      code: 'CS101',
      name: 'Introduction to Programming',
      instructor: 'Dr. John Doe',
      students: 45,
      credits: 3,
      status: 'active',
      startDate: '2024-01-15',
      endDate: '2024-04-30',
    },
    {
      id: '2',
      code: 'CS102',
      name: 'Web Development Basics',
      instructor: 'Prof. Jane Smith',
      students: 38,
      credits: 3,
      status: 'active',
      startDate: '2024-01-15',
      endDate: '2024-04-30',
    },
    {
      id: '3',
      code: 'CS201',
      name: 'Advanced Database Design',
      instructor: 'Dr. Bob Johnson',
      students: 28,
      credits: 4,
      status: 'active',
      startDate: '2024-01-15',
      endDate: '2024-04-30',
    },
    {
      id: '4',
      code: 'BUS105',
      name: 'Business Management',
      instructor: 'Prof. Alice Brown',
      students: 52,
      credits: 3,
      status: 'pending',
      startDate: '2024-05-01',
      endDate: '2024-08-31',
    },
  ])

  const getStatusColor = (status: string) => {
    return status === 'active'
      ? 'bg-green-100 text-green-800'
      : 'bg-yellow-100 text-yellow-800'
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Module Management</h1>
          <p className="text-muted-foreground">Create and manage academic modules</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Module
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Total Modules</p>
          <p className="text-2xl font-bold text-foreground">{modules.length}</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Active Modules</p>
          <p className="text-2xl font-bold text-green-600">{modules.filter(m => m.status === 'active').length}</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Total Students</p>
          <p className="text-2xl font-bold text-foreground">{modules.reduce((sum, m) => sum + m.students, 0)}</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Total Credits</p>
          <p className="text-2xl font-bold text-primary">{modules.reduce((sum, m) => sum + m.credits, 0)}</p>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card className="p-4 border border-border mb-6 flex items-center gap-4">
        <div className="flex-1 relative">
          <Input
            placeholder="Search modules..."
            className="pl-4"
          />
        </div>
        <select className="px-3 py-2 border border-border rounded-md text-sm">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
        </select>
      </Card>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {modules.map((module) => (
          <Card key={module.id} className="p-6 border border-border hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-mono text-muted-foreground mb-1">{module.code}</p>
                <h3 className="text-lg font-semibold text-foreground">{module.name}</h3>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(module.status)}`}>
                {module.status.charAt(0).toUpperCase() + module.status.slice(1)}
              </span>
            </div>

            <div className="space-y-3 mb-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="font-medium text-foreground">Instructor:</span>
                {module.instructor}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{module.students} Students</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <BookOpen className="w-4 h-4" />
                <span>{module.credits} Credits</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>{new Date(module.startDate).toLocaleDateString()} - {new Date(module.endDate).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-border">
              <Button variant="outline" size="sm" className="flex-1">
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button variant="outline" size="sm" className="flex-1">
                View Details
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
