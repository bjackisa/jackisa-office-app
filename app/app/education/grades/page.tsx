'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Upload, Download, Edit } from 'lucide-react'

export default function GradesPage() {
  const [grades] = useState([
    {
      id: '1',
      studentName: 'Alice Johnson',
      studentID: 'STU001',
      module: 'CS101',
      moduleTitle: 'Introduction to Programming',
      score: 85,
      grade: 'A',
      status: 'graded',
    },
    {
      id: '2',
      studentName: 'Bob Smith',
      studentID: 'STU002',
      module: 'CS101',
      moduleTitle: 'Introduction to Programming',
      score: 72,
      grade: 'B',
      status: 'graded',
    },
    {
      id: '3',
      studentName: 'Carol White',
      studentID: 'STU003',
      module: 'CS101',
      moduleTitle: 'Introduction to Programming',
      score: 68,
      grade: 'B',
      status: 'graded',
    },
    {
      id: '4',
      studentName: 'David Brown',
      studentID: 'STU004',
      module: 'CS102',
      moduleTitle: 'Web Development Basics',
      score: null,
      grade: '-',
      status: 'pending',
    },
    {
      id: '5',
      studentName: 'Eve Davis',
      studentID: 'STU005',
      module: 'CS102',
      moduleTitle: 'Web Development Basics',
      score: 90,
      grade: 'A+',
      status: 'graded',
    },
  ])

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A':
      case 'A+':
        return 'bg-green-100 text-green-800'
      case 'B':
      case 'B+':
        return 'bg-blue-100 text-blue-800'
      case 'C':
      case 'C+':
        return 'bg-yellow-100 text-yellow-800'
      case 'D':
      case 'D+':
        return 'bg-orange-100 text-orange-800'
      case 'F':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusColor = (status: string) => {
    return status === 'graded'
      ? 'bg-green-100 text-green-800'
      : 'bg-yellow-100 text-yellow-800'
  }

  const averageScore = grades
    .filter(g => g.score !== null)
    .reduce((sum, g) => sum + (g.score || 0), 0) / grades.filter(g => g.score !== null).length

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Grade Management</h1>
          <p className="text-muted-foreground">Manage student results and coursework scores</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Upload className="w-4 h-4 mr-2" />
            Import Grades
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Grade
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Total Grades</p>
          <p className="text-2xl font-bold text-foreground">{grades.length}</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Graded</p>
          <p className="text-2xl font-bold text-green-600">{grades.filter(g => g.status === 'graded').length}</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">{grades.filter(g => g.status === 'pending').length}</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Average Score</p>
          <p className="text-2xl font-bold text-primary">{averageScore.toFixed(1)}</p>
        </Card>
      </div>

      {/* Grade Distribution */}
      <Card className="p-6 border border-border mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Grade Scale Reference</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { grade: 'A+', range: '90-100' },
            { grade: 'A', range: '85-89' },
            { grade: 'B+', range: '80-84' },
            { grade: 'B', range: '75-79' },
            { grade: 'C', range: '70-74' },
          ].map((item) => (
            <div key={item.grade} className="p-3 bg-muted/50 rounded-lg text-center">
              <p className="text-lg font-bold text-foreground">{item.grade}</p>
              <p className="text-xs text-muted-foreground">{item.range}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Search & Filter */}
      <Card className="p-4 border border-border mb-6 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-48">
          <Input
            placeholder="Search student..."
          />
        </div>
        <select className="px-3 py-2 border border-border rounded-md text-sm">
          <option value="">All Modules</option>
          <option value="CS101">CS101 - Intro to Programming</option>
          <option value="CS102">CS102 - Web Development</option>
        </select>
        <select className="px-3 py-2 border border-border rounded-md text-sm">
          <option value="">All Status</option>
          <option value="graded">Graded</option>
          <option value="pending">Pending</option>
        </select>
      </Card>

      {/* Grades Table */}
      <Card className="border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Student</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">ID</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Module</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-foreground">Score</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-foreground">Grade</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Status</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {grades.map((grade) => (
                <tr key={grade.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-foreground">{grade.studentName}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground font-mono">{grade.studentID}</td>
                  <td className="px-6 py-4 text-sm text-foreground">
                    <div>
                      <p className="font-mono text-xs">{grade.module}</p>
                      <p className="text-muted-foreground text-xs">{grade.moduleTitle}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-center font-medium text-foreground">
                    {grade.score !== null ? `${grade.score}%` : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${getGradeColor(grade.grade)}`}>
                      {grade.grade}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(grade.status)}`}>
                      {grade.status.charAt(0).toUpperCase() + grade.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
                      <Edit className="w-4 h-4 text-muted-foreground" />
                    </button>
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
