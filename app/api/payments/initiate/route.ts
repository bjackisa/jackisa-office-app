import { NextRequest, NextResponse } from 'next/server'
import { initiatePayment } from '@/lib/payment-gateway'
import { collectViaJpesa } from '@/lib/lic/collections'
import { payoutViaJpesa } from '@/lib/lic/payouts'
import { getCaller, requireMember } from '@/lib/lic/serverAuth'
import { hitIp } from '@/lib/security/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/payments/initiate
 *
 * Direction-aware entry point for every payment in the app:
 *   * direction = 'collection'  -> JPesa only (lic /api/v1/jpesa-payments). No
 *     other rail is offered for money coming in, so subscription, invoice,
 *     sales, unit-trust and fee collections all settle through JPesa.
 *   * direction = 'disbursement' -> the JPesa payout rail (lic
 *     /api/v1/jpesa-payments/payout). Salaries, vendor payments and refunds all
 *     leave the company account through the hub, which verifies every debit
 *     with JPesa before it settles.
 */
export async function POST(req: NextRequest) {
  const limited = hitIp(req, 'payments-initiate', { windowSeconds: 60, max: 60 })
  if (!limited.ok) {
    return NextResponse.json(
      { success: false, message: 'Too many payment attempts. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
    )
  }

  try {
    const body = await req.json()
    const direction = String(body?.direction || 'collection')
    const companyId = String(body?.companyId || '')
    if (!companyId) {
      return NextResponse.json({ success: false, message: 'companyId is required' }, { status: 400 })
    }

    // The caller must be a member of the company they are moving money for;
    // never trust `initiatedBy` from the body.
    const guard = await requireMember(req, companyId)
    if ('error' in guard) {
      return NextResponse.json({ success: false, message: guard.error }, { status: guard.status })
    }
    const caller = guard.caller

    if (direction === 'collection') {
      const result = await collectViaJpesa({
        companyId,
        userId: caller.id,
        module: String(body?.module || 'other'),
        moduleReferenceId: body?.moduleReferenceId,
        moduleReferenceType: body?.moduleReferenceType,
        amount: Number(body?.amount || 0),
        msisdn: String(body?.msisdn || ''),
        currency: body?.currency,
        description: body?.description,
        metadata: body?.metadata,
        planCode: body?.planCode,
        intervalMonths: body?.intervalMonths,
        purpose: body?.purpose,
      })
      return NextResponse.json(
        {
          success: result.success,
          paymentId: result.paymentId,
          ourReference: result.merchantRef,
          merchantRef: result.merchantRef,
          status: result.status,
          message: result.message,
          charged: result.charged,
          fee: result.fee,
          provider: 'jpesa',
        },
        { status: result.success ? 200 : 400 }
      )
    }

    // Disbursements: money out. Cash / internal transfers are recorded locally;
    // every mobile-money payout leaves through the JPesa debit rail.
    const method = String(body?.paymentMethod || 'jackisa_pay')
    if (method === 'cash' || method === 'internal_transfer') {
      const result = await initiatePayment(body)
      return NextResponse.json(result, { status: result.success ? 200 : 400 })
    }

    const result = await payoutViaJpesa({
      companyId,
      userId: caller.id,
      module: String(body?.module || 'payroll'),
      moduleReferenceId: body?.moduleReferenceId,
      moduleReferenceType: body?.moduleReferenceType,
      amount: Number(body?.amount || 0),
      msisdn: String(body?.msisdn || body?.recipientPhone || ''),
      currency: body?.currency,
      description: body?.description,
      payee: body?.payee || body?.metadata,
      payeeType: body?.payeeType,
      idempotencyKey: body?.idempotencyKey,
      metadata: body?.metadata,
    })
    return NextResponse.json(
      {
        success: result.success,
        paymentId: result.paymentId,
        payoutId: result.payoutId,
        ourReference: result.merchantRef,
        merchantRef: result.merchantRef,
        status: result.status,
        message: result.message,
        provider: 'jpesa',
        direction: 'disbursement',
      },
      { status: result.success ? 200 : 400 }
    )
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Failed to initiate payment' },
      { status: 500 }
    )
  }
}
