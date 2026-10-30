import { NextRequest, NextResponse } from 'next/server'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * POST /api/signup-intent
 * Body: { email?, planCode?, intervalMonths?, tier?, companyName?, companyEmail?,
 *         industry?, intent?, inviteToken? }
 *
 * Records the plan a visitor chose *before* they authenticate, so the choice
 * survives email verification and any device change. Returns a token the client
 * keeps and replays after signup so the plan is applied without re-asking.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  if (!adminAvailable()) {
    return NextResponse.json({ ok: true, token: null, persisted: false })
  }

  const token = crypto.randomBytes(24).toString('base64url')
  const db = adminClient()
  try {
    await db.from('signup_intents').insert({
      token,
      email: body?.email ? String(body.email).toLowerCase() : null,
      plan_code: body?.planCode || null,
      tier: body?.tier || null,
      interval_months: body?.intervalMonths ? Number(body.intervalMonths) : null,
      company_name: body?.companyName || null,
      industry: body?.industry || null,
      intent: ['create_company', 'join_company', 'create_institution', 'join_institution'].includes(body?.intent)
        ? body.intent
        : 'create_company',
      invite_token: body?.inviteToken || null,
      payload: body || {},
    })
  } catch (e) {
    console.error('[signup-intent] insert failed', e)
    return NextResponse.json({ ok: true, token: null, persisted: false })
  }

  return NextResponse.json({ ok: true, token, persisted: true })
}

/**
 * GET /api/signup-intent?token=...
 * Retrieves a remembered plan so the billing page can pre-select it.
 */
export async function GET(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const token = new URL(req.url).searchParams.get('token')
  if (!token) return NextResponse.json({ ok: false, error: 'token required' }, { status: 400 })
  const db = adminClient()
  const { data } = await db.from('signup_intents').select('*').eq('token', token).maybeSingle()
  if (!data) return NextResponse.json({ ok: false, error: 'Intent not found' }, { status: 404 })
  return NextResponse.json({ ok: true, intent: data })
}
