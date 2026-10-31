/**
 * JPesa-only collections.
 *
 * Every inbound payment in Jackisa Office — licence/subscription, invoice and
 * sales collections, unit-trust subscriptions, student fees, top-ups — is
 * collected by JPesa. The office never holds provider credentials and never
 * talks to a payment provider directly; it asks the licence hub
 * (lic.jackisa.com /api/v1/jpesa-payments) to start the charge, and mirrors the
 * result into the office `payments` ledger so the company account and the
 * financial documents keep working.
 *
 * Disbursements (payouts) are a separate concern and are not handled here.
 */

import { lic } from '@/lib/lic/client'
import { adminClient, adminAvailable } from '@/lib/lic/peer'

export type PaymentStatus = 'pending' | 'processing' | 'success' | 'failed' | 'timed_out' | 'cancelled' | 'refunded'

export interface CollectParams {
  companyId: string
  userId?: string
  /** Office payment module (must be a valid payment_module enum value). */
  module: string
  moduleReferenceId?: string
  moduleReferenceType?: string
  amount: number
  msisdn: string
  currency?: string
  description?: string
  metadata?: Record<string, any>
  planCode?: string
  intervalMonths?: number
  purpose?: string
}

export interface CollectResult {
  success: boolean
  /** The office `payments` row id (what the client polls). */
  paymentId: string
  merchantRef?: string
  licPaymentId?: string
  status: PaymentStatus
  message: string
  charged?: number
  fee?: number
}

/** Map an office module to a licence-hub payment purpose. */
function purposeFor(module: string, explicit?: string): string {
  if (explicit) return explicit
  switch (module) {
    case 'invoicing':
    case 'sales':
      return 'invoice'
    case 'subscription':
      return 'subscription'
    case 'investment':
    case 'club_investment':
      return 'topup'
    default:
      return 'other'
  }
}

/**
 * Start a JPesa collection and mirror it into the office ledger.
 * Returns a `paymentId` (the office row) the client polls via /api/payments/status.
 */
export async function collectViaJpesa(params: CollectParams): Promise<CollectResult> {
  const amount = Number(params.amount || 0)
  if (!(amount > 0)) {
    return { success: false, paymentId: '', status: 'failed', message: 'Enter a valid amount.' }
  }
  if (!params.msisdn || params.msisdn.replace(/\D/g, '').length < 9) {
    return { success: false, paymentId: '', status: 'failed', message: 'A mobile money number is required.' }
  }

  // Gross-up preview so the customer knows exactly what they will be charged.
  let charged = amount
  let fee = 0
  const feeRes = await lic.fee(amount)
  if (feeRes.api_status === '200' && feeRes.data) {
    charged = Number(feeRes.data.charged ?? amount)
    fee = Number(feeRes.data.fee ?? 0)
  }

  const res = await lic.initiatePayment({
    tenant_id: params.companyId,
    user_id: params.userId,
    amount,
    msisdn: params.msisdn,
    plan_code: params.planCode,
    interval_months: params.intervalMonths,
    purpose: purposeFor(params.module, params.purpose),
    description: params.description || 'Jackisa Office collection',
  })

  const data = res.data || {}
  const providerOk = res.api_status === '200' && data.success !== false

  // Mirror into the office ledger so settlement, receipts and reporting work.
  let paymentId = ''
  if (adminAvailable()) {
    try {
      const { data: row } = await adminClient()
        .from('payments')
        .insert({
          company_id: params.companyId,
          module: params.module,
          module_reference_id: params.moduleReferenceId || null,
          module_reference_type: params.moduleReferenceType || null,
          direction: 'collection',
          payment_method: 'jackisa_pay',
          msisdn: params.msisdn,
          currency: params.currency || data.currency || 'UGX',
          gross_amount: amount,
          net_amount: amount,
          our_reference: data.merchant_ref || null,
          status: providerOk ? 'processing' : 'failed',
          status_message: data.message || res.errors?.error_text || null,
          description: params.description,
          initiated_by: params.userId || null,
          metadata: {
            provider: 'jpesa',
            merchant_ref: data.merchant_ref || null,
            lic_payment_id: data.payment_id || null,
            charged: charged,
            fee: fee,
            ...(params.metadata || {}),
          },
        })
        .select('id')
        .single()
      paymentId = row?.id || ''
    } catch (e) {
      console.error('[collections] mirror failed', e)
    }
  }

  if (!providerOk) {
    return {
      success: false,
      paymentId,
      merchantRef: data.merchant_ref,
      licPaymentId: data.payment_id,
      status: 'failed',
      message: data.message || res.errors?.error_text || 'JPesa could not start the payment.',
      charged,
      fee,
    }
  }

  return {
    success: true,
    paymentId,
    merchantRef: data.merchant_ref,
    licPaymentId: data.payment_id,
    status: 'processing',
    message: data.message || 'Payment request sent. Approve the prompt on your phone to continue.',
    charged: Number(data.charged ?? charged),
    fee: Number(data.fee ?? fee),
  }
}
