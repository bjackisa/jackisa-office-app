import { NextRequest, NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { mirrorLicenseFromHub } from '@/lib/lic/mirror'
import { getCaller, getMembership } from '@/lib/lic/serverAuth'
import { hitIp } from '@/lib/security/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/lic/payments
 * Body: { action: 'initiate' | 'status' | 'history' | 'fee', ... }
 *
 * The office app never talks to JPesa directly — every charge is brokered by
 * lic.jackisa.com (/api/v1/jpesa-payments), which owns the provider handshake.
 * Results are mirrored into the office payments table for the local ledger.
 */
export async function POST(req: NextRequest) {
  const limited = hitIp(req, 'payments', { windowSeconds: 60, max: 30 })
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
    )
  }
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || '')
  const companyId = String(body?.companyId || '')

  try {
    switch (action) {
      case 'fee': {
        const res = await lic.fee(Number(body?.amount || 0))
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'initiate': {
        const caller = await getCaller(req)
        if (!caller) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })
        if (companyId) {
          const membership = await getMembership(caller.id, companyId)
          if (!membership?.isAdmin) return NextResponse.json({ ok: false, error: 'Only a company admin can pay for a licence' }, { status: 403 })
        }
        const res = await lic.initiatePayment({
          tenant_id: companyId,
          user_id: caller.id,
          amount: Number(body?.amount || 0),
          msisdn: String(body?.msisdn || ''),
          plan_code: body?.planCode,
          interval_months: body?.intervalMonths ? Number(body.intervalMonths) : undefined,
          purpose: body?.purpose || 'license',
          description: body?.description,
        })
        if (res.api_status === '200' && adminAvailable() && res.data?.payment_id) {
          try {
            await adminClient().from('license_payments').insert({
              company_id: companyId,
              user_id: caller.id,
              payment_id: res.data.payment_id,
              merchant_ref: res.data.merchant_ref || null,
              provider: 'jpesa',
              channel: body?.method || 'mobile_money',
              msisdn: String(body?.msisdn || ''),
              amount: Number(body?.amount || 0),
              currency: 'UGX',
              plan_code: body?.planCode || null,
              interval_months: body?.intervalMonths ? Number(body.intervalMonths) : null,
              purpose: body?.purpose || 'license',
              status: 'pending',
              raw: res.data,
            })
          } catch (e) {
            console.error('[payments] mirror failed', e)
          }
        }
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'status': {
        const res = await lic.paymentStatus({ payment_id: body?.paymentId, merchant_ref: body?.merchantRef })
        if (res.api_status === '200' && res.data?.status === 'paid' && res.data?.payment_id) {
          if (adminAvailable()) {
            try {
              await adminClient()
                .from('license_payments')
                .update({ status: 'paid', paid_at: new Date().toISOString(), merchant_ref: res.data.merchant_ref || null })
                .eq('payment_id', res.data.payment_id)
            } catch (e) {
              console.error('[payments] status mirror failed', e)
            }
          }
          // A settled licence payment extends or issues the licence on the hub.
          // Pull the fresh certificate so the workspace unlocks without a reload.
          if (companyId) {
            const lic2 = await lic.licenseStatus(companyId)
            if (lic2.api_status === '200') await mirrorLicenseFromHub(companyId, lic2.data)
          }
        }
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'history': {
        const res = await lic.paymentHistory(companyId, Number(body?.limit || 20))
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      default:
        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Payment request failed' }, { status: 500 })
  }
}
