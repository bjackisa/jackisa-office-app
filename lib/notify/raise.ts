/**
 * Server-side convenience for raising a notification from other server code
 * (cron jobs, webhooks, route handlers) without going through HTTP.
 *
 * Builds the message from the typed template registry and dispatches it.
 */

import { adminClient } from '@/lib/lic/peer'
import { notifyEvent, type NotifyEvent, type NotifyOutcome } from '@/lib/notify/events'
import { buildTemplate, knownEvent } from '@/lib/notify/templates'

export interface RaiseOptions {
  emails?: string[]
  whatsapp?: string[]
  notifyCompanyAdmins?: boolean
  userIds?: string[]
  studentIds?: string[]
  subjectType?: string
  subjectId?: string
}

/** Build and dispatch an event from a set of facts. Never throws. */
export async function raise(
  event: NotifyEvent | string,
  companyId: string,
  dedupeKey: string,
  data: Record<string, any>,
  opts: RaiseOptions = {}
): Promise<NotifyOutcome> {
  const { data: company } = await adminClient()
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle()
  const companyName = (company as any)?.name || 'Jackisa Office'
  const built = knownEvent(event) ? buildTemplate(event, companyName, data) : buildTemplate('generic', companyName, data)

  return notifyEvent({
    event: event as NotifyEvent,
    companyId,
    dedupeKey,
    subject: built.subject,
    html: built.html,
    text: built.text,
    template: built.template,
    document: built.document,
    ...opts,
  })
}
