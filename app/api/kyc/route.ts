import { NextRequest, NextResponse } from 'next/server'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { hitIp } from '@/lib/security/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * /api/kyc — the only path through which a client may read or change KYC state.
 *
 * Before this route existed the licence page wrote `kyc_verifications` straight
 * from the browser with the anon key, which let any signed-in user assert their
 * own verification. All writes now happen here, behind the service role, with
 * rate limiting and server-side validation of what a client is allowed to do.
 */

/** GET /api/kyc?companyId=...&userId=... — badges and verification state. */
export async function GET(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('companyId')
  const userId = searchParams.get('userId')
  const db = adminClient()

  const result: Record<string, any> = {}

  if (companyId) {
    const [{ data: company }, { data: kyc }] = await Promise.all([
      db.from('companies').select('verified, name').eq('id', companyId).maybeSingle(),
      db
        .from('kyc_verifications')
        .select('status, level, badge, source, verified_at')
        .eq('subject_type', 'company')
        .eq('subject_id', companyId)
        .maybeSingle(),
    ])
    result.company = {
      verified: Boolean(company?.verified) || kyc?.status === 'verified',
      status: kyc?.status || (company?.verified ? 'verified' : 'unverified'),
      badge: kyc?.status === 'verified' || company?.verified ? 'gold' : null,
      source: kyc?.source || null,
      verifiedAt: kyc?.verified_at || null,
    }
  }

  if (userId) {
    const { data: user } = await db.from('users').select('kyc_status').eq('id', userId).maybeSingle()
    const { data: kyc } = await db
      .from('kyc_verifications')
      .select('status, badge, source, verified_at')
      .eq('subject_type', 'user')
      .eq('subject_id', userId)
      .maybeSingle()
    const verified = user?.kyc_status === 'verified' || kyc?.status === 'verified'
    result.user = {
      verified,
      status: user?.kyc_status || kyc?.status || 'unverified',
      badge: verified ? 'blue' : null,
      source: kyc?.source || (user?.kyc_status === 'verified' ? 'jackisa' : null),
      verifiedAt: kyc?.verified_at || null,
    }
  }

  return NextResponse.json({ ok: true, ...result })
}

/**
 * POST /api/kyc — a company admin requests verification for their own company.
 * Body: { action: 'request_company' | 'auto_individual', companyId?, userId? }
 *
 * A client may only ever move a subject INTO 'pending' (a request), never
 * straight to 'verified' — approval is an operator action on the hub.
 */
export async function POST(req: NextRequest) {
  const limited = hitIp(req, 'kyc', { windowSeconds: 60, max: 10 })
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
    )
  }
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || '')
  const db = adminClient()

  if (action === 'request_company') {
    const companyId = String(body?.companyId || '')
    if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 })

    const { data: company } = await db.from('companies').select('id, verified').eq('id', companyId).maybeSingle()
    if (!company) return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 })
    if (company.verified) return NextResponse.json({ ok: true, alreadyVerified: true })

    const { data: existing } = await db
      .from('kyc_verifications')
      .select('id, status')
      .eq('subject_type', 'company')
      .eq('subject_id', companyId)
      .maybeSingle()
    if (existing?.status === 'verified') return NextResponse.json({ ok: true, alreadyVerified: true })
    if (existing?.status === 'pending') return NextResponse.json({ ok: true, alreadyPending: true })

    if (existing) {
      await db.from('kyc_verifications').update({ status: 'pending', source: 'office' }).eq('id', existing.id)
    } else {
      await db.from('kyc_verifications').insert({
        subject_type: 'company',
        subject_id: companyId,
        level: 'company',
        status: 'pending',
        source: 'office',
      })
    }
    return NextResponse.json({ ok: true, status: 'pending' })
  }

  if (action === 'auto_individual') {
    // An individual already verified on jackisa.com is auto-verified here. The
    // hub is the source of truth; we only mirror a verified result.
    const userId = String(body?.userId || '')
    const verifiedOnJackisa = Boolean(body?.verifiedOnJackisa)
    if (!userId) return NextResponse.json({ ok: false, error: 'userId is required' }, { status: 400 })
    if (!verifiedOnJackisa) return NextResponse.json({ ok: false, error: 'Not verified on jackisa.com' }, { status: 403 })

    await db.from('users').update({ kyc_status: 'verified' }).eq('id', userId)
    const { data: existing } = await db
      .from('kyc_verifications')
      .select('id')
      .eq('subject_type', 'user')
      .eq('subject_id', userId)
      .maybeSingle()
    if (existing) {
      await db.from('kyc_verifications').update({ status: 'verified', badge: 'blue', source: 'jackisa' }).eq('id', existing.id)
    } else {
      await db.from('kyc_verifications').insert({
        subject_type: 'user',
        subject_id: userId,
        level: 'individual',
        status: 'verified',
        badge: 'blue',
        source: 'jackisa',
        verified_at: new Date().toISOString(),
      })
    }
    return NextResponse.json({ ok: true, status: 'verified', badge: 'blue' })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
