/**
 * JPesa payouts (money OUT).
 *
 * Salaries, vendor payments and refunds leave the company account through the
 * licence hub's JPesa debit rail (lic.jackisa.com /api/v1/jpesa-payments/payout).
 * The hub holds the provider credentials and verifies every debit with JPesa
 * before it settles, so the office never trusts a callback on its own.
 *
 * A payout is idempotent on the hub: one payslip can never be paid twice, even
 * if the client retries. The office mirrors the payout into its `payments`
 * ledger so reconciliation and receipts keep working.
 */

import { lic } from '@/lib/lic/client'
import { adminClient, adminAvailable } from '@/lib/lic/peer'

export type PaymentStatus = 'pending' | 'processing' | 'success' | 'failed' | 'timed_out' | 'cancelled' | 'refunded'

export interface PayoutParams {
  companyId: string
  userId?: string
  /** Office module (payment_module enum value), e.g. 'payroll'. */
  module: string
  moduleReferenceId?: string
  moduleReferenceType?: string
  amount: number
  msisdn: string
  currency?: string
  description?: string
  payee?: Record<string, any>
  payeeType?: 'employee' | 'vendor' | 'refund' | 'other'
  idempotencyKey?: string
  metadata?: Record<string, any>
}

export interface PayoutResult {
  success: boolean
  /** Office `payments` row id the client polls. */
  paymentId: string
  payoutId?: string
  merchantRef?: string
  status: PaymentStatus
  message: string
}

/**
 * Start a JPesa payout and mirror it into the office ledger.
 * Returns the office `paymentId` the client polls via /api/payments/status.
 */
export async function payoutViaJpesa(params: PayoutParams): Promise<PayoutResult> {
  const amount = Number(params.amount || 0)
  if (!(amount > 0)) {
    return { success: false, paymentId: '', status: 'failed', message: 'Enter a valid amount.' }
  }
  if (!params.msisdn || params.msisdn.replace(/\D/g, '').length < 9) {
    return { success: false, paymentId: '', status: 'failed', message: 'A mobile money number is required for the recipient.' }
  }

  // Idempotency key is derived from the payslip/record so a retry cannot double-pay.
  const idempotencyKey = params.idempotencyKey
    || `${params.module}:${params.moduleReferenceId || 'na'}`

  const res = await lic.payout({
    tenant_id: params.companyId,
    user_id: params.userId,
    amount,
    msisdn: params.msisdn,
    module: params.module,
    module_ref_id: params.moduleReferenceId,
    payee_type: params.payeeType || 'employee',
    payee: params.payee,
    idempotency_key: idempotencyKey,
    description: params.description || 'Jackisa Office payout',
  })

  const data = res.data || {}
  const providerOk = res.api_status === '200' && data.success !== false

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
          direction: 'disbursement',
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
            rail: 'payout',
            payout_id: data.payout_id || null,
            merchant_ref: data.merchant_ref || null,
            lic_payment_id: data.payment_id || null,
            payee: params.payee || null,
            ...(params.metadata || {}),
          },
        })
        .select('id')
        .single()
      paymentId = row?.id || ''
    } catch (e) {
      console.error('[payouts] mirror failed', e)
    }
  }

  if (!providerOk) {
    return {
      success: false,
      paymentId,
      payoutId: data.payout_id,
      merchantRef: data.merchant_ref,
      status: 'failed',
      message: data.message || res.errors?.error_text || 'JPesa could not start the payout.',
    }
  }

  return {
    success: true,
    paymentId,
    payoutId: data.payout_id,
    merchantRef: data.merchant_ref,
    status: 'processing',
    message: data.message || 'Payout submitted. The recipient will receive it once JPesa confirms.',
  }
}
