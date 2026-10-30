/**
 * Jackisa License Hub client (server-side only).
 *
 * Signs every request with the shared office secret so lic.jackisa.com knows
 * the call is genuinely from office.jackisa.com. Never import this into a
 * client component — the secret must stay on the server.
 */

import crypto from 'crypto'

const BASE_URL = (process.env.LIC_API_URL || 'https://lic.jackisa.com').replace(/\/$/, '')
const SHARED_SECRET = process.env.LIC_OFFICE_SECRET || ''
const PEER = 'office'

export interface LicResponse<T = any> {
  api_status: string
  api_version?: string
  data?: T
  errors?: { error_id: string; error_text: string }
}

function sign(body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', SHARED_SECRET).update(body).digest('hex')
}

async function call<T = any>(path: string, body: Record<string, any> = {}): Promise<LicResponse<T>> {
  const raw = JSON.stringify(body)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Lic-Signature': sign(raw),
        'X-Lic-Peer': PEER,
      },
      body: raw,
      cache: 'no-store',
    })
    const json = (await res.json()) as LicResponse<T>
    return json
  } catch (err: any) {
    return {
      api_status: '503',
      errors: { error_id: '503', error_text: err?.message || 'Licence service unavailable' },
    }
  }
}

export const lic = {
  isConfigured(): boolean {
    return SHARED_SECRET !== ''
  },

  plans() {
    return fetch(`${BASE_URL}/api/v1/office-license/plans`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<LicResponse<{ plans: any[]; intervals: number[] }>>)
      .catch(() => ({ api_status: '503', errors: { error_id: '503', error_text: 'unavailable' } }) as LicResponse<any>)
  },

  issueLicense(tenantId: string, planCode: string, intervalMonths?: number) {
    return call('/api/v1/office-license/issue', {
      tenant_id: tenantId,
      plan_code: planCode,
      interval_months: intervalMonths,
    })
  },

  validate(licenseKey: string, usage: { employees?: number; students?: number; storage_gb?: number }) {
    return call('/api/v1/office-license/validate', { license_key: licenseKey, ...usage })
  },

  startTrial(tenantId: string, fingerprint: string, opts: { user_id?: string; msisdn?: string } = {}) {
    return call('/api/v1/office-license/trial', { tenant_id: tenantId, fingerprint, ...opts })
  },

  renew(licenseKey: string, intervalMonths: number, planCode?: string) {
    return call('/api/v1/office-license/renew', {
      license_key: licenseKey,
      interval_months: intervalMonths,
      plan_code: planCode,
    })
  },

  licenseStatus(tenantId: string) {
    return call('/api/v1/office-license/status', { tenant_id: tenantId })
  },

  fee(amount: number) {
    return call('/api/v1/jpesa-payments/fee', { amount })
  },

  initiatePayment(params: {
    tenant_id: string
    user_id?: string
    amount: number
    msisdn: string
    plan_code?: string
    interval_months?: number
    purpose?: string
    description?: string
  }) {
    return call('/api/v1/jpesa-payments/initiate', params)
  },

  paymentStatus(params: { payment_id?: string; merchant_ref?: string }) {
    return call('/api/v1/jpesa-payments/status', params)
  },

  paymentHistory(tenantId: string, limit = 20) {
    return call('/api/v1/jpesa-payments/history', { tenant_id: tenantId, limit })
  },

  ssoJackisa(accessToken: string) {
    return call('/api/v1/auth/jackisa', { access_token: accessToken })
  },

  ssoExchange(ssoToken: string) {
    return call('/api/v1/auth/sso-exchange', { sso_token: ssoToken })
  },

  incomeTax(params: {
    tenant_id: string
    gross_income: number
    allowable_expenses: number
    vat_input?: number
    vat_output?: number
    period_start?: string
    period_end?: string
  }) {
    return call('/api/v1/reports/income-tax', params)
  },

  fundNav(params: {
    tenant_id: string
    total_assets: number
    total_liabilities: number
    units_outstanding: number
    as_of?: string
  }) {
    return call('/api/v1/reports/fund-nav', params)
  },

  dividends(params: {
    tenant_id: string
    total_amount: number
    basis?: 'units' | 'equal'
    run_date?: string
    holders: { user_id: string; units?: number; name?: string }[]
  }) {
    return call('/api/v1/reports/dividends', params)
  },

  pdf(params: { html: string; to?: string; subject?: string; filename?: string; channel?: 'email' | 'whatsapp' | 'none' }) {
    return call('/api/v1/reports/pdf', params)
  },

  kycVerify(params: { subject_type: 'user' | 'tenant'; subject_id: string; document_type?: string; document_ref?: string; notes?: string }) {
    return call('/api/v1/kyc/verify', params)
  },

  kycAuto(params: { user_id: string; verified: boolean }) {
    return call('/api/v1/kyc/auto', params)
  },

  sendMail(params: { to: string | string[]; subject: string; html: string; template?: string; raw?: boolean }) {
    return call('/api/v1/mail/send', params)
  },

  sendWhatsApp(params: { to: string; body: string; template?: string; media?: any }) {
    return call('/api/v1/whapi/send', params)
  },

  otpIssue(identifier: string, channel: 'email' | 'sms' | 'whatsapp' = 'email', purpose = 'login') {
    return call('/api/v1/otp/issue', { identifier, channel, purpose })
  },

  otpVerify(identifier: string, code: string, purpose = 'login') {
    return call('/api/v1/otp/verify', { identifier, code, purpose })
  },

  syncPush(entities: Array<{ type: string; data: Record<string, any> }>) {
    return call('/api/v1/sync/push', { entities })
  },

  syncPull(since?: string) {
    return call('/api/v1/sync/pull', { since })
  },

  health() {
    return fetch(`${BASE_URL}/api/v1/health`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<LicResponse<any>>)
      .catch(() => ({ api_status: '503' }) as LicResponse<any>)
  },
}
