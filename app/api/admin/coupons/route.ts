import { NextRequest, NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'
import { requireSuperAdmin } from '@/lib/lic/serverAuth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/coupons
 * Body: { action: 'list' | 'get' | 'create' | 'update' | 'archive' | 'redemptions', ...payload }
 *
 * Coupon console. Super-admin only. Proxies to the licence hub's
 * /api/v1/admin/coupons so an operator can mint an account-targeted coupon —
 * a percentage off, a flat amount, a full waiver, or bonus days — and scope it
 * to a single account, a list, or a group (new, legacy, country, industry,
 * kind, tier). The hub is the authority on eligibility and pricing.
 */
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if ('error' in gate) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || 'list')
  if (!['list', 'get', 'create', 'update', 'archive', 'deactivate', 'redemptions'].includes(action)) {
    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  }

  const payload = { ...body }
  delete payload.action

  const res = await lic.catalogCoupons(action as any, payload)
  if (res.api_status !== '200') {
    return NextResponse.json(
      { ok: false, error: res.errors?.error_text || 'Coupon request failed' },
      { status: Number(res.api_status) >= 400 ? Number(res.api_status) : 502 }
    )
  }
  return NextResponse.json({ ok: true, data: res.data })
}
