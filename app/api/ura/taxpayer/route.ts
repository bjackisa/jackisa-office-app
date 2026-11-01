import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/lib/lic/guard'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { URA_FEATURE } from '@/lib/ura/server'
import { loadTaxpayer } from '@/lib/ura/collect'

export const dynamic = 'force-dynamic'

/**
 * GET   /api/ura/taxpayer?companyId=  — the identity a return is filed under
 * PATCH /api/ura/taxpayer             — update name / TIN / email / phone
 *
 * A return cannot be filed without a TIN, and the company record is the one
 * place it lives. Editing it here saves the user a trip to settings.
 */
export async function GET(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const companyId = String(new URL(req.url).searchParams.get('companyId') || '')
  if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 })

  const gate = await requireFeature(req, companyId, URA_FEATURE)
  if ('error' in gate) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })

  return NextResponse.json({ ok: true, data: await loadTaxpayer(companyId) })
}

export async function PATCH(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const body = await req.json().catch(() => ({}))
  const companyId = String(body?.companyId || '')
  if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 })

  const gate = await requireFeature(req, companyId, URA_FEATURE)
  if ('error' in gate) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })

  const patch: Record<string, any> = {}
  if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if (typeof body?.email === 'string') patch.email = body.email.trim() || null
  if (typeof body?.phone === 'string') patch.phone = body.phone.trim() || null
  if (typeof body?.address === 'string') patch.address = body.address.trim() || null
  if (typeof body?.tin === 'string') {
    const tin = body.tin.replace(/\s/g, '')
    // `tin` is the column the tax screens read; `tax_id` predates it. Keep both
    // in step so nothing shows a stale number.
    patch.tin = tin || null
    patch.tax_id = tin || null
  }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 })

  const db = adminClient()
  const { error } = await db.from('companies').update(patch).eq('id', companyId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, data: await loadTaxpayer(companyId) })
}
