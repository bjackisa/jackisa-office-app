import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { lic } from '@/lib/lic/client'
import { requireMember } from '@/lib/lic/serverAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RELWORX_ACCOUNT_NO = process.env.RELWORX_ACCOUNT_NO || process.env.NEXT_PUBLIC_RELWORX_ACCOUNT_NO
const RELWORX_API_KEY = process.env.RELWORX_API_KEY

/** Map a licence-hub (JPesa) payment status onto the office payment status. */
function mapJpesaStatus(status: string): string {
  switch (String(status || '').toLowerCase()) {
    case 'paid': return 'success'
    case 'failed': return 'failed'
    case 'cancelled': return 'cancelled'
    case 'expired': return 'timed_out'
    case 'processing': return 'processing'
    default: return 'pending'
  }
}

export async function GET(req: NextRequest) {
  const paymentId = req.nextUrl.searchParams.get('payment_id')
  if (!paymentId) {
    return NextResponse.json({ error: 'payment_id required' }, { status: 400 })
  }

  const { data: payment } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .single()

  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  // Only a member of the company that owns the payment may read or advance it.
  const guard = await requireMember(req, payment.company_id)
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status })

  // Already final
  if (['success', 'failed', 'timed_out', 'cancelled', 'refunded'].includes(payment.status)) {
    return NextResponse.json({
      status: payment.status,
      message: payment.status_message || payment.status,
      completed_at: payment.completed_at,
      customer_reference: payment.customer_reference,
      net_amount: payment.net_amount,
    })
  }

  const meta = (payment.metadata || {}) as Record<string, any>

  // ── JPesa payouts (money out): ask the hub to reconcile the debit ──
  if (meta.rail === 'payout' || payment.direction === 'disbursement') {
    const res = await lic.payoutStatus({
      payout_id: meta.payout_id || undefined,
      payment_id: meta.lic_payment_id || undefined,
    })
    const data = res.data || {}
    const mapped = res.api_status === '200' ? mapJpesaStatus(data.status) : 'processing'

    if (mapped !== payment.status) {
      await supabaseAdmin
        .from('payments')
        .update({
          status: mapped,
          status_message: data.provider_message || mapped,
          completed_at: mapped === 'success' ? (data.completed_at || new Date().toISOString()) : payment.completed_at,
          failure_reason: mapped === 'failed' ? (data.provider_message || 'Payout failed') : null,
        })
        .eq('id', paymentId)
    }

    return NextResponse.json({
      status: mapped,
      message: mapped === 'success' ? 'Payout confirmed' : (data.provider_message || 'Waiting for payout confirmation...'),
      completed_at: data.completed_at,
      provider_tid: data.provider_tid,
    })
  }

  // ── JPesa collections: ask the licence hub to reconcile ──
  if (meta.provider === 'jpesa' || meta.lic_payment_id || meta.merchant_ref) {
    const res = await lic.paymentStatus({
      payment_id: meta.lic_payment_id || undefined,
      merchant_ref: meta.merchant_ref || undefined,
    })
    const data = res.data || {}
    const mapped = res.api_status === '200' ? mapJpesaStatus(data.status) : 'processing'

    if (mapped !== payment.status) {
      await supabaseAdmin
        .from('payments')
        .update({
          status: mapped,
          status_message: data.provider_status || mapped,
          completed_at: mapped === 'success' ? (data.completed_at || new Date().toISOString()) : payment.completed_at,
          failure_reason: mapped === 'failed' ? (data.provider_status || 'Payment failed') : null,
        })
        .eq('id', paymentId)
    }

    return NextResponse.json({
      status: mapped,
      message: mapped === 'success' ? 'Payment confirmed' : (data.provider_status || 'Waiting for payment confirmation...'),
      completed_at: data.completed_at,
      charged: data.charged,
      fee: data.fee,
    })
  }

  // Cash / internal are always instant
  if (payment.payment_method === 'cash' || payment.payment_method === 'internal_transfer') {
    return NextResponse.json({ status: payment.status, message: 'Completed' })
  }

  // Poll Relworx for mobile money / card
  if (payment.relworx_internal_ref) {
    const accountNo = RELWORX_ACCOUNT_NO
    const apiKey = RELWORX_API_KEY

    if (accountNo && apiKey) {
      try {
        const url = `https://payments.relworx.com/api/mobile-money/check-request-status?internal_reference=${encodeURIComponent(payment.relworx_internal_ref)}&account_no=${encodeURIComponent(accountNo)}`
        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/vnd.relworx.v2',
          },
        })
        const data = await res.json()

        if (data.status === 'success') {
          await supabaseAdmin.from('payments').update({
            status: 'success',
            customer_reference: data.customer_reference,
            provider_tx_id: data.provider_transaction_id,
            relworx_charge: data.charge || 0,
            net_amount: (payment.gross_amount || 0) - (data.charge || 0),
            completed_at: data.completed_at || new Date().toISOString(),
            status_message: 'Payment confirmed',
          }).eq('id', paymentId)

          return NextResponse.json({
            status: 'success',
            message: 'Payment confirmed',
            completed_at: data.completed_at,
            customer_reference: data.customer_reference,
            net_amount: (payment.gross_amount || 0) - (data.charge || 0),
            relworx_charge: data.charge || 0,
          })
        }

        if (data.status === 'failed') {
          await supabaseAdmin.from('payments').update({
            status: 'failed',
            failure_reason: 'Payment declined or failed',
          }).eq('id', paymentId)

          return NextResponse.json({ status: 'failed', message: 'Payment was declined or failed' })
        }
      } catch (err) {
        console.error('Relworx status check error:', err)
      }
    }
  }

  // Timeout check (10 minutes)
  const initiated = new Date(payment.initiated_at).getTime()
  if (Date.now() - initiated > 10 * 60 * 1000) {
    await supabaseAdmin.from('payments').update({
      status: 'timed_out',
      failure_reason: 'Payment timed out',
    }).eq('id', paymentId)
    return NextResponse.json({ status: 'timed_out', message: 'Payment timed out. Please try again.' })
  }

  return NextResponse.json({ status: 'processing', message: 'Waiting for payment confirmation...' })
}
