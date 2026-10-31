'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { ChevronDown, Plus, Search, Zap, Link2, Copy, CheckCircle, XCircle, GraduationCap, Pencil } from 'lucide-react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { logEcosystemEvent } from '@/lib/ecosystem'
import { apiFetch } from '@/lib/api'

const STATUS_OPTIONS = ['Pending', 'Active', 'Failed', 'Suspended', 'Deceased', 'Graduated']

/** Attach the caller's token so the institution API can authorise the action. */
async function studentApi(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/students/link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

export default function StudentsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [students, setStudents] = useState<any[]>([])
  const [modules, setModules] = useState<any[]>([])
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [statuses, setStatuses] = useState<Record<string, string>>({})
  const [moduleSearch, setModuleSearch] = useState('')
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', guardian_name: '', guardian_phone: '', guardian_email: '', module_ids: [] as string[] })
  const [ecosystemMsg, setEcosystemMsg] = useState<string | null>(null)
  const [studentLinks, setStudentLinks] = useState<any[]>([])
  const [studentRequests, setStudentRequests] = useState<any[]>([])
  const [linkForm, setLinkForm] = useState({ label: '', programme: '', maxUses: '', requiresApproval: true })
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [editForm, setEditForm] = useState({ full_name: '', student_id: '', email: '', phone: '', guardian_name: '', guardian_phone: '', guardian_email: '', tuition_amount: '', status: 'Active' })
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId) return
    setCompanyId(ctx.companyId)

    const [sRes, mRes] = await Promise.all([
      supabase.from('students').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false }),
      supabase.from('education_modules').select('id, module_code, module_name').eq('company_id', ctx.companyId).order('module_code'),
    ])

    // Enrollments have no company_id, so scope them through this company's
    // students. Never fall back to an unscoped select — that would leak every
    // tenant's rows to the client.
    const studentIds = (sRes.data || []).map((s: any) => s.id)
    const eRes = studentIds.length
      ? await supabase.from('student_enrollments').select('id, student_id, module_id, enrolled_at').in('student_id', studentIds)
      : { data: [] as any[] }

    const [linksRes, reqRes] = await Promise.all([
      studentApi({ action: 'list_invites', companyId: ctx.companyId }),
      studentApi({ action: 'list_requests', companyId: ctx.companyId }),
    ])

    setStudents(sRes.data || [])
    setModules(mRes.data || [])
    setEnrollments(eRes.data || [])
    setStudentLinks(linksRes?.invites || [])
    setStudentRequests(reqRes?.requests || [])

    const savedStatuses: Record<string, string> = {}
    ;(sRes.data || []).forEach((student: any) => {
      savedStatuses[student.id] = STATUS_OPTIONS.includes(student.status) ? student.status : 'Active'
    })
    setStatuses(savedStatuses)
  }

  useEffect(() => { loadData() }, [])

  const generateStudentNumber = async () => {
    let candidate = ''
    let isUnique = false

    while (!isUnique) {
      const buffer = new Uint32Array(2)
      crypto.getRandomValues(buffer)
      const randomPart = Array.from(buffer)
        .map((chunk) => chunk.toString(36).toUpperCase())
        .join('')
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8)
        .padEnd(8, '0')

      candidate = `S-${randomPart}`

      const { data: existing } = await supabase
        .from('students')
        .select('id')
        .eq('company_id', companyId)
        .eq('student_id', candidate)
        .maybeSingle()

      isUnique = !existing
    }

    return candidate
  }

  const addStudent = async () => {
    if (!companyId || !form.full_name) return

    const studentNumber = await generateStudentNumber()

    const createWithStatus = await supabase
      .from('students')
      .insert({ company_id: companyId, student_id: studentNumber, full_name: form.full_name, email: form.email || null, phone: form.phone || null, guardian_name: form.guardian_name || null, guardian_phone: form.guardian_phone || null, guardian_email: form.guardian_email || null, status: 'Active' })
      .select('id')
      .single()

    const createWithoutStatus = createWithStatus.error
      ? await supabase
          .from('students')
          .insert({ company_id: companyId, student_id: studentNumber, full_name: form.full_name, email: form.email || null, phone: form.phone || null, guardian_name: form.guardian_name || null, guardian_phone: form.guardian_phone || null, guardian_email: form.guardian_email || null })
          .select('id')
          .single()
      : createWithStatus

    const created = createWithoutStatus.data

    // Publish the contact details to the licence hub so it can reach the
    // guardian directly when it sends marks and report cards.
    if (created?.id) {
      apiFetch('/api/education/student', {
        method: 'POST',
        body: JSON.stringify({
          companyId,
          student: {
            id: created.id,
            name: form.full_name,
            student_no: studentNumber,
            phone: form.phone,
            email: form.email,
            guardian_name: form.guardian_name,
            guardian_phone: form.guardian_phone,
            guardian_email: form.guardian_email,
          },
        }),
      }).catch(() => {})
    }

    if (created?.id && form.module_ids.length > 0) {
      const enrollmentsWithCompany = form.module_ids.map((moduleId) => ({ student_id: created.id, module_id: moduleId, company_id: companyId }))
      const insertRes = await supabase.from('student_enrollments').insert(enrollmentsWithCompany)
      if (insertRes.error) {
        await supabase.from('student_enrollments').insert(form.module_ids.map((moduleId) => ({ student_id: created.id, module_id: moduleId })))
      }
    }

    // Ecosystem: log student enrollment event
    if (created?.id) {
      await logEcosystemEvent({ companyId, eventType: 'student_enrolled', sourceTable: 'students', sourceId: created.id, payload: { full_name: form.full_name, modules: form.module_ids.length } })
      setEcosystemMsg(`${form.full_name} enrolled successfully. Ecosystem event logged — tuition invoice can be auto-generated.`)
      setTimeout(() => setEcosystemMsg(null), 5000)
    }

    setForm({ full_name: '', email: '', phone: '', guardian_name: '', guardian_phone: '', guardian_email: '', module_ids: [] })
    await loadData()
  }

  const updateStatus = async (studentId: string, status: string) => {
    setStatuses((prev) => ({ ...prev, [studentId]: status }))
    const { error } = await supabase.from('students').update({ status }).eq('id', studentId)
    if (error) {
      await loadData()
    }
  }

  const openEdit = (student: any) => {
    setEditError(null)
    setEditing(student)
    setEditForm({
      full_name: student.full_name || '',
      student_id: student.student_id || '',
      email: student.email || '',
      phone: student.phone || '',
      guardian_name: student.guardian_name || '',
      guardian_phone: student.guardian_phone || '',
      guardian_email: student.guardian_email || '',
      tuition_amount: student.tuition_amount != null ? String(student.tuition_amount) : '',
      status: STATUS_OPTIONS.includes(student.status) ? student.status : 'Active',
    })
  }

  /**
   * Save edits to a student record. This is the path that lets a legacy student
   * (created before contact fields existed) be given an email or WhatsApp
   * number so a transcript or report card can actually be delivered.
   */
  const saveEdit = async () => {
    if (!editing || !companyId) return
    if (!editForm.full_name.trim()) {
      setEditError('Student name is required.')
      return
    }
    setSaving(true)
    setEditError(null)
    try {
      const patch = {
        full_name: editForm.full_name.trim(),
        student_id: editForm.student_id.trim() || null,
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        guardian_name: editForm.guardian_name.trim() || null,
        guardian_phone: editForm.guardian_phone.trim() || null,
        guardian_email: editForm.guardian_email.trim() || null,
        tuition_amount: editForm.tuition_amount ? Number(editForm.tuition_amount) : null,
        status: editForm.status,
      }
      const { error } = await supabase.from('students').update(patch).eq('id', editing.id).eq('company_id', companyId)
      if (error) throw error

      // Re-publish the contact details so the hub can reach the guardian.
      apiFetch('/api/education/student', {
        method: 'POST',
        body: JSON.stringify({
          companyId,
          student: {
            id: editing.id,
            name: patch.full_name,
            student_no: patch.student_id,
            phone: patch.phone,
            email: patch.email,
            guardian_name: patch.guardian_name,
            guardian_phone: patch.guardian_phone,
            guardian_email: patch.guardian_email,
          },
        }),
      }).catch(() => {})

      setEditing(null)
      await loadData()
    } catch (e: any) {
      setEditError(e?.message || 'Could not save the student record.')
    } finally {
      setSaving(false)
    }
  }

  const createStudentLink = async () => {
    if (!companyId) return
    setBusy(true)
    try {
      const json = await studentApi({
        action: 'create_invite',
        companyId,
        label: linkForm.label || null,
        programme: linkForm.programme || null,
        maxUses: linkForm.maxUses || null,
        requiresApproval: linkForm.requiresApproval,
      })
      if (!json.ok) throw new Error(json.error || 'Could not create the link')
      setEcosystemMsg('Student invite link created — copy it and share with your students.')
      setLinkForm({ label: '', programme: '', maxUses: '', requiresApproval: true })
      await loadData()
    } catch (e: any) {
      setEcosystemMsg(e?.message || 'Could not create the link')
    } finally {
      setBusy(false)
    }
  }

  const revokeStudentLink = async (inviteId: string) => {
    const json = await studentApi({ action: 'revoke_invite', companyId, inviteId })
    if (!json.ok) setEcosystemMsg(json.error)
    await loadData()
  }

  const decideStudent = async (linkId: string, approve: boolean) => {
    setBusy(true)
    const json = await studentApi({ action: 'decide_request', companyId, linkId, approve })
    if (!json.ok) setEcosystemMsg(json.error)
    else setEcosystemMsg(approve ? 'Student admitted.' : 'Request rejected.')
    await loadData()
    setBusy(false)
  }

  const studentLinkUrl = (token: string) =>
    `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/join?student=${token}`

  const copyLink = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedLink(key)
    setTimeout(() => setCopiedLink(null), 2000)
  }

  const moduleLabel = (studentId: string) => {
    const ids = enrollments.filter((e) => e.student_id === studentId).map((e) => e.module_id)
    return modules.filter((module) => ids.includes(module.id)).map((module) => module.module_code).join(', ') || 'None'
  }

  const stats = useMemo(() => ({
    total: students.length,
    active: Object.values(statuses).filter((status) => status === 'Active').length,
    suspended: Object.values(statuses).filter((status) => status === 'Suspended').length,
    graduated: Object.values(statuses).filter((status) => status === 'Graduated').length,
  }), [students, statuses])

  const filteredModules = useMemo(() => {
    const searchTerm = moduleSearch.trim().toLowerCase()
    if (!searchTerm) return modules

    return modules.filter((module) =>
      `${module.module_code} ${module.module_name}`.toLowerCase().includes(searchTerm),
    )
  }, [modules, moduleSearch])

  const toggleModule = (moduleId: string) => {
    setForm((prev) => ({
      ...prev,
      module_ids: prev.module_ids.includes(moduleId)
        ? prev.module_ids.filter((id) => id !== moduleId)
        : [...prev.module_ids, moduleId],
    }))
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Student Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Add non-user students and enroll them in one or many modules</p>
      </div>

      {ecosystemMsg && (
        <Card className="p-3 border-blue-200 bg-blue-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-100"><Zap className="w-3.5 h-3.5 text-blue-600" /></div>
            <p className="text-xs font-medium text-blue-700">{ecosystemMsg}</p>
          </div>
        </Card>
      )}

      <Card className="p-5 border border-primary/15 bg-primary/[0.02] space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <Input placeholder="Student full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input placeholder="Student email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input placeholder="Student phone (for WhatsApp, optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input placeholder="Guardian name (optional)" value={form.guardian_name} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} />
          <Input placeholder="Guardian phone (for WhatsApp, optional)" value={form.guardian_phone} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} />
          <Input placeholder="Guardian email (optional)" value={form.guardian_email} onChange={(e) => setForm({ ...form, guardian_email: e.target.value })} />
        </div>
        <p className="text-xs text-muted-foreground">Add a guardian phone or email and marks, report cards and receipts are sent to them automatically over WhatsApp and email.</p>

        <div className="rounded-xl border p-3 space-y-3">
          <div>
            <p className="font-medium text-sm">Enroll in modules</p>
            <p className="text-xs text-muted-foreground">Open the dropdown and tick one or many modules for this student.</p>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="truncate text-left">
                  {form.module_ids.length === 0
                    ? 'Select modules'
                    : `${form.module_ids.length} module${form.module_ids.length > 1 ? 's' : ''} selected`}
                </span>
                <ChevronDown className="w-4 h-4 opacity-70" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(90vw,420px)] p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setForm((prev) => ({ ...prev, module_ids: modules.map((module) => module.id) }))}>Select all</Button>
                <Button variant="ghost" size="sm" onClick={() => setForm((prev) => ({ ...prev, module_ids: [] }))}>Clear</Button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search modules by code or name" value={moduleSearch} onChange={(e) => setModuleSearch(e.target.value)} />
              </div>

              <div className="max-h-52 overflow-y-auto border border-input rounded-xl divide-y">
                {filteredModules.map((module) => {
                  const checked = form.module_ids.includes(module.id)
                  return (
                    <div key={module.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors">
                      <Checkbox id={`module-${module.id}`} checked={checked} onCheckedChange={() => toggleModule(module.id)} />
                      <Label htmlFor={`module-${module.id}`} className="flex-1 cursor-pointer">
                        <p className="font-medium text-sm">{module.module_code}</p>
                        <p className="text-xs text-muted-foreground">{module.module_name}</p>
                      </Label>
                    </div>
                  )
                })}
                {filteredModules.length === 0 && (
                  <p className="px-3 py-4 text-sm text-muted-foreground">No modules match your search.</p>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex flex-wrap gap-2">
            {form.module_ids.length === 0 && <p className="text-xs text-muted-foreground">No modules selected yet.</p>}
            {form.module_ids.map((moduleId) => {
              const module = modules.find((item) => item.id === moduleId)
              if (!module) return null
              return <Badge key={moduleId} variant="secondary">{module.module_code}</Badge>
            })}
          </div>
        </div>

        <Button onClick={addStudent}><Plus className="w-4 h-4 mr-2" />Enroll Student</Button>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><GraduationCap className="w-4 h-4 text-primary" /></div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Enrol students by link or request</h3>
            <p className="text-[11px] text-muted-foreground/60">Share one link — students self-register and, if you require approval, you admit them here.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <Input placeholder="Label (e.g. BSc CS intake)" value={linkForm.label} onChange={(e) => setLinkForm({ ...linkForm, label: e.target.value })} />
          <Input placeholder="Programme" value={linkForm.programme} onChange={(e) => setLinkForm({ ...linkForm, programme: e.target.value })} />
          <Input type="number" placeholder="Max uses (blank = unlimited)" value={linkForm.maxUses} onChange={(e) => setLinkForm({ ...linkForm, maxUses: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={linkForm.requiresApproval} onChange={(e) => setLinkForm({ ...linkForm, requiresApproval: e.target.checked })} />
            Require approval
          </label>
        </div>
        <Button onClick={createStudentLink} disabled={busy}><Link2 className="w-4 h-4 mr-2" />{busy ? 'Creating…' : 'Create student link'}</Button>

        {studentLinks.length > 0 && (
          <div className="rounded-xl border divide-y">
            {studentLinks.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{l.label || 'Student link'}{l.programme ? ` · ${l.programme}` : ''}</p>
                  <p className="text-[11px] text-muted-foreground/50 font-mono truncate">{studentLinkUrl(l.token)}</p>
                </div>
                <span className="text-[11px] text-muted-foreground">{l.use_count}{l.max_uses ? ` / ${l.max_uses}` : ''}</span>
                <span className={`badge ${l.requires_approval ? 'badge-warning' : 'badge-info'}`}>{l.requires_approval ? 'Approval' : 'Auto'}</span>
                <span className={`badge ${l.is_active ? 'badge-success' : 'badge-neutral'}`}>{l.is_active ? 'Active' : 'Revoked'}</span>
                <button onClick={() => copyLink(studentLinkUrl(l.token), l.id)} className="p-1.5 rounded-md text-muted-foreground/60 hover:text-primary hover:bg-primary/5" title="Copy link">
                  {copiedLink === l.id ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
                {l.is_active && (
                  <button onClick={() => revokeStudentLink(l.id)} className="p-1.5 rounded-md text-muted-foreground/60 hover:text-red-500 hover:bg-red-50" title="Revoke">
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {studentRequests.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 divide-y divide-amber-100">
            <div className="px-3 py-2"><p className="text-xs font-semibold text-amber-700">{studentRequests.length} pending student request{studentRequests.length > 1 ? 's' : ''}</p></div>
            {studentRequests.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{r.users?.full_name || r.students?.full_name || 'Applicant'}</p>
                  <p className="text-[11px] text-muted-foreground/60">{r.users?.email || r.students?.email}{r.programme ? ` · ${r.programme}` : ''}</p>
                </div>
                <Button size="sm" disabled={busy} onClick={() => decideStudent(r.id, true)}><CheckCircle className="w-3.5 h-3.5 mr-1" />Admit</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => decideStudent(r.id, false)}><XCircle className="w-3.5 h-3.5 mr-1" />Reject</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
        {[
          { label: 'Total', value: stats.total },
          { label: 'Active', value: stats.active },
          { label: 'Suspended', value: stats.suspended },
          { label: 'Graduated', value: stats.graduated },
        ].map(stat => (
          <Card key={stat.label} className="stat-card p-4">
            <p className="text-[11px] text-muted-foreground font-medium mb-1">{stat.label}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="premium-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Student Number</th>
              <th>Modules</th>
              <th>Contact</th>
              <th>Enrollment Date</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} >
                <td>{student.full_name}</td>
                <td className="font-mono text-xs text-muted-foreground">{student.student_id || 'Auto'}</td>
                <td>{moduleLabel(student.id)}</td>
                <td>
                  {student.email || student.phone || student.guardian_email || student.guardian_phone ? (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {(student.email || student.phone) && <p>{student.email || student.phone}</p>}
                      {student.guardian_name && (
                        <p className="text-muted-foreground/60">
                          {student.guardian_name}
                          {student.guardian_phone ? ` · ${student.guardian_phone}` : ''}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="badge badge-warning" title="No email or WhatsApp number — a transcript cannot be delivered until one is added">No contact</span>
                  )}
                </td>
                <td>{new Date(student.created_at).toLocaleString()}</td>
                <td>
                  <select className="form-select !py-1 !px-2 !text-xs" value={statuses[student.id] || 'Active'} onChange={(e) => updateStatus(student.id, e.target.value)}>
                    {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </td>
                <td className="text-right">
                  <Button size="sm" variant="outline" onClick={() => openEdit(student)}>
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit student</DialogTitle>
            <DialogDescription>
              Correct a legacy record or add the contact details a transcript is sent to.
            </DialogDescription>
          </DialogHeader>
          {editError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-600">{editError}</div>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Full name *</label>
              <Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Student number</label>
              <Input value={editForm.student_id} onChange={(e) => setEditForm({ ...editForm, student_id: e.target.value })} placeholder="Auto" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Student email</label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="student@example.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Student WhatsApp / phone</label>
              <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="+256 ..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Guardian name</label>
              <Input value={editForm.guardian_name} onChange={(e) => setEditForm({ ...editForm, guardian_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Guardian WhatsApp / phone</label>
              <Input value={editForm.guardian_phone} onChange={(e) => setEditForm({ ...editForm, guardian_phone: e.target.value })} placeholder="+256 ..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Guardian email</label>
              <Input type="email" value={editForm.guardian_email} onChange={(e) => setEditForm({ ...editForm, guardian_email: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tuition amount</label>
              <Input type="number" value={editForm.tuition_amount} onChange={(e) => setEditForm({ ...editForm, tuition_amount: e.target.value })} placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Status</label>
              <select className="form-select w-full" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
