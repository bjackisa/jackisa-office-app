import { NextRequest, NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'
import { getCaller, getMembership } from '@/lib/lic/serverAuth'
import { ensureLicTenant } from '@/lib/lic/provision'
import { hitIp } from '@/lib/security/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/lic/coupons
 * Body: { action: 'available' | 'validate' | 'quote', companyId, ... }
 *
 * Coupons for the signed-in company's billing page. Eligibility and pricing are
 * decided by the licence hub — this route only forwards the caller's company and
 * the plan selection, so the client can never fabricate a discount. The caller
 * must be an admin of the company (they are the one paying).
 */
export async function POST(req: NextRequest) {
  const limited = hitIp(req, 'coupons', { windowSeconds: 60, max: 60 })
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
    )
  }

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || 'available')
  const companyId = String(body?.companyId || '')
  if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 })

  const caller = await getCaller(req)
  if (!caller) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })
  const membership = await getMembership(caller.id, companyId)
  if (!membership?.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Only a company admin can view coupons' }, { status: 403 })
  }

  try {
    switch (action) {
      case 'available': {
        await ensureLicTenant(companyId, { id: caller.id, email: caller.email })
        const res = await lic.availableCoupons(companyId, {
          plan_code: body?.planCode,
          interval_months: body?.intervalMonths ? Number(body.intervalMonths) : undefined,
        })
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'validate': {
        const code = String(body?.code || '').trim()
        if (!code) return NextResponse.json({ ok: false, error: 'Enter a coupon code' }, { status: 400 })
        await ensureLicTenant(companyId, { id: caller.id, email: caller.email })
        const res = await lic.validateCoupon({
          tenant_id: companyId,
          code,
          plan_code: body?.planCode,
          interval_months: body?.intervalMonths ? Number(body.intervalMonths) : undefined,
          amount: Number(body?.amount || 0),
        })
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'quote': {
        await ensureLicTenant(companyId, { id: caller.id, email: caller.email })
        const res = await lic.quoteCoupon({
          tenant_id: companyId,
          code: body?.code ? String(body.code) : undefined,
          plan_code: body?.planCode,
          interval_months: body?.intervalMonths ? Number(body.intervalMonths) : undefined,
          amount: Number(body?.amount || 0),
        })
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      default:
        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Coupon request failed' }, { status: 500 })
  }
}
