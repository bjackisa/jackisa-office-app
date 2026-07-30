'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Brain, CheckCircle2, Eye, Sparkles, UserPlus, Users } from 'lucide-react'

type Question = { category: string; type?: string; question?: string; expectedAnswer?: string; maxMarks?: number }

type Candidate = { id: string; full_name: string; email: string }
type Role = { id: string; name: string; description?: string | null }
type PastInterview = {
  id: string
  candidate_user_id: string
  company_role_id: string
  questions: Question[] | null
  marks: Record<string, number> | null
  impression_rating: number | null
  interviewer_notes: string | null
  total_percentage: number | null
  grade: string
  status: string
  created_at: string
}

const categoryLabels: Record<string, string> = {
  skill: 'Skill',
  work_attitude: 'Work Attitude',
  emotional_intelligence: 'Emotional Intelligence',
  teamwork: 'Teamwork',
  mental_stability: 'Mental Stability',
  personality_assessment: 'Personality Assessment',
}

function gradeFor(score: number) {
  if (score >= 85) return 'Hired'
  if (score >= 75) return 'Strong Candidate'
  if (score >= 65) return 'Consider'
  if (score >= 50) return 'Reserve'
  return 'Not Recommended'
}

export default function InterviewPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [candidateId, setCandidateId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [marks, setMarks] = useState<Record<number, number>>({})
  const [impressionRating, setImpressionRating] = useState(0)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [savedResultId, setSavedResultId] = useState<string | null>(null)
  const [pastInterviews, setPastInterviews] = useState<PastInterview[]>([])
  const [selectedReport, setSelectedReport] = useState<PastInterview | null>(null)


  const loadPastInterviews = async (currentCompanyId = companyId) => {
    if (!currentCompanyId) return
    const { data, error } = await supabase
      .from('hr_interviews')
      .select('id, candidate_user_id, company_role_id, questions, marks, impression_rating, interviewer_notes, total_percentage, grade, status, created_at')
      .eq('company_id', currentCompanyId)
      .order('created_at', { ascending: false })
    if (error) throw error
    setPastInterviews((data || []) as PastInterview[])
  }

  useEffect(() => {
    const load = async () => {
      try {
        const context = await getSessionContext()
        if (!context?.companyId) return
        setCompanyId(context.companyId)
        const [{ data: users }, { data: roleData }] = await Promise.all([
          supabase.from('users').select('id, full_name, email').order('full_name', { ascending: true }),
          supabase.from('company_roles').select('id, name, description').eq('company_id', context.companyId).order('name', { ascending: true }),
        ])
        setCandidates(users || [])
        setRoles(roleData || [])
        await loadPastInterviews(context.companyId)
      } catch (error: any) {
        setMessage({ type: 'error', text: error.message || 'Failed to load interview setup data.' })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const selectedRole = roles.find((role) => role.id === roleId)
  const selectedCandidate = candidates.find((candidate) => candidate.id === candidateId)
  const questionTotal = questions.reduce((sum, question) => sum + (question.maxMarks || 10), 0)
  const scoredMarks = questions.reduce((sum, _, index) => sum + Math.min(Math.max(Number(marks[index] || 0), 0), 10), 0)
  const grandTotal = questionTotal + 10
  const percent = grandTotal ? Math.round(((scoredMarks + impressionRating) / grandTotal) * 100) : 0
  const grade = gradeFor(percent)
  const grouped = useMemo(() => questions.reduce<Record<string, Question[]>>((acc, question) => {
    acc[question.category] = [...(acc[question.category] || []), question]
    return acc
  }, {}), [questions])

  const generateQuestions = async () => {
    if (!selectedRole) {
      setMessage({ type: 'error', text: 'Choose a role before generating questions.' })
      return
    }
    setGenerating(true)
    setMessage(null)
    setSavedResultId(null)
    try {
      const response = await fetch('/api/hr/interview/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleName: selectedRole.name, roleDescription: selectedRole.description }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to generate questions.')
      setQuestions(data.questions || [])
      setMarks({})
      setImpressionRating(0)
      setMessage({ type: 'success', text: `Generated ${(data.questions || []).length} interview questions.` })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to generate questions.' })
    } finally {
      setGenerating(false)
    }
  }

  const saveResult = async () => {
    if (!companyId || !candidateId || !roleId || questions.length === 0) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('hr_interviews').insert({
        company_id: companyId,
        candidate_user_id: candidateId,
        company_role_id: roleId,
        questions,
        marks,
        impression_rating: impressionRating,
        interviewer_notes: notes || null,
        total_percentage: percent,
        grade,
        status: grade === 'Hired' ? 'hired' : 'completed',
      }).select('id').single()
      if (error) throw error
      setSavedResultId(data.id)
      setQuestions([])
      setMarks({})
      setImpressionRating(0)
      setNotes('')
      await loadPastInterviews(companyId)
      setMessage({ type: 'success', text: 'Interview result saved. You can review it in the past interviews table.' })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save result.' })
    } finally {
      setSaving(false)
    }
  }

  const hireCandidate = async () => {
    if (!companyId || !candidateId || !roleId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('company_employees').upsert({
        company_id: companyId,
        user_id: candidateId,
        company_role_id: roleId,
        position: selectedRole?.name || null,
        status: 'active',
        joined_at: new Date().toISOString(),
      }, { onConflict: 'company_id,user_id' })
      if (error) throw error
      if (savedResultId) await supabase.from('hr_interviews').update({ status: 'hired' }).eq('id', savedResultId)
      setMessage({ type: 'success', text: `${selectedCandidate?.full_name || 'Candidate'} has been hired and added as an employee.` })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to hire candidate.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Interview</h1>
      </div>

      {message && <div className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' : 'bg-red-500/10 text-red-600 border border-red-500/20'}`}>{message.text}</div>}

      <Card className="p-5 mb-6">
        <div className="grid md:grid-cols-3 gap-3">
          <select className="form-select" value={candidateId} onChange={(e) => setCandidateId(e.target.value)} disabled={loading}>
            <option value="">Choose system user</option>
            {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.full_name} ({candidate.email})</option>)}
          </select>
          <select className="form-select" value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={loading}>
            <option value="">Choose role</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
          <Button onClick={generateQuestions} disabled={generating || !roleId}>
            <Sparkles className="w-4 h-4 mr-2" />{generating ? 'Generating…' : 'Generate Questions'}
          </Button>
        </div>
      </Card>

      {questions.length > 0 && <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-5">
          {Object.entries(grouped).map(([category, items]) => <Card key={category} className="p-5">
            <div className="flex items-center gap-2 mb-4"><Brain className="w-4 h-4 text-primary" /><h2 className="font-semibold">{categoryLabels[category]}</h2><Badge variant="secondary">10 questions</Badge></div>
            <div className="space-y-4">
              {items.map((question, localIndex) => {
                const globalIndex = questions.indexOf(question)
                return <div key={`${category}-${localIndex}`} className="rounded-xl border border-border/40 p-4">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div>
                      <Badge variant={question.type === 'practical' ? 'default' : 'outline'}>{question.type || 'question'}</Badge>
                      <p className="mt-2 text-sm font-medium text-foreground">{localIndex + 1}. {question.question || 'Question missing'}</p>
                      {question.expectedAnswer && <p className="mt-1 text-xs text-muted-foreground">Expected: {question.expectedAnswer}</p>}
                    </div>
                    <Input className="w-28" type="number" min="0" max="10" placeholder="/10" value={marks[globalIndex] ?? ''} onChange={(e) => setMarks({ ...marks, [globalIndex]: Number(e.target.value) })} />
                  </div>
                </div>
              })}
            </div>
          </Card>)}
        </div>
        <Card className="p-5 h-fit sticky top-4">
          <div className="flex items-center gap-2 mb-4"><CheckCircle2 className="w-5 h-5 text-emerald-600" /><h2 className="font-semibold">Final Rating</h2></div>
          <label className="text-xs font-medium text-muted-foreground">Impression rating (/10)</label>
          <Input type="number" min="0" max="10" value={impressionRating} onChange={(e) => setImpressionRating(Math.min(Number(e.target.value), 10))} className="mt-1 mb-4" />
          <Textarea placeholder="Interviewer notes and impression..." value={notes} onChange={(e) => setNotes(e.target.value)} className="mb-4" />
          <div className="rounded-xl bg-muted/40 p-4 mb-4">
            <p className="text-sm text-muted-foreground">Total Marks</p>
            <p className="text-3xl font-bold">{percent}%</p>
            <Badge className="mt-2" variant={grade === 'Hired' ? 'default' : 'secondary'}>{grade}</Badge>
          </div>
          <Button className="w-full mb-2" onClick={saveResult} disabled={saving || !candidateId}>{saving ? 'Saving…' : 'Save Result'}</Button>
          {grade === 'Hired' && <Button className="w-full" variant="outline" onClick={hireCandidate} disabled={saving || !candidateId}><UserPlus className="w-4 h-4 mr-2" />Hire & Add Employee</Button>}
        </Card>
      </div>}


      <Card className="p-5 mt-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold">Past Interviews</h2>
            <p className="text-xs text-muted-foreground">Saved interviews are listed here with reviewable reports.</p>
          </div>
          <Badge variant="secondary">{pastInterviews.length}</Badge>
        </div>
        {pastInterviews.length === 0 ? <p className="text-sm text-muted-foreground">No saved interviews yet.</p> : <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Report</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pastInterviews.map((interview) => {
              const candidate = candidates.find((item) => item.id === interview.candidate_user_id)
              const role = roles.find((item) => item.id === interview.company_role_id)
              return <TableRow key={interview.id}>
                <TableCell>{candidate ? `${candidate.full_name} (${candidate.email})` : 'Unknown candidate'}</TableCell>
                <TableCell>{role?.name || 'Unknown role'}</TableCell>
                <TableCell>{Math.round(Number(interview.total_percentage || 0))}%</TableCell>
                <TableCell><Badge variant={interview.grade === 'Hired' ? 'default' : 'secondary'}>{interview.grade}</Badge></TableCell>
                <TableCell>{new Date(interview.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setSelectedReport(interview)}><Eye className="w-4 h-4 mr-2" />Review</Button></TableCell>
              </TableRow>
            })}
          </TableBody>
        </Table>}
      </Card>

      <Dialog open={!!selectedReport} onOpenChange={(open) => !open && setSelectedReport(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Interview Report</DialogTitle></DialogHeader>
          {selectedReport && <InterviewReport interview={selectedReport} candidate={candidates.find((item) => item.id === selectedReport.candidate_user_id)} role={roles.find((item) => item.id === selectedReport.company_role_id)} />}
        </DialogContent>
      </Dialog>

      {!loading && questions.length === 0 && <Card className="p-10 text-center"><Users className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" /><p className="text-sm text-muted-foreground">Choose a user and role to start a 60-question structured interview.</p></Card>}
    </div>
  )
}


function InterviewReport({ interview, candidate, role }: { interview: PastInterview; candidate?: Candidate; role?: Role }) {
  const questions = interview.questions || []
  const marks = interview.marks || {}
  const categoryScores = questions.reduce<Record<string, { earned: number; total: number }>>((acc, question, index) => {
    const category = question.category || 'uncategorized'
    const maxMarks = question.maxMarks || 10
    acc[category] = acc[category] || { earned: 0, total: 0 }
    acc[category].earned += Math.min(Math.max(Number(marks[index] || 0), 0), maxMarks)
    acc[category].total += maxMarks
    return acc
  }, {})

  return <div className="space-y-5">
    <div className="grid md:grid-cols-3 gap-3">
      <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Candidate</p><p className="font-medium">{candidate ? `${candidate.full_name} (${candidate.email})` : 'Unknown candidate'}</p></div>
      <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Role</p><p className="font-medium">{role?.name || 'Unknown role'}</p></div>
      <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Overall Score</p><p className="font-medium">{Math.round(Number(interview.total_percentage || 0))}% · {interview.grade}</p></div>
    </div>

    <Card className="p-4">
      <h3 className="font-semibold mb-3">Category Scores</h3>
      {Object.keys(categoryScores).length === 0 ? <p className="text-sm text-muted-foreground">No category scores were saved for this interview.</p> : <div className="grid md:grid-cols-2 gap-3">
        {Object.entries(categoryScores).map(([category, score]) => <div key={category} className="rounded-xl border border-border/40 p-3">
          <p className="text-sm font-medium">{categoryLabels[category] || category.replace(/_/g, ' ')}</p>
          <p className="text-xs text-muted-foreground">{score.earned}/{score.total} marks · {score.total ? Math.round((score.earned / score.total) * 100) : 0}%</p>
        </div>)}
      </div>}
    </Card>

    <Card className="p-4">
      <h3 className="font-semibold mb-3">Questions</h3>
      {questions.length === 0 ? <p className="text-sm text-muted-foreground">Question missing</p> : <div className="space-y-3">
        {questions.map((question, index) => <div key={`${question.category}-${index}`} className="rounded-xl border border-border/40 p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2"><Badge variant="outline">{categoryLabels[question.category] || question.category || 'Uncategorized'}</Badge><span className="text-xs text-muted-foreground">Score: {Number(marks[index] || 0)}/{question.maxMarks || 10}</span></div>
          <p className="text-sm font-medium">{index + 1}. {question.question || 'Question missing'}</p>
          {question.expectedAnswer && <p className="mt-1 text-xs text-muted-foreground">Expected: {question.expectedAnswer}</p>}
        </div>)}
      </div>}
    </Card>

    {interview.interviewer_notes && <Card className="p-4"><h3 className="font-semibold mb-2">Interviewer Notes</h3><p className="text-sm text-muted-foreground whitespace-pre-wrap">{interview.interviewer_notes}</p></Card>}
  </div>
}
