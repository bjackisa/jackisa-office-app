import { NextRequest, NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'
import { requireSuperAdmin } from '@/lib/lic/serverAuth'
import { adminClient, adminAvailable } from '@/lib/lic/peer'

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

  // Mirror the catalogue into Supabase so the office gate picks the change up
  // immediately (the hub also pushes it on the next sync).
  if (kind === 'features' && adminAvailable()) {
    try {
      const rows: any[] = res.data?.features || (res.data?.feature ? [res.data.feature] : [])
      const mapped = rows
        .filter((f) => f?.slug)
        .map((f) => ({
          slug: f.slug,
          name: f.name || f.slug,
          category: f.category || 'custom',
          min_tier: f.min_tier || 'basic',
          is_active: f.is_active === undefined ? true : Boolean(f.is_active),
        }))
      if (mapped.length) await adminClient().from('platform_features').upsert(mapped, { onConflict: 'slug' })
    } catch (e) {
      console.error('[admin/catalog] feature mirror failed', e)
    }
  }

  return NextResponse.json({ ok: true, data: res.data })
}
