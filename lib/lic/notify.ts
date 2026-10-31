/**
 * One notification, two channels — email and WhatsApp, sent concurrently.
 *
 * This mirrors jackisa.com: every transactional email also goes out as an
 * ordinary WhatsApp message through Whapi.Cloud (via the licence hub's
 * /api/v1/whapi). The two channels are dispatched together with Promise.all,
 * so the slower one never delays the other, and a failure on one channel never
 * stops the other — a bounced email still leaves the WhatsApp copy delivered.
 *
 * Plain `sendEmail` / `sendWhatsApp` remain available for one-channel sends.
 */

import { lic } from '@/lib/lic/client'
import { htmlToText } from '@/lib/lic/html-to-text'

export interface NotifyParams {
  /** Email address(es). */
  to: string | string[]
  /** WhatsApp recipient (digits, with or without +). Optional. */
  whatsapp?: string
  subject: string
  /** HTML body for email. */
  html: string
  /** Plain text for WhatsApp; defaults to a flattened `html`. */
  text?: string
  /** Template name, recorded in the hub's message log. */
  template?: string
}

export interface ChannelResult {
  ok: boolean
  error?: string
}

export interface NotifyResult {
  email: ChannelResult
  whatsapp: ChannelResult
}

/**
 * Numbers that must never receive a WhatsApp message from this app, whatever
 * the source (a company phone, a member, an invite recipient). Compared on the
 * last 9 digits so +256…, 0…, 256… and bare local forms all match.
 */
const WHATSAPP_SUPPRESSED = ['0752567374']

function isSuppressedNumber(to?: string | null): boolean {
  if (!to) return false
  const digits = String(to).replace(/\D/g, '')
  if (digits.length < 9) return false
  const tail = digits.slice(-9)
  return WHATSAPP_SUPPRESSED.some((n) => n.replace(/\D/g, '').slice(-9) === tail)
}

export async function sendEmail(params: {
  to: string | string[]
  subject: string
  html: string
  template?: string
}): Promise<ChannelResult> {
  const res = await lic.sendMail({
    to: params.to,
    subject: params.subject,
    html: params.html,
    template: params.template,
  })
  return res.api_status === '200' ? { ok: true } : { ok: false, error: res.errors?.error_text }
}

export async function sendWhatsApp(params: {
  to: string
  body: string
  template?: string
}): Promise<ChannelResult> {
  if (!params.to || params.to.replace(/\D/g, '').length < 9) {
    return { ok: false, error: 'no_whatsapp_number' }
  }
  if (isSuppressedNumber(params.to)) {
    return { ok: false, error: 'whatsapp_suppressed' }
  }
  const res = await lic.sendWhatsApp({ to: params.to, body: params.body, template: params.template })
  return res.api_status === '200' ? { ok: true } : { ok: false, error: res.errors?.error_text }
}

/**
 * Send the same message on email and WhatsApp at the same time.
 * Never throws: each channel reports its own outcome.
 */
export async function notify(params: NotifyParams): Promise<NotifyResult> {
  const body = params.text?.trim() || htmlToText(params.html)

  const [email, whatsapp] = await Promise.all([
    sendEmail({ to: params.to, subject: params.subject, html: params.html, template: params.template }),
    params.whatsapp
      ? sendWhatsApp({ to: params.whatsapp, body, template: params.template })
      : Promise.resolve<ChannelResult>({ ok: false, error: 'no_whatsapp_number' }),
  ])

  return { email, whatsapp }
}
