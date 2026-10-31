import { NextRequest, NextResponse } from 'next/server'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { lic } from '@/lib/lic/client'

export const dynamic = 'force-dynamic'

/**
 * /api/jackisa — Jackisa One, the cross-platform benefits surface.
 *
 * The office app never talks to jackisa.com directly; every action goes through
 * the licence hub, which owns the bridge secret and signs the call. This route
 * resolves the tenant's owner email (so the hub can match the jackisa.com
 * account) and forwards the request.
 *
 * Actions:
 *   GET  ?companyId=...                      benefits for the plan
 *   POST { companyId, action: 'sync' }       push the tier to jackisa.com
 *   POST { companyId, action: 'publish-course', title, price, ... }
 *   POST { companyId, action: 'meeting', title, meetingId }
 *   POST { companyId, action: 'member-channel', memberEmail }
 *   POST { companyId, action: 'store-earnings' }
 *   POST { companyId, action: 'verification', badge, verified }
 */
export async function GET(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const companyId = new URL(req.url).searchParams.get('companyId') || ''
  if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 })

  const owner = await resolveOwner(companyId)
  const res = await lic.jackisaBenefits({ tenantId: owner.tenantId, email: owner.email })
  return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
}

export async function POST(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const body = await req.json().catch(() => ({}))
  const companyId = String(body?.companyId || '')
  const action = String(body?.action || '')
  if (!companyId || !action) {
    return NextResponse.json({ ok: false, error: 'companyId and action are required' }, { status: 400 })
  }

  const owner = await resolveOwner(companyId)
  const id = { tenantId: owner.tenantId, email: owner.email }

  let res: any
  switch (action) {
    case 'sync':
      res = await lic.jackisaSync(owner.tenantId)
      break
    case 'publish-course':
      res = await lic.jackisaPublishCourse({ ...id, title: body.title, description: body.description, price: body.price, categoryId: body.categoryId, storeName: body.storeName })
      break
    case 'meeting':
      res = await lic.jackisaMeeting({ ...id, title: body.title, meetingId: body.meetingId })
      break
    case 'member-channel':
      res = await lic.jackisaMemberChannel({ ...id, memberEmail: body.memberEmail, memberName: body.memberName })
      break
    case 'store-earnings':
      res = await lic.jackisaStoreEarnings({ ...id, limit: body.limit })
      break
    case 'verification':
      res = await lic.jackisaVerification({ ...id, badge: body.badge || 'company', verified: body.verified !== false })
      break
    default:
      return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  }

  return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
}

/** Resolve the tenant id and owner email for a company. */
async function resolveOwner(companyId: string): Promise<{ tenantId: string; email: string }> {
  const db = adminClient()
  const { data: company } = await db
    .from('companies')
    .select('lic_tenant_id, name, owner_user_id')
    .eq('id', companyId)
    .maybeSingle()

  const tenantId = company?.lic_tenant_id || companyId
  let email = ''
  const ownerId = company?.owner_user_id
  if (ownerId) {
    const { data: owner } = await db.from('users').select('email').eq('id', ownerId).maybeSingle()
    email = owner?.email || ''
  }
  return { tenantId, email }
}
