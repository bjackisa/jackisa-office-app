/**
 * Jackisa Office — Centralised Payment Gateway Service
 * All payments flow through this single layer.
 * Supports: Relworx (MTN MoMo, Airtel, Visa/MC) + Cash + Jackisa Pay
 */

import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────

export type PaymentDirection = 'collection' | 'disbursement'
export type PaymentMethodType =
  | 'cash' | 'mtn_mobile_money' | 'airtel_money'
  | 'visa_mastercard' | 'bank_transfer' | 'jackisa_pay' | 'internal_transfer'

export type PaymentModule =
  | 'invoicing' | 'sales' | 'payroll' | 'investment' | 'expenses'
  | 'commissions' | 'procurement' | 'subscription' | 'petty_cash'
  | 'reimbursement' | 'statutory' | 'inter_company' | 'club_investment'
  | 'profit_distribution' | 'refund' | 'other'

export type PaymentStatus = 'pending' | 'processing' | 'success' | 'failed' | 'timed_out' | 'cancelled' | 'refunded'

export interface InitiatePaymentParams {
  companyId: string
  module: PaymentModule
  moduleReferenceId?: string
  moduleReferenceType?: string
  direction: PaymentDirection
  paymentMethod: PaymentMethodType
  msisdn?: string
  currency?: string
  amount: number
  description?: string
  metadata?: Record<string, any>
  initiatedBy?: string
  cashTendered?: number
  cashReceivedBy?: string
  cardReturnUrl?: string
}

export interface PaymentResult {
  success: boolean
  paymentId: string
  ourReference: string
  status: PaymentStatus
  message: string
  paymentUrl?: string
  changeGiven?: number
  relworxInternalRef?: string
}

export interface RelworxConfig {
  accountNo: string
  apiKey: string
  webhookSecret?: string
}

// ─── Constants ───────────────────────────────────────────────

const RELWORX_BASE = 'https://payments.relworx.com/api'
const RELWORX_HEADERS = (apiKey: string) => ({
  'Authorization': `Bearer ${apiKey}`,
  'Accept': 'application/vnd.relworx.v2',
  'Content-Type': 'application/json',
})

const RELWORX_ENV_CONFIG: RelworxConfig | null =
  process.env.RELWORX_ACCOUNT_NO && process.env.RELWORX_API_KEY
    ? {
        accountNo: process.env.RELWORX_ACCOUNT_NO,
        apiKey: process.env.RELWORX_API_KEY,
        webhookSecret: process.env.RELWORX_WEBHOOK_SECRET,
      }
    : process.env.NEXT_PUBLIC_RELWORX_ACCOUNT_NO && process.env.RELWORX_API_KEY
      ? {
          accountNo: process.env.NEXT_PUBLIC_RELWORX_ACCOUNT_NO,
          apiKey: process.env.RELWORX_API_KEY,
          webhookSecret: process.env.RELWORX_WEBHOOK_SECRET,
        }
      : null

// ─── Helpers ─────────────────────────────────────────────────

function generateRef(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function formatMsisdn(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, '')
  if (cleaned.startsWith('07') && cleaned.length === 10) cleaned = '+256' + cleaned.substring(1)
  if (cleaned.startsWith('256') && !cleaned.startsWith('+')) cleaned = '+' + cleaned
  return cleaned
}

function validateAmount(amount: number, currency: string, method: PaymentMethodType): string | null {
  const isCard = method === 'visa_mastercard'
  const limits: Record<string, [number, number]> = {
    UGX_mobile: [500, 5_000_000], UGX_card: [2000, 5_000_000],
    KES_mobile: [10, 70_000], TZS_mobile: [500, 5_000_000], RWF_mobile: [100, 5_000_000],
  }
  const key = `${currency}_${isCard ? 'card' : 'mobile'}`
  const lim = limits[key]
  if (!lim) return null
  if (amount < lim[0]) return `Minimum is ${currency} ${lim[0].toLocaleString()}`
  if (amount > lim[1]) return `Maximum is ${currency} ${lim[1].toLocaleString()}`
  return null
}

// ─── Gateway Config ──────────────────────────────────────────

export async function getGatewayConfig(companyId: string): Promise<RelworxConfig | null> {
  void companyId
  return RELWORX_ENV_CONFIG
}

// ─── API Call Logger ─────────────────────────────────────────

async function logApi(p: {
  paymentId?: string; companyId?: string; direction: string
  endpoint: string; method: string; reqBody?: any
  resStatus?: number; resBody?: any; error?: string; ms?: number
}) {
  try {
    await supabase.from('payment_gateway_log').insert({
      payment_id: p.paymentId, company_id: p.companyId,
      direction: p.direction, endpoint: p.endpoint, http_method: p.method,
      request_body: p.reqBody, response_status: p.resStatus,
      response_body: p.resBody, error_message: p.error, latency_ms: p.ms,
    })
  } catch (e) { console.error('Log fail:', e) }
}

// ─── Relworx API Wrappers ────────────────────────────────────

async function callRelworx(config: RelworxConfig, endpoint: string, method: string, body?: any) {
  const start = Date.now()
  try {
    const url = method === 'GET' ? `${RELWORX_BASE}${endpoint}` : `${RELWORX_BASE}${endpoint}`
    const opts: RequestInit = { method, headers: RELWORX_HEADERS(config.apiKey) }
    if (body && method === 'POST') opts.body = JSON.stringify(body)
    const res = await fetch(url, opts)
    const data = await res.json()
    await logApi({ direction: 'outbound', endpoint, method, reqBody: body ? { ...body, account_no: '***' } : undefined, resStatus: res.status, resBody: data, ms: Date.now() - start })
    return { ...data, _httpStatus: res.status }
  } catch (err: any) {
    await logApi({ direction: 'outbound', endpoint, method, error: err.message, ms: Date.now() - start })
    return { success: false, message: err.message }
  }
}

export async function relworxCheckStatus(config: RelworxConfig, internalRef: string) {
  return callRelworx(config, `/mobile-money/check-request-status?internal_reference=${encodeURIComponent(internalRef)}&account_no=${encodeURIComponent(config.accountNo)}`, 'GET')
}

export async function relworxValidateNumber(config: RelworxConfig, msisdn: string) {
  return callRelworx(config, `/mobile-money/validate-number?msisdn=${encodeURIComponent(msisdn)}&account_no=${encodeURIComponent(config.accountNo)}`, 'GET')
}

export async function relworxWalletBalance(config: RelworxConfig, currency = 'UGX') {
  return callRelworx(config, `/mobile-money/wallet-balance?account_no=${encodeURIComponent(config.accountNo)}&currency=${currency}`, 'GET')
}

// ─── MAIN: Initiate Payment ─────────────────────────────────

export async function initiatePayment(params: InitiatePaymentParams): Promise<PaymentResult> {
  const ourReference = generateRef()
  const currency = params.currency || 'UGX'

  // Validate amount for Relworx methods
  if (params.paymentMethod !== 'cash' && params.paymentMethod !== 'internal_transfer') {
    const err = validateAmount(params.amount, currency, params.paymentMethod)
    if (err) return { success: false, paymentId: '', ourReference, status: 'failed', message: err }
  }

  // Create payment record
  const { data: payment, error: insertErr } = await supabase.from('payments').insert({
    company_id: params.companyId, module: params.module,
    module_reference_id: params.moduleReferenceId, module_reference_type: params.moduleReferenceType,
    direction: params.direction, payment_method: params.paymentMethod,
    msisdn: params.msisdn ? formatMsisdn(params.msisdn) : null,
    currency, gross_amount: params.amount, net_amount: params.amount,
    our_reference: ourReference, status: 'pending',
    description: params.description, metadata: params.metadata || {},
    initiated_by: params.initiatedBy, card_return_url: params.cardReturnUrl,
  }).select('id').single()

  if (insertErr || !payment) {
    return { success: false, paymentId: '', ourReference, status: 'failed', message: 'Failed to create payment record' }
  }
  const paymentId = payment.id

  // ── CASH ──
  if (params.paymentMethod === 'cash') {
    const change = Math.max(0, (params.cashTendered || params.amount) - params.amount)
    await supabase.from('payments').update({ status: 'success', completed_at: new Date().toISOString() }).eq('id', paymentId)
    await supabase.from('cash_payments').insert({
      payment_id: paymentId, received_by: params.cashReceivedBy || params.initiatedBy,
      cash_tendered: params.cashTendered || params.amount, change_given: change,
    })
    return { success: true, paymentId, ourReference, status: 'success', message: 'Cash payment recorded', changeGiven: change }
  }

  // ── MOBILE MONEY (Jackisa Pay / MTN / Airtel) ──
  if (['jackisa_pay', 'mtn_mobile_money', 'airtel_money'].includes(params.paymentMethod)) {
    if (!params.msisdn) {
      await supabase.from('payments').update({ status: 'failed', failure_reason: 'Phone number required' }).eq('id', paymentId)
      return { success: false, paymentId, ourReference, status: 'failed', message: 'Phone number required for mobile money' }
    }
    const config = await getGatewayConfig(params.companyId)
    if (!config) {
      await supabase.from('payments').update({ status: 'failed', failure_reason: 'Gateway not configured' }).eq('id', paymentId)
      return { success: false, paymentId, ourReference, status: 'failed', message: 'Payment gateway not configured. Add Relworx API credentials.' }
    }

    await supabase.from('payments').update({ relworx_account_no: config.accountNo, status: 'processing' }).eq('id', paymentId)

    const apiParams = { account_no: config.accountNo, reference: ourReference, msisdn: formatMsisdn(params.msisdn), currency, amount: params.amount, description: params.description || '' }
    const endpoint = params.direction === 'collection' ? '/mobile-money/request-payment' : '/mobile-money/send-payment'
    const result = await callRelworx(config, endpoint, 'POST', apiParams)

    if (result.success && result.internal_reference) {
      await supabase.from('payments').update({ relworx_internal_ref: result.internal_reference, status: 'processing', status_message: result.message }).eq('id', paymentId)
      return { success: true, paymentId, ourReference, status: 'processing', message: params.direction === 'collection' ? 'Payment prompt sent. Waiting for approval.' : 'Disbursement submitted.', relworxInternalRef: result.internal_reference }
    } else {
      await supabase.from('payments').update({ status: 'failed', failure_reason: result.message }).eq('id', paymentId)
      return { success: false, paymentId, ourReference, status: 'failed', message: result.message || 'Payment request failed' }
    }
  }

  // ── VISA / MASTERCARD ──
  if (params.paymentMethod === 'visa_mastercard') {
    const config = await getGatewayConfig(params.companyId)
    if (!config) {
      await supabase.from('payments').update({ status: 'failed', failure_reason: 'Gateway not configured' }).eq('id', paymentId)
      return { success: false, paymentId, ourReference, status: 'failed', message: 'Payment gateway not configured' }
    }
    await supabase.from('payments').update({ relworx_account_no: config.accountNo, status: 'processing' }).eq('id', paymentId)
    const result = await callRelworx(config, '/visa/request-session', 'POST', { account_no: config.accountNo, reference: ourReference, currency, amount: params.amount, description: params.description || '' })
    if (result.success && result.payment_url) {
      await supabase.from('payments').update({ card_payment_url: result.payment_url, status: 'processing' }).eq('id', paymentId)
      return { success: true, paymentId, ourReference, status: 'processing', message: 'Redirecting to card payment page.', paymentUrl: result.payment_url }
    } else {
      await supabase.from('payments').update({ status: 'failed', failure_reason: result.message }).eq('id', paymentId)
      return { success: false, paymentId, ourReference, status: 'failed', message: result.message || 'Card session failed' }
    }
  }

  // ── INTERNAL TRANSFER ──
  if (params.paymentMethod === 'internal_transfer') {
    await supabase.from('payments').update({ status: 'success', completed_at: new Date().toISOString() }).eq('id', paymentId)
    return { success: true, paymentId, ourReference, status: 'success', message: 'Internal transfer recorded' }
  }

  return { success: false, paymentId, ourReference, status: 'failed', message: 'Unsupported payment method' }
}

// ─── Check Payment Status ────────────────────────────────────

export async function checkPaymentStatus(paymentId: string): Promise<{ status: PaymentStatus; message: string; completedAt?: string; customerReference?: string }> {
  const { data: p } = await supabase.from('payments').select('*').eq('id', paymentId).single()
  if (!p) return { status: 'failed', message: 'Payment not found' }

  if (['success', 'failed', 'timed_out', 'cancelled', 'refunded'].includes(p.status)) {
    return { status: p.status, message: p.status_message || p.status, completedAt: p.completed_at, customerReference: p.customer_reference }
  }

  if (p.payment_method === 'cash' || p.payment_method === 'internal_transfer') {
    return { status: p.status, message: 'Completed' }
  }

  // Poll Relworx
  if (p.relworx_internal_ref) {
    const config = await getGatewayConfig(p.company_id)
    if (!config) return { status: 'processing', message: 'Checking...' }

    const result = await relworxCheckStatus(config, p.relworx_internal_ref)
    if (result.status === 'success') {
      await supabase.from('payments').update({
        status: 'success', customer_reference: result.customer_reference,
        provider_tx_id: result.provider_transaction_id, relworx_charge: result.charge || 0,
        net_amount: (p.gross_amount || 0) - (result.charge || 0),
        completed_at: result.completed_at || new Date().toISOString(),
        status_message: 'Payment confirmed',
      }).eq('id', paymentId)
      return { status: 'success', message: 'Payment confirmed', completedAt: result.completed_at, customerReference: result.customer_reference }
    }
    if (result.status === 'failed') {
      await supabase.from('payments').update({ status: 'failed', failure_reason: 'Payment declined or failed' }).eq('id', paymentId)
      return { status: 'failed', message: 'Payment was declined or failed' }
    }
  }

  // Check timeout (10 minutes)
  const initiated = new Date(p.initiated_at).getTime()
  if (Date.now() - initiated > 10 * 60 * 1000) {
    await supabase.from('payments').update({ status: 'timed_out', failure_reason: 'Payment timed out' }).eq('id', paymentId)
    return { status: 'timed_out', message: 'Payment timed out. Please try again.' }
  }

  return { status: 'processing', message: 'Waiting for payment confirmation...' }
}

// ─── Format helpers ──────────────────────────────────────────

export function formatPaymentMethod(m: PaymentMethodType): string {
  const map: Record<string, string> = {
    cash: 'Cash', mtn_mobile_money: 'MTN Mobile Money', airtel_money: 'Airtel Money',
    visa_mastercard: 'Visa / Mastercard', bank_transfer: 'Bank Transfer',
    jackisa_pay: 'Jackisa Pay', internal_transfer: 'Internal Transfer',
  }
  return map[m] || m
}
