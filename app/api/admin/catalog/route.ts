import { NextRequest, NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'
import { requireSuperAdmin } from '@/lib/lic/serverAuth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/catalog
 * Body: { kind: 'plans' | 'features', action: 'list' | 'create' | 'update' | 'deactivate', ...payload }
 *
 * The package manager. Super-admin only. Proxies to the licence hub's
 * /api/v1/admin/* catalogue so a new plan (tier + price + caps + feature flags)
 * or a new feature can be added to Jackisa Office from the web UI — no code
 * change, no deploy. Every peer picks the change up on the next sync.
 */
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if ('error' in gate) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })

  const body = await req.json().catch(() => ({}))
  const kind = String(body?.kind || 'plans')
  const action = String(body?.action || 'list')
  if (!['plans', 'features'].includes(kind)) {
    return NextResponse.json({ ok: false, error: 'kind must be plans or features' }, { status: 400 })
  }
  if (!['list', 'create', 'update', 'deactivate'].includes(action)) {
    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  }

  const payload = { ...body }
  delete payload.kind

  const res =
    kind === 'plans'
      ? await lic.catalogPlans(action as any, payload)
      : await lic.catalogFeatures(action as any, payload)

  if (res.api_status !== '200') {
    return NextResponse.json(
      { ok: false, error: res.errors?.error_text || 'Catalogue request failed' },
      { status: Number(res.api_status) >= 400 ? Number(res.api_status) : 502 }
    )
  }
  return NextResponse.json({ ok: true, data: res.data })
}
