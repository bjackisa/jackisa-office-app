import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { verifyLicSignature } from '@/lib/lic/peer'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WEBHOOK_SECRET = process.env.PAYMENTS_WEBHOOK_SECRET || ''

/**
 * Verify the caller is the payment provider (or the licence hub), not an
 * anonymous poster. A forged "success" here marks a payment paid and mints a
 * receipt, so an unsigned request is refused outright.
 */
function verifyWebhook(rawBody: string, req: NextRequest): boolean {
  const sig = req.headers.get('x-jackisa-signature') || req.headers.get('x-signature-256') || req.headers.get('x-hub-signature-256')
  if (WEBHOOK_SECRET && sig) {
    const provided = sig.replace(/^sha256=/i, '').trim()
    if (/^[0-9a-f]{64}$/i.test(provided)) {
      const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest()
      const providedBuf = Buffer.from(provided, 'hex')
      if (expected.length === providedBuf.length && crypto.timingSafeEqual(expected, providedBuf)) return true
    }
  }
  // Fall back to the licence hub's peer signature so the hub can forward a
  // provider callback on our behalf.
  return verifyLicSignature(rawBody, sig, 'office')
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    if (!verifyWebhook(rawBody, req)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    const payload = JSON.parse(rawBody || '{}')
    const {
      status, message, customer_reference, internal_reference,
      msisdn, amount, currency, provider, charge, completed_at,
    } = payload

    // 1. Log inbound webhook
    await supabaseAdmin.from('payment_gateway_log').insert({
      direction: 'inbound',
      endpoint: '/api/payments/webhook',
      http_method: 'POST',
      request_body: payload,
      response_status: 200,
    })

    if (!internal_reference) {
      return NextResponse.json({ error: 'Missing internal_reference' }, { status: 400 })
    }

    // 2. Idempotency check
    const { data: existing } = await supabaseAdmin
      .from('processed_webhooks')
      .select('id')
      .eq('relworx_internal_ref', internal_reference)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ ok: true, message: 'Already processed' })
    }

    // 3. Find the payment by relworx_internal_ref
    const { data: payment } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('relworx_internal_ref', internal_reference)
      .maybeSingle()

    if (!payment) {
      // Try matching by our_reference in case internal_ref wasn't stored yet
      const { data: paymentByRef } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('our_reference', customer_reference)
        .maybeSingle()

      if (!paymentByRef) {
        // Orphan transaction — log as exception
        await supabaseAdmin.from('processed_webhooks').insert({
          relworx_internal_ref: internal_reference,
          status: 'orphan',
          raw_payload: payload,
        })
        return NextResponse.json({ ok: true, message: 'Orphan webhook logged' })
      }
    }

    const pmnt = payment!
    const finalStatus = status === 'success' ? 'success' : 'failed'

    // 4. Update payment record
    await supabaseAdmin.from('payments').update({
      status: finalStatus,
      customer_reference: customer_reference || null,
      relworx_charge: charge || 0,
      net_amount: (pmnt.gross_amount || 0) - (charge || 0),
      completed_at: completed_at || new Date().toISOString(),
      webhook_received_at: new Date().toISOString(),
      status_message: message || finalStatus,
      failure_reason: finalStatus === 'failed' ? (message || 'Payment failed') : null,
    }).eq('id', pmnt.id)

    // 5. Record processed webhook
    await supabaseAdmin.from('processed_webhooks').insert({
      relworx_internal_ref: internal_reference,
      payment_id: pmnt.id,
      status: finalStatus,
      raw_payload: payload,
    })

    // 6. Generate financial document on success
    if (finalStatus === 'success') {
      const docType = pmnt.direction === 'collection' ? 'receipt' : 'payment_voucher'
      await supabaseAdmin.rpc('generate_payment_document', {
        p_payment_id: pmnt.id,
        p_doc_type: docType,
      })

      // 7. Log ecosystem event
      await supabaseAdmin.from('ecosystem_events').insert({
        company_id: pmnt.company_id,
        event_type: pmnt.direction === 'collection' ? 'payment_collected' : 'payment_disbursed',
        source_table: 'payments',
        source_id: pmnt.id,
        payload: {
          module: pmnt.module,
          amount: pmnt.gross_amount,
          currency: pmnt.currency,
          method: pmnt.payment_method,
          provider,
          relworx_ref: internal_reference,
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
