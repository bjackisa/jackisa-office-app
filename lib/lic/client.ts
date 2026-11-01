/**
 * Jackisa License Hub client (server-side only).
 *
 * Signs every request with the shared office secret so lic.jackisa.com knows
 * the call is genuinely from office.jackisa.com. Never import this into a
 * client component — the secret must stay on the server.
 */

import crypto from 'crypto'

const BASE_URL = (process.env.LIC_API_URL || process.env.LIC_API_BASE || 'https://lic.jackisa.com').replace(/\/$/, '')
const SHARED_SECRET = process.env.LIC_OFFICE_SECRET || process.env.LIC_API_KEY || ''
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
  // Never sign with an empty secret: an empty-key HMAC is a silent
  // misconfiguration that the hub will reject, so fail fast and loudly instead.
  if (!SHARED_SECRET) {
    return {
      api_status: '500',
      errors: {
        error_id: 'config',
        error_text: 'Licence service is not configured (LIC_OFFICE_SECRET is unset)',
      },
    }
  }
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

  /** True when the ops catalogue credentials are present (super-admin console). */
  adminConfigured(): boolean {
    return Boolean(process.env.LIC_ADMIN_KEY_ID && process.env.LIC_ADMIN_KEY_SECRET)
  },

  /**
   * Call an /api/v1/admin/* endpoint with the ops API key. Kept separate from
   * `call()` because the hub authenticates these with X-Api-Key/X-Api-Secret
   * rather than the office peer signature.
   */
  adminCall<T = any>(path: string, body: Record<string, any> = {}): Promise<LicResponse<T>> {
    const keyId = process.env.LIC_ADMIN_KEY_ID || ''
    const secret = process.env.LIC_ADMIN_KEY_SECRET || ''
    if (!keyId || !secret) {
      return Promise.resolve({
        api_status: '500',
        errors: { error_id: 'config', error_text: 'Catalogue console is not configured (admin key unset)' },
      } as LicResponse<T>)
    }
    return fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': keyId,
        'X-Api-Secret': secret,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
      .then((r) => r.json() as Promise<LicResponse<T>>)
      .catch((err: any) => ({ api_status: '503', errors: { error_id: '503', error_text: err?.message || 'unavailable' } }) as LicResponse<T>)
  },

  catalogPlans(action: 'list' | 'create' | 'update' | 'deactivate', payload: Record<string, any> = {}) {
    return lic.adminCall('/api/v1/admin/plans', { action, ...payload })
  },

  catalogFeatures(action: 'list' | 'create' | 'update' | 'deactivate', payload: Record<string, any> = {}) {
    return lic.adminCall('/api/v1/admin/features', { action, ...payload })
  },

  /** Coupon management (super-admin console). */
  catalogCoupons(action: 'list' | 'get' | 'create' | 'update' | 'archive' | 'redemptions', payload: Record<string, any> = {}) {
    return lic.adminCall('/api/v1/admin/coupons', { action, ...payload })
  },

  /** Coupons a tenant may use right now (code or auto-apply). */
  availableCoupons(tenantId: string, opts: { plan_code?: string; interval_months?: number } = {}) {
    return call('/api/v1/coupons/available', { tenant_id: tenantId, ...opts })
  },

  /** Validate a code and price a selection with it. */
  validateCoupon(params: { tenant_id: string; code: string; plan_code?: string; interval_months?: number; amount: number }) {
    return call('/api/v1/coupons/validate', params)
  },

  /** The best auto-apply coupon for a selection (or a specific code). */
  quoteCoupon(params: { tenant_id: string; code?: string; plan_code?: string; interval_months?: number; amount: number }) {
    return call('/api/v1/coupons/quote', params)
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

  startTrial(tenantId: string, fingerprint: string, opts: { user_id?: string; msisdn?: string; ip?: string; plan_code?: string } = {}) {
    return call('/api/v1/office-license/trial', { tenant_id: tenantId, fingerprint, ...opts })
  },

  cancelTrial(tenantId: string, reason?: string) {
    return call('/api/v1/office-license/trial-cancel', { tenant_id: tenantId, reason })
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

  /** Price a plan change (upgrade/downgrade/interval switch), with credit. */
  changeQuote(tenantId: string, planCode: string) {
    return call('/api/v1/office-license/change-quote', { tenant_id: tenantId, plan_code: planCode })
  },

  /** Apply a plan change after any required payment has settled. */
  changePlan(tenantId: string, planCode: string, paid = false) {
    return call('/api/v1/office-license/change', { tenant_id: tenantId, plan_code: planCode, paid: paid ? 1 : 0 })
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
    coupon_code?: string
    apply_auto_coupon?: boolean
  }) {
    return call('/api/v1/jpesa-payments/initiate', params)
  },

  paymentStatus(params: { payment_id?: string; merchant_ref?: string }) {
    return call('/api/v1/jpesa-payments/status', params)
  },

  paymentHistory(tenantId: string, limit = 20) {
    return call('/api/v1/jpesa-payments/history', { tenant_id: tenantId, limit })
  },

  /** Start a payout (money OUT: salary, vendor, refund) via the JPesa rail. */
  payout(params: {
    tenant_id: string
    user_id?: string
    amount: number
    msisdn: string
    module?: string
    module_ref_id?: string
    payee_type?: string
    payee?: Record<string, any>
    payee_name?: string
    idempotency_key?: string
    description?: string
  }) {
    return call('/api/v1/jpesa-payments/payout', params)
  },

  payoutStatus(params: { payout_id?: string; payment_id?: string }) {
    return call('/api/v1/jpesa-payments/payout-status', params)
  },

  payoutHistory(tenantId: string, limit = 20) {
    return call('/api/v1/jpesa-payments/payout-history', { tenant_id: tenantId, limit })
  },

  paymentChannels() {
    return call('/api/v1/jpesa-payments/channels', {})
  },

  ssoJackisa(accessToken: string) {
    return call('/api/v1/auth/jackisa', { access_token: accessToken })
  },
  ssoExchange(ssoToken: string) {
    return call('/api/v1/auth/sso-exchange', { sso_token: ssoToken })
  },

  // ---- Jackisa One: cross-platform benefits --------------------------------
  /** What this plan unlocks on jackisa.com. */
  jackisaBenefits(params: { tenantId?: string; email?: string }) {
    return call('/api/v1/jackisa/benefits', { tenant_id: params.tenantId, email: params.email })
  },
  /** Push a tenant's tier to jackisa.com (usually automatic on licence change). */
  jackisaSync(tenantId: string) {
    return call('/api/v1/jackisa/sync', { tenant_id: tenantId })
  },
  /** Publish an office course as a jackisa.com store product. */
  jackisaPublishCourse(params: { tenantId?: string; email?: string; title: string; description?: string; price?: string; categoryId?: number; storeName?: string }) {
    return call('/api/v1/jackisa/publish-course', {
      tenant_id: params.tenantId,
      email: params.email,
      title: params.title,
      description: params.description,
      price: params.price,
      category_id: params.categoryId,
      store_name: params.storeName,
    })
  },
  /** Schedule a live meeting on jackisa.com. */
  jackisaMeeting(params: { tenantId?: string; email?: string; title?: string; meetingId?: string }) {
    return call('/api/v1/jackisa/meeting', {
      tenant_id: params.tenantId,
      email: params.email,
      title: params.title,
      meeting_id: params.meetingId,
    })
  },
  /** Seat a team member on one of the plan's jackisa.com channels. */
  jackisaMemberChannel(params: { tenantId?: string; email?: string; memberEmail: string; memberName?: string }) {
    return call('/api/v1/jackisa/member-channel', {
      tenant_id: params.tenantId,
      email: params.email,
      member_email: params.memberEmail,
      member_name: params.memberName,
    })
  },
  /** Pull store earnings earned on jackisa.com. */
  jackisaStoreEarnings(params: { tenantId?: string; email?: string; limit?: number }) {
    return call('/api/v1/jackisa/store-earnings', { tenant_id: params.tenantId, email: params.email, limit: params.limit })
  },
  /** Mirror a verification badge onto jackisa.com. */
  jackisaVerification(params: { tenantId?: string; email?: string; badge: string; verified: boolean }) {
    return call('/api/v1/jackisa/verification', {
      tenant_id: params.tenantId,
      email: params.email,
      badge: params.badge,
      verified: params.verified,
    })
  },
  /** Turn this plan into concrete jackisa.com artifacts (storefront, badge). */
  jackisaMaterialize(tenantId: string) {
    return call('/api/v1/jackisa/materialize', { tenant_id: tenantId })
  },

  /** Ask the hub to run one scheduled job (or all of them). */
  runCron(job?: string, all = false) {
    return call('/api/v1/cron/run', all ? { all: true } : { job })
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

  /** Notify guardians of a new mark: renders a PDF and sends it over WA/email. */
  notifyMarks(params: {
    tenant_id: string
    company_name?: string
    company_phone?: string
    company_logo_url?: string
    student: { id?: string; student_no?: string; name: string; phone?: string; email?: string; guardian_phone?: string; guardian_email?: string }
    module?: { code?: string; name?: string }
    assessment: { kind?: string; day_number?: number | string; title?: string; marks_obtained?: number; max_marks?: number; grade?: string }
    standing?: Record<string, any>
    recipients?: { phones?: string[]; emails?: string[] }
  }) {
    return call('/api/v1/education/notify-marks', params)
  },

  /** Issue a full report card / transcript and deliver it. */
  transcript(params: {
    tenant_id: string
    company_name?: string
    company_phone?: string
    company_logo_url?: string
    student: { id?: string; student_no?: string; name: string; phone?: string; email?: string; guardian_phone?: string; guardian_email?: string }
    modules: Array<{ code?: string; name?: string; coursework?: number | null; exam?: number | null; total?: number | null; grade?: string }>
    summary?: Record<string, any>
    recipients?: { phones?: string[]; emails?: string[] }
  }) {
    return call('/api/v1/education/transcript', params)
  },

  /** Publish a student's contact details to the hub so documents can be sent. */
  syncStudent(params: {
    tenant_id: string
    student: { id?: string; name: string; student_no?: string; phone?: string; email?: string; guardian_name?: string; guardian_phone?: string; guardian_email?: string }
  }) {
    return call('/api/v1/sync/student', params)
  },

  sendMail(params: { to: string | string[]; subject: string; html: string; template?: string; raw?: boolean; attachment?: { filename: string; data: string; mime?: string } }) {
    return call('/api/v1/mail/send', params)
  },

  /**
   * The one rail every office module notifies through. The hub renders the
   * optional document to a PDF, stores it, and attaches it to both the email
   * and the WhatsApp message — never as a link. De-duplicated by `dedupe_key`.
   */
  notify(params: {
    tenant_id: string
    company_name?: string
    company_logo_url?: string
    event: string
    dedupe_key?: string
    subject: string
    html?: string
    text?: string
    emails?: string[]
    whatsapp?: string[]
    template?: string
    subject_type?: string
    subject_id?: string
    document?: {
      kind?: string
      title?: string
      subtitle?: string
      filename?: string
      meta?: Array<[string, string]>
      tables?: Array<{ title?: string; columns: Array<{ label: string; align?: string }>; rows: Array<Array<any>> }>
      totals?: Array<{ label: string; value: string; strong?: boolean }>
      note?: string
    }
  }) {
    return call('/api/v1/notify', params)
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
