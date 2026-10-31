/**
 * Invite + join-request notifications, delivered on email and WhatsApp at once.
 *
 * Failures are swallowed (and logged): a messaging hiccup must never stop an
 * admin from creating an invite or approving a request. The invite link itself
 * is still shown in the UI regardless of whether the message went out.
 */

import { notify } from '@/lib/lic/notify'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { companyInviteEmail, joinDecisionEmail } from '@/lib/lic/messages'

/** Resolve a WhatsApp number for an email address from the users table. */
async function phoneForEmail(email: string): Promise<string | null> {
  if (!adminAvailable() || !email) return null
  try {
    const { data } = await adminClient().from('users').select('phone').eq('email', email).maybeSingle()
    const phone = data?.phone ? String(data.phone) : ''
    return phone.replace(/\D/g, '').length >= 9 ? phone : null
  } catch {
    return null
  }
}

export interface InviteNotifyParams {
  companyId: string
  companyName?: string | null
  inviteUrl: string
  email: string
  msisdn?: string | null
  position?: string | null
  inviterName?: string | null
  requiresApproval?: boolean
  expiresAt?: string | null
}

export async function notifyCompanyInvite(p: InviteNotifyParams): Promise<void> {
  try {
    let companyName = p.companyName || ''
    if (!companyName && adminAvailable()) {
      const { data } = await adminClient().from('companies').select('name').eq('id', p.companyId).maybeSingle()
      companyName = data?.name || 'your company'
    }

    const whatsapp = p.msisdn || (await phoneForEmail(p.email)) || undefined
    const { subject, html } = companyInviteEmail({
      companyName,
      inviteUrl: p.inviteUrl,
      position: p.position,
      inviterName: p.inviterName,
      requiresApproval: p.requiresApproval,
      expiresAt: p.expiresAt,
    })

    await notify({ to: p.email, whatsapp, subject, html, template: 'company_invite' })
  } catch (e) {
    console.error('[invites] notify failed', e)
  }
}

export interface JoinDecisionNotifyParams {
  companyId: string
  companyName?: string | null
  userId: string
  approved: boolean
  note?: string | null
}

export async function notifyJoinDecision(p: JoinDecisionNotifyParams): Promise<void> {
  try {
    let email = ''
    let whatsapp: string | undefined
    let companyName = p.companyName || ''

    if (adminAvailable()) {
      const db = adminClient()
      const { data: user } = await db.from('users').select('email, phone').eq('id', p.userId).maybeSingle()
      email = user?.email || ''
      const phone = user?.phone ? String(user.phone).replace(/\D/g, '') : ''
      if (phone.length >= 9) whatsapp = phone
      if (!companyName) {
        const { data: company } = await db.from('companies').select('name').eq('id', p.companyId).maybeSingle()
        companyName = company?.name || 'the company'
      }
    }

    if (!email && !whatsapp) return

    const { subject, html } = joinDecisionEmail({ companyName, approved: p.approved, note: p.note })
    await notify({ to: email, whatsapp, subject, html, template: 'join_decision' })
  } catch (e) {
    console.error('[invites] join decision notify failed', e)
  }
}
