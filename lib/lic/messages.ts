/**
 * Transactional message templates for Jackisa Office.
 *
 * Each builder returns a branded HTML email body. The concurrent notifier
 * (lib/lic/notify.ts) flattens that same HTML into the WhatsApp copy, so the
 * email and the WhatsApp message always say the same thing — exactly how
 * jackisa.com mirrors every email to WhatsApp through Whapi.Cloud.
 */

const BRAND = 'Jackisa Office'
const BRAND_URL = 'https://office.jackisa.com'

function shell(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="text-align:center;padding:8px 0 20px">
      <span style="font-size:18px;font-weight:700;letter-spacing:-0.02em">${BRAND}</span>
    </div>
    <div style="background:#ffffff;border-radius:14px;padding:28px;border:1px solid #e6e8eb">
      <h1 style="margin:0 0 14px;font-size:20px;font-weight:700">${heading}</h1>
      ${bodyHtml}
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin:18px 0 0">
      Sent by ${BRAND} &middot; <a href="${BRAND_URL}" style="color:#94a3b8">${BRAND_URL}</a>
    </p>
  </div>
</body></html>`
}

function button(label: string, url: string): string {
  return `<p style="margin:22px 0"><a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${label}</a></p>`
}

export interface InviteEmailParams {
  companyName: string
  inviteUrl: string
  position?: string | null
  inviterName?: string | null
  requiresApproval?: boolean
  expiresAt?: string | null
}

export function companyInviteEmail(p: InviteEmailParams): { subject: string; html: string } {
  const role = p.position ? ` as <strong>${escapeHtml(p.position)}</strong>` : ''
  const from = p.inviterName ? `${escapeHtml(p.inviterName)} has invited you` : `You have been invited`
  const approval = p.requiresApproval
    ? `<p style="margin:0 0 10px;color:#475569;font-size:14px">The company admin will review your request before you are admitted.</p>`
    : ''
  const expiry = p.expiresAt
    ? `<p style="margin:0 0 10px;color:#94a3b8;font-size:12px">This invitation expires on ${escapeHtml(new Date(p.expiresAt).toLocaleDateString())}.</p>`
    : ''

  return {
    subject: `You're invited to join ${p.companyName} on ${BRAND}`,
    html: shell(
      `Join ${escapeHtml(p.companyName)}`,
      `<p style="margin:0 0 10px;color:#475569;font-size:14px">${from} to join <strong>${escapeHtml(p.companyName)}</strong>${role} on ${BRAND}.</p>
       ${approval}
       ${button('Accept invitation', p.inviteUrl)}
       <p style="margin:0 0 6px;color:#475569;font-size:13px">Or paste this link into your browser:</p>
       <p style="margin:0 0 10px;font-size:13px;word-break:break-all"><a href="${p.inviteUrl}" style="color:#2563eb">${p.inviteUrl}</a></p>
       ${expiry}`
    ),
  }
}

export interface JoinDecisionEmailParams {
  companyName: string
  approved: boolean
  note?: string | null
}

export function joinDecisionEmail(p: JoinDecisionEmailParams): { subject: string; html: string } {
  const note = p.note ? `<p style="margin:0 0 10px;color:#475569;font-size:14px">${escapeHtml(p.note)}</p>` : ''
  return {
    subject: p.approved
      ? `You're in — welcome to ${p.companyName}`
      : `Your request to join ${p.companyName}`,
    html: shell(
      p.approved ? `Welcome to ${escapeHtml(p.companyName)}` : `Request not approved`,
      p.approved
        ? `<p style="margin:0 0 10px;color:#475569;font-size:14px">Your request to join <strong>${escapeHtml(p.companyName)}</strong> was approved. You can now open the workspace and get started.</p>
           ${note}${button('Open workspace', BRAND_URL)}`
        : `<p style="margin:0 0 10px;color:#475569;font-size:14px">Your request to join <strong>${escapeHtml(p.companyName)}</strong> was not approved.</p>${note}`
    ),
  }
}

export interface TrialReminderEmailParams {
  companyName: string
  daysLeft: number
  billingUrl: string
  msisdn?: string | null
}

export function trialReminderEmail(p: TrialReminderEmailParams): { subject: string; html: string } {
  const debit = p.msisdn
    ? `<p style="margin:0 0 10px;color:#475569;font-size:14px">On the last day we'll send a JPesa prompt to <strong>${escapeHtml(p.msisdn)}</strong>. Approve it to keep your workspace active.</p>`
    : ''
  return {
    subject: `Your ${BRAND} trial ends in ${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'}`,
    html: shell(
      `${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} left on your trial`,
      `<p style="margin:0 0 10px;color:#475569;font-size:14px">Your free trial for <strong>${escapeHtml(p.companyName)}</strong> ends in ${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'}.</p>
       ${debit}
       ${button('Choose a plan', p.billingUrl)}
       <p style="margin:0;color:#94a3b8;font-size:12px">You can cancel at any time from Billing.</p>`
    ),
  }
}

export interface PaymentReceiptEmailParams {
  companyName: string
  amount: number
  currency: string
  planLabel?: string | null
  merchantRef?: string | null
  periodEnd?: string | null
}

export function paymentReceiptEmail(p: PaymentReceiptEmailParams): { subject: string; html: string } {
  const rows = [
    p.planLabel ? `<tr><td style="padding:6px 0;color:#94a3b8;font-size:13px">Plan</td><td style="padding:6px 0;text-align:right;font-size:13px">${escapeHtml(p.planLabel)}</td></tr>` : '',
    p.merchantRef ? `<tr><td style="padding:6px 0;color:#94a3b8;font-size:13px">Reference</td><td style="padding:6px 0;text-align:right;font-size:13px">${escapeHtml(p.merchantRef)}</td></tr>` : '',
    p.periodEnd ? `<tr><td style="padding:6px 0;color:#94a3b8;font-size:13px">Valid until</td><td style="padding:6px 0;text-align:right;font-size:13px">${escapeHtml(new Date(p.periodEnd).toLocaleDateString())}</td></tr>` : '',
  ].join('')

  return {
    subject: `Payment received — ${p.currency} ${p.amount.toLocaleString()}`,
    html: shell(
      'Payment received',
      `<p style="margin:0 0 10px;color:#475569;font-size:14px">We received your payment for <strong>${escapeHtml(p.companyName)}</strong>.</p>
       <table style="width:100%;border-collapse:collapse;margin:12px 0">
         <tr><td style="padding:6px 0;color:#94a3b8;font-size:13px">Amount</td><td style="padding:6px 0;text-align:right;font-weight:700;font-size:13px">${escapeHtml(p.currency)} ${p.amount.toLocaleString()}</td></tr>
         ${rows}
       </table>
       ${button('View billing', `${BRAND_URL}/app/settings/billing`)}`
    ),
  }
}

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
