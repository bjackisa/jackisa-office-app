import { NextRequest, NextResponse } from 'next/server'
import { initiatePayment } from '@/lib/payment-gateway'
import { collectViaJpesa } from '@/lib/lic/collections'
import { getCaller } from '@/lib/lic/serverAuth'
import { hitIp } from '@/lib/security/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/payments/initiate
 *
 * Direction-aware entry point for every payment in the app:
 *   * direction = 'collection'  -> JPesa only (lic /api/v1/jpesa-payments). No
 *     other rail is offered for money coming in, so subscription, invoice,
 *     sales, unit-trust and fee collections all settle through JPesa.
 *   * direction = 'disbursement' -> the office payout rail (mobile money /
 *     cash). Payouts are a separate concern from collections.
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

    if (direction === 'collection') {
      const caller = await getCaller(req)
      const result = await collectViaJpesa({
        companyId: String(body?.companyId || ''),
        userId: caller?.id || body?.initiatedBy,
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

    // Disbursements keep the office payout rail.
    const result = await initiatePayment(body)
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Failed to initiate payment' },
      { status: 500 }
    )
  }
}
