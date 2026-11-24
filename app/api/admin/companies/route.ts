import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/lic/serverAuth'
import { adminClient, adminAvailable } from '@/lib/lic/peer'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/companies
 * Body: { action: 'list', search?: string, ids?: string[] }
 *
 * Account directory for the coupon console. Super-admin only. Coupons target a
 * tenant id, but operators know accounts by name and owner email, so this
 * resolves the two without asking them to paste UUIDs.
 */
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if ('error' in gate) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const search = String(body?.search || '').trim().replace(/[%,()"'\\]/g, ' ').trim().slice(0, 80)
  const ids = Array.isArray(body?.ids) ? body.ids.map((id: unknown) => String(id)).filter(Boolean).slice(0, 500) : []

  const db = adminClient()
  let query = db
    .from('companies')
    .select('id, name, email, industry, country, kind, created_by, lic_tenant_id, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (ids.length > 0) {
    query = query.in('id', ids)
  } else if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

  const rows = data || []
  const companyIds = rows.map((row: any) => row.id)
  const ownerIds = Array.from(new Set(rows.map((row: any) => row.created_by).filter(Boolean)))

  const [ownersRes, licensesRes] = await Promise.all([
    ownerIds.length
      ? db.from('users').select('id, full_name, email').in('id', ownerIds)
      : Promise.resolve({ data: [] as any[] }),
    companyIds.length
      ? db.from('platform_licenses').select('company_id, tier, plan_code, status').in('company_id', companyIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const owners = new Map((ownersRes.data || []).map((user: any) => [user.id, user]))
  const licenses = new Map((licensesRes.data || []).map((lic: any) => [lic.company_id, lic]))

  const companies = rows.map((row: any) => {
    const owner: any = row.created_by ? owners.get(row.created_by) : null
    const lic: any = licenses.get(row.id)
    return {
      id: row.id,
      tenant_id: row.lic_tenant_id || row.id,
      name: row.name,
      email: row.email,
      owner_name: owner?.full_name || null,
      owner_email: owner?.email || null,
      industry: row.industry || null,
      country: row.country || null,
      kind: row.kind || 'company',
      tier: lic?.tier || null,
      plan_code: lic?.plan_code || null,
      license_status: lic?.status || null,
      created_at: row.created_at,
    }
  })

  return NextResponse.json({ ok: true, companies })
}
