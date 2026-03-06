import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
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
