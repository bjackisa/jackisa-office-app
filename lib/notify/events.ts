/**
 * The office notification engine.
 *
 * Every module (HR, payroll, accounting, sales, education, investment,
 * dividends, helpdesk, …) raises a *fact* here and the engine does the rest:
 *
 *   1. It resolves recipients **server-side from the database** — never from
 *      the request body — so a caller can never redirect someone else's
 *      notification, and so an employee added later starts receiving mail with
 *      no extra wiring.
 *   2. It builds a branded HTML email (lib/lic/messages.ts) and a WhatsApp
 *      twin, and optionally a structured document.
 *   3. It hands the whole thing to the licence hub's `/api/v1/notify` rail,
 *      which renders and attaches the PDF and de-duplicates delivery.
 *
 * Delivery is best-effort: a notification failure never fails the action that
 * triggered it, and a retried event never double-sends because the hub
 * de-duplicates on `dedupe_key`.
 *
 * This module is server-only (it uses the service-role client).
 */

import { adminClient } from '@/lib/lic/peer'
import { lic } from '@/lib/lic/client'
import { emailShell, escapeHtml } from '@/lib/lic/messages'

export type NotifyEvent =
  | 'hr.points'
  | 'payroll.paid'
  | 'invoice.created'
  | 'invoice.paid'
  | 'invoice.reminder'
  | 'invoice.overdue'
  | 'payment.received'
  | 'sales.order'
  | 'dividend.declared'
  | 'dividend.paid'
  | 'investment.statement'
  | 'leave.requested'
  | 'leave.decided'
  | 'helpdesk.ticket'
  | 'helpdesk.reply'
  | 'student.enrolled'
  | 'license.expiring'
  | 'account.statement'
  | 'generic'

export interface DocumentSpec {
  kind?: string
  title?: string
  subtitle?: string
  filename?: string
  meta?: Array<[string, string]>
  tables?: Array<{ title?: string; columns: Array<{ label: string; align?: string }>; rows: Array<Array<any>> }>
  totals?: Array<{ label: string; value: string; strong?: boolean }>
  note?: string
}

export interface NotifyEventParams {
  event: NotifyEvent
  companyId: string
  /** Stable id for this event instance so retries don't double-send. */
  dedupeKey: string
  subject: string
  /** Inner HTML for the branded email shell. */
  html: string
  /** Plain text for WhatsApp; defaults to a flattening of `html` at the hub. */
  text?: string
  template?: string
  /** Explicit recipients. When omitted they are resolved from the DB. */
  emails?: string[]
  whatsapp?: string[]
  /** Notify every active admin/owner of the company. */
  notifyCompanyAdmins?: boolean
  /** Extra recipients resolved from the `users` table by id. */
  userIds?: string[]
  /** Extra recipients resolved from the `students` table by id. */
  studentIds?: string[]
  document?: DocumentSpec
  subjectType?: string
  subjectId?: string
}

export interface NotifyOutcome {
  ok: boolean
  emails: number
  whatsapp: number
  documentUrl?: string | null
  error?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Digits-only, keep the last 12; null when it can't be a phone number. */
function normalisePhone(raw?: string | null): string | null {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length < 9) return null
  return digits.slice(-12)
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

interface Recipients {
  emails: string[]
  phones: string[]
}

/**
 * Resolve the recipients for an event from the database. Explicit addresses
 * win; otherwise we look up the company owner/admins, then any named users or
 * students.
 */
async function resolveRecipients(params: NotifyEventParams): Promise<Recipients> {
  const emails: string[] = []
  const phones: string[] = []

  for (const e of params.emails || []) {
    if (EMAIL_RE.test(e)) emails.push(e.trim().toLowerCase())
  }
  for (const p of params.whatsapp || []) {
    const n = normalisePhone(p)
    if (n) phones.push(n)
  }

  const needsLookup = params.notifyCompanyAdmins || (params.userIds?.length ?? 0) > 0 || (params.studentIds?.length ?? 0) > 0
  if (!needsLookup) {
    return { emails: unique(emails), phones: unique(phones) }
  }

  const db = adminClient()

  if (params.userIds?.length) {
    const { data } = await db.from('users').select('email, phone').in('id', params.userIds)
    for (const u of data || []) {
      if (u.email && EMAIL_RE.test(u.email)) emails.push(String(u.email).toLowerCase())
      const n = normalisePhone((u as any).phone)
      if (n) phones.push(n)
    }
  }

  if (params.studentIds?.length) {
    const { data } = await db
      .from('students')
      .select('email, phone, guardian_email, guardian_phone')
      .in('id', params.studentIds)
    for (const s of data || []) {
      for (const e of [(s as any).email, (s as any).guardian_email]) {
        if (e && EMAIL_RE.test(e)) emails.push(String(e).toLowerCase())
      }
      for (const p of [(s as any).phone, (s as any).guardian_phone]) {
        const n = normalisePhone(p)
        if (n) phones.push(n)
      }
    }
  }

  if (params.notifyCompanyAdmins) {
    const { data: company } = await db
      .from('companies')
      .select('created_by, owner_user_id')
      .eq('id', params.companyId)
      .maybeSingle()
    const ownerIds = [(company as any)?.created_by, (company as any)?.owner_user_id].filter(Boolean) as string[]

    const { data: admins } = await db
      .from('company_employees')
      .select('user_id, company_roles(name, is_admin)')
      .eq('company_id', params.companyId)
      .eq('status', 'active')

    const adminUserIds = (admins || [])
      .filter((a: any) => {
        const role = a.company_roles
        return role?.is_admin === true || /admin|owner|director|principal|manager/i.test(String(role?.name || ''))
      })
      .map((a: any) => a.user_id)

    const ids = unique([...ownerIds, ...adminUserIds])
    if (ids.length) {
      const { data: users } = await db.from('users').select('email, phone').in('id', ids)
      for (const u of users || []) {
        if (u.email && EMAIL_RE.test(u.email)) emails.push(String(u.email).toLowerCase())
        const n = normalisePhone((u as any).phone)
        if (n) phones.push(n)
      }
    }
  }

  return { emails: unique(emails), phones: unique(phones) }
}

/**
 * Raise an event. Resolves recipients, brands the email, and dispatches through
 * the hub. Never throws — returns the outcome so a caller can log it.
 */
export async function notifyEvent(params: NotifyEventParams): Promise<NotifyOutcome> {
  try {
    const recipients = await resolveRecipients(params)
    if (!recipients.emails.length && !recipients.phones.length) {
      return { ok: false, emails: 0, whatsapp: 0, error: 'no_recipients' }
    }

    const { data: company } = await adminClient()
      .from('companies')
      .select('name, logo_url, lic_tenant_id')
      .eq('id', params.companyId)
      .maybeSingle()
    const tenantId = (company as any)?.lic_tenant_id || params.companyId
    const companyName = (company as any)?.name || 'Jackisa Office'

    const res = await lic.notify({
      tenant_id: tenantId,
      company_name: companyName,
      company_logo_url: (company as any)?.logo_url || undefined,
      event: params.event,
      dedupe_key: params.dedupeKey,
      subject: params.subject,
      html: emailShell(params.subject, params.html),
      text: params.text,
      emails: recipients.emails,
      whatsapp: recipients.phones,
      template: params.template || params.event,
      subject_type: params.subjectType,
      subject_id: params.subjectId,
      document: params.document,
    })

    if (res.api_status !== '200') {
      return { ok: false, emails: 0, whatsapp: 0, error: res.errors?.error_text || 'hub_unavailable' }
    }
    return {
      ok: true,
      emails: recipients.emails.length,
      whatsapp: recipients.phones.length,
      documentUrl: (res.data as any)?.document?.url || null,
    }
  } catch (err: any) {
    console.error('[notify] dispatch failed', params.event, err?.message)
    return { ok: false, emails: 0, whatsapp: 0, error: err?.message || 'error' }
  }
}

/** A compact points-balance line reused by HR notifications. */
export function pointsBalanceLine(opts: { gained: number; lost: number; balance: number; period?: string }): string {
  const period = opts.period ? ` for ${escapeHtml(opts.period)}` : ''
  const change = opts.gained > 0 ? `+${opts.gained}` : opts.lost > 0 ? `-${opts.lost}` : '0'
  return `<p style="margin:0 0 8px">Your points balance${period} is now <strong>${opts.balance}</strong> (${change} this entry).</p>`
}
