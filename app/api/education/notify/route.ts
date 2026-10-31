import { NextRequest, NextResponse } from 'next/server'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { lic } from '@/lib/lic/client'
import { loadStudentContext } from '@/lib/education/standings'
import { requireFeature } from '@/lib/lic/guard'

export const dynamic = 'force-dynamic'

/**
 * /api/education/notify
 *
 * Called after a mark is recorded or when final grades are released. The heavy
 * lifting (PDF rendering and WhatsApp/email delivery) happens on lic; this route
 * computes the student's standing, asks the hub to issue and send the document,
 * then records the outcome in `document_deliveries` for the history view.
 *
 * Body: { companyId, studentId, kind: 'marks' | 'transcript', module?, assessment? }
 */
export async function POST(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const companyId = String(body?.companyId || '')
  const studentId = String(body?.studentId || '')
  const kind = body?.kind === 'transcript' ? 'transcript' : 'marks'
  if (!companyId || !studentId) {
    return NextResponse.json({ ok: false, error: 'companyId and studentId are required' }, { status: 400 })
  }

  const gate = await requireFeature(req, companyId, 'education')
  if ('error' in gate) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })

  const db = adminClient()
  const [{ data: company }, ctx] = await Promise.all([
    db.from('companies').select('id, name, logo_url, lic_tenant_id').eq('id', companyId).maybeSingle(),
    loadStudentContext(db, companyId, studentId),
  ])
  if (!ctx.student) return NextResponse.json({ ok: false, error: 'Student not found' }, { status: 404 })

  const student = ctx.student as any
  const tenantId = company?.lic_tenant_id || companyId
  const recipients = {
    phones: [student.guardian_phone, student.phone].filter(Boolean),
    emails: [student.guardian_email, student.email].filter(Boolean),
  }
  if (!recipients.phones.length && !recipients.emails.length) {
    return NextResponse.json({ ok: false, error: 'No phone or email on record for this student' }, { status: 422 })
  }

  const standingPayload = {
    average: ctx.standing.average,
    points: ctx.standing.points,
    missed_days: ctx.standing.missed_days,
    balance: ctx.standing.balance,
    trend: ctx.standing.trend,
  }

  const studentPayload = {
    id: student.id,
    student_no: student.student_id,
    name: student.full_name || 'Student',
    phone: student.phone,
    email: student.email,
    guardian_phone: student.guardian_phone,
    guardian_email: student.guardian_email,
  }

  const result =
    kind === 'transcript'
      ? await lic.transcript({
          tenant_id: tenantId,
          company_name: company?.name || 'Jackisa Office',
          company_logo_url: company?.logo_url || undefined,
          student: studentPayload,
          modules: ctx.standing.modules.map((m) => ({ code: m.code, name: m.name, coursework: m.coursework, exam: m.exam, total: m.total, grade: m.grade })),
          summary: { average: ctx.standing.average, points: ctx.standing.points },
          recipients,
        })
      : await lic.notifyMarks({
          tenant_id: tenantId,
          company_name: company?.name || 'Jackisa Office',
          company_logo_url: company?.logo_url || undefined,
          student: studentPayload,
          module: body?.module || {},
          assessment: body?.assessment || {},
          standing: standingPayload,
          recipients,
        })

  const doc = (result as any)?.data?.document || null
  const delivery = (result as any)?.data?.delivery || null
  const ok = result.api_status === '200'

  // Record what happened so the school can see (and re-send) it later.
  try {
    await db.from('document_deliveries').insert({
      company_id: companyId,
      student_id: studentId,
      kind: kind === 'transcript' ? 'transcript' : 'marks_notification',
      channel: recipients.phones.length && recipients.emails.length ? 'both' : recipients.phones.length ? 'whatsapp' : 'email',
      recipient: recipients.phones.concat(recipients.emails).join(', '),
      subject: kind === 'transcript' ? `Report card — ${student.full_name}` : `Assessment result — ${student.full_name}`,
      document_ref: doc?.id || null,
      storage_path: doc?.path || null,
      status: ok ? 'sent' : 'failed',
      error: ok ? null : (result as any)?.errors?.error_text || 'Delivery failed',
      payload: { standing: standingPayload, module: body?.module || {}, assessment: body?.assessment || {} },
    })
  } catch (e) {
    console.error('[education] delivery log failed', e)
  }

  return NextResponse.json({
    ok,
    documentUrl: doc?.url || null,
    delivery,
    standing: standingPayload,
    error: ok ? undefined : (result as any)?.errors?.error_text,
  })
}

/** GET /api/education/notify?companyId=...&studentId=... — recent deliveries. */
export async function GET(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('companyId')
  const studentId = searchParams.get('studentId')
  if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 })

  const gate = await requireFeature(req, companyId, 'education')
  if ('error' in gate) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })

  const db = adminClient()
  let query = db
    .from('document_deliveries')
    .select('id, kind, channel, recipient, subject, document_ref, status, error, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (studentId) query = query.eq('student_id', studentId)
  const { data } = await query
  return NextResponse.json({ ok: true, deliveries: data || [] })
}