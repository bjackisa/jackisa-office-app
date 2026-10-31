import { NextRequest, NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'
import { adminClient, adminAvailable, verifyLicSignature } from '@/lib/lic/peer'

export const dynamic = 'force-dynamic'

/**
 * POST /api/lic/sync  — called BY lic.jackisa.com (signed).
 *   { direction: 'pull', since }  -> return office changes since `since`
 *   { direction: 'push', entities } -> apply licence/subscription changes
 *
 * GET  /api/lic/sync  — called BY the office app to drain its outbox to lic.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()
  const signature = req.headers.get('x-lic-signature')
  if (!verifyLicSignature(raw, signature, 'office')) {
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 })
  }
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })

  const body = JSON.parse(raw || '{}')
  const direction = String(body?.direction || 'pull')
  const db = adminClient()

  if (direction === 'pull') {
    const since = body?.since || '1970-01-01T00:00:00Z'
    const [companies, users, members] = await Promise.all([
      db.from('companies').select('id, name, email, industry, kind, verified, lic_tenant_id, updated_at').gte('updated_at', since).limit(500),
      db.from('users').select('id, email, full_name, phone, avatar_url, kyc_status, kyc_level, jackisa_user_id, updated_at').gte('updated_at', since).limit(500),
      db.from('company_employees').select('id, company_id, user_id, company_role_id, position, department, status, joined_at, updated_at').gte('updated_at', since).limit(1000),
    ])
    return NextResponse.json({
      ok: true,
      server_time: new Date().toISOString(),
      since,
      tenants: companies.data || [],
      users: users.data || [],
      members: members.data || [],
    })
  }

  // direction === 'push'
  const entities = Array.isArray(body?.entities) ? body.entities : []
  let applied = 0
  for (const entity of entities) {
    try {
      if (entity.type === 'license') {
        const d = entity.data || {}
        await db.from('platform_licenses').update({ is_current: false }).eq('company_id', d.company_id).eq('is_current', true)
        await db.from('platform_licenses').insert({
          company_id: d.company_id,
          serial: d.serial,
          license_key: d.license_key,
          plan_code: d.plan_code,
          tier: d.tier,
          status: d.status,
          interval_months: d.interval_months,
          max_employees: d.max_employees,
          max_students: d.max_students,
          storage_gb: d.storage_gb,
          features: d.features || {},
          starts_at: d.starts_at,
          expires_at: d.expires_at,
          grace_until: d.grace_until,
          is_current: true,
          last_validated_at: new Date().toISOString(),
        })
        applied++
      } else if (entity.type === 'subscription') {
        const d = entity.data || {}
        await db.from('company_subscriptions').upsert(
          {
            company_id: d.company_id,
            tier: d.tier,
            status: d.status,
            interval_months: d.interval_months,
            license_key: d.license_key,
            end_date: d.current_period_end,
          },
          { onConflict: 'company_id' }
        )
        applied++
      } else if (entity.type === 'payment') {
        const d = entity.data || {}
        await db.from('license_payments').upsert(
          {
            company_id: d.company_id,
            payment_id: d.payment_id,
            merchant_ref: d.merchant_ref,
            provider: 'jpesa',
            amount: d.amount,
            currency: d.currency || 'UGX',
            status: d.status === 'paid' ? 'paid' : d.status,
            paid_at: d.completed_at,
            purpose: 'license',
            raw: d,
          },
          { onConflict: 'payment_id' }
        )
        applied++
      }
    } catch (e) {
      console.error('[sync push] entity failed', e)
    }
  }
  return NextResponse.json({ ok: true, applied })
}

export async function GET(req: NextRequest) {
  // Draining the outbox pushes tenant data to the hub, so it must be
  // authenticated: either the licence hub (signed) or the platform cron with
  // the shared cron secret. An anonymous caller may not trigger a drain.
  const raw = await req.text().catch(() => '')
  const signature = req.headers.get('x-lic-signature')
  const cronSecret = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret')
  const expectedCron = process.env.CRON_SECRET || ''
  const authorized = verifyLicSignature(raw, signature, 'office') || (expectedCron !== '' && cronSecret === expectedCron)
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const db = adminClient()
  const { data: pending } = await db.from('sync_outbox').select('*').eq('status', 'pending').order('created_at', { ascending: true }).limit(100)
  if (!pending?.length) return NextResponse.json({ ok: true, sent: 0 })

  const res = await lic.syncPush(pending.map((p: any) => ({ type: p.entity_type, data: p.payload })))
  const ok = res.api_status === '200'
  const ids = pending.map((p: any) => p.id)
  await db.from('sync_outbox').update({ status: ok ? 'sent' : 'failed', sent_at: new Date().toISOString(), attempts: 1, last_error: ok ? null : res.errors?.error_text }).in('id', ids)
  return NextResponse.json({ ok, sent: pending.length, error: res.errors?.error_text })
}
