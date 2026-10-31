import { NextRequest, NextResponse } from 'next/server'
import { adminAvailable, adminClient } from '@/lib/lic/peer'
import { getCaller, getMembership } from '@/lib/lic/serverAuth'
import { hit } from '@/lib/security/rate-limit'
import { notifyEvent, type NotifyEvent } from '@/lib/notify/events'
import { buildTemplate, knownEvent } from '@/lib/notify/templates'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notify/event
 *
 * The single entry point every module uses to notify a user automatically. The
 * caller sends the *facts* of an event; the server builds the message, resolves
 * recipients from the database, and hands delivery to the licence hub (which
 * renders any PDF, attaches it to email + WhatsApp, and de-duplicates).
 *
 * Body:
 *   { companyId, event, dedupeKey, data, emails?, whatsapp?,
 *     notifyCompanyAdmins?, userIds?, studentIds?, subjectType?, subjectId? }
 *
 * The caller must be an active member of `companyId`. Recipients are resolved
 * server-side; explicit emails/WhatsApp numbers are only honoured for a member
 * of that company.
 */
export async function POST(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })

  const caller = await getCaller(req)
  if (!caller) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const companyId = String(body?.companyId || '')
  const event = String(body?.event || '')
  if (!companyId || !event) {
    return NextResponse.json({ ok: false, error: 'companyId and event are required' }, { status: 400 })
  }

  // A member may only notify within a company they belong to.
  const membership = await getMembership(caller.id, companyId)
  if (!membership) return NextResponse.json({ ok: false, error: 'Not a member of this company' }, { status: 403 })

  // Best-effort brake on notification spam from a single account.
  const limit = hit(`notify:${caller.id}`, { windowSeconds: 60, max: 120 })
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: 'Too many notifications, slow down' }, { status: 429 })
  }

  const db = adminClient()
  const { data: company } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
  const companyName = (company as any)?.name || 'Jackisa Office'

  const data = (body?.data && typeof body.data === 'object') ? body.data : {}
  const built = knownEvent(event)
    ? buildTemplate(event, companyName, data)
    : buildTemplate('generic', companyName, data)

  const dedupeKey = String(body?.dedupeKey || `${event}:${companyId}:${Date.now()}`)

  const outcome = await notifyEvent({
    event: event as NotifyEvent,
    companyId,
    dedupeKey,
    subject: built.subject,
    html: built.html,
    text: built.text,
    template: built.template,
    emails: Array.isArray(body?.emails) ? body.emails : undefined,
    whatsapp: Array.isArray(body?.whatsapp) ? body.whatsapp : undefined,
    notifyCompanyAdmins: body?.notifyCompanyAdmins === true,
    userIds: Array.isArray(body?.userIds) ? body.userIds : undefined,
    studentIds: Array.isArray(body?.studentIds) ? body.studentIds : undefined,
    document: built.document,
    subjectType: body?.subjectType,
    subjectId: body?.subjectId,
  })

  return NextResponse.json({ ...outcome, error: outcome.ok ? undefined : outcome.error }, { status: outcome.ok ? 200 : 502 })
}
