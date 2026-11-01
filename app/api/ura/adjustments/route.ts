import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/lib/lic/guard'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { URA_FEATURE } from '@/lib/ura/server'

export const dynamic = 'force-dynamic'

const KINDS = ['income', 'expense', 'asset', 'liability', 'addition', 'deduction']
const RETURN_TYPES = ['income_tax', 'paye']

/**
 * POST /api/ura/adjustments   — add an adjustment (invoice, asset, liability, …)
 * GET  /api/ura/adjustments?companyId=&returnType=   — list them
 * DELETE /api/ura/adjustments?id=&companyId=          — remove one
 *
 * Adjustments are the free-form rows a user adds to strengthen a return. They
 * are company-scoped and gated by the same feature check as the rest of the
 * URA module.
 */
export async function GET(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const { searchParams } = new URL(req.url)
  const companyId = String(searchParams.get('companyId') || '')
  const returnType = String(searchParams.get('returnType') || 'income_tax')
  if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 })

  const gate = await requireFeature(req, companyId, URA_FEATURE)
  if ('error' in gate) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })

  const db = adminClient()
  let query = db.from('tax_adjustments').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
  if (RETURN_TYPES.includes(returnType)) query = query.eq('return_type', returnType)
  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data || [] })
}

export async function POST(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const body = await req.json().catch(() => ({}))
  const companyId = String(body?.companyId || '')
  if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 })

  const gate = await requireFeature(req, companyId, URA_FEATURE)
  if ('error' in gate) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })

  const kind = String(body?.kind || '')
  if (!KINDS.includes(kind)) return NextResponse.json({ ok: false, error: `kind must be one of ${KINDS.join(', ')}` }, { status: 400 })
  const label = String(body?.label || '').trim()
  if (!label) return NextResponse.json({ ok: false, error: 'label is required' }, { status: 400 })
  const amount = Number(body?.amount)
  if (!Number.isFinite(amount)) return NextResponse.json({ ok: false, error: 'amount must be a number' }, { status: 400 })

  const returnType = RETURN_TYPES.includes(String(body?.returnType)) ? String(body.returnType) : 'income_tax'

  const db = adminClient()
  const { data, error } = await db
    .from('tax_adjustments')
    .insert({
      company_id: companyId,
      return_type: returnType,
      period_start: body?.periodStart || null,
      period_end: body?.periodEnd || null,
      kind,
      label,
      amount,
      reference: body?.reference || null,
      notes: body?.notes || null,
      created_by: gate.callerId,
    })
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function DELETE(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const { searchParams } = new URL(req.url)
  const companyId = String(searchParams.get('companyId') || '')
  const id = String(searchParams.get('id') || '')
  if (!companyId || !id) return NextResponse.json({ ok: false, error: 'companyId and id are required' }, { status: 400 })

  const gate = await requireFeature(req, companyId, URA_FEATURE)
  if ('error' in gate) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })

  const db = adminClient()
  const { error } = await db.from('tax_adjustments').delete().eq('id', id).eq('company_id', companyId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
