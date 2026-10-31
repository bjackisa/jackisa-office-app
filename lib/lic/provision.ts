import { lic } from '@/lib/lic/client'
import { adminClient, adminAvailable } from '@/lib/lic/peer'

export interface ProvisionCaller {
  id: string
  email: string | null
}

/**
 * Make sure the office company exists on the licence hub as a tenant before the
 * hub is asked to do anything that references it (start a trial, charge a
 * licence, change a plan).
 *
 * The hub enforces a foreign key from `trials`/`licenses`/`subscriptions` to
 * `tenants`, but the office app otherwise never tells the hub about a new
 * company — so the first time a fresh workspace tried to start a trial the
 * insert failed the constraint and the hub returned a 500. Provisioning closes
 * that gap: the company, its owner user and the owner membership are pushed to
 * the hub (which upserts, so it is idempotent) and the tenant id is remembered
 * on the company row so later calls take the fast path.
 *
 * The tenant id is deliberately the office company id — every licence call the
 * app makes already passes the company id as `tenant_id`, so they must match.
 */
export async function ensureLicTenant(companyId: string, caller: ProvisionCaller): Promise<void> {
  if (!companyId || !adminAvailable()) return
  const db = adminClient()

  try {
    const { data: company } = await db
      .from('companies')
      .select('id, name, email, phone, industry, kind, currency, logo_url, lic_tenant_id')
      .eq('id', companyId)
      .maybeSingle()

    // Already provisioned on a previous call — nothing to do.
    if ((company as any)?.lic_tenant_id) return

    const { data: user } = await db
      .from('users')
      .select('id, email, full_name, phone, avatar_url, kyc_status, kyc_level')
      .eq('id', caller.id)
      .maybeSingle()

    const tenantId = companyId
    const entities: Array<{ type: string; data: Record<string, any> }> = [
      {
        type: 'tenant',
        data: {
          id: tenantId,
          supabase_company_id: companyId,
          name: (company as any)?.name || `${caller.email || 'New'} workspace`,
          email: (company as any)?.email || caller.email || null,
          phone: (company as any)?.phone || null,
          industry: (company as any)?.industry || null,
          currency: (company as any)?.currency || 'UGX',
          kind: (company as any)?.kind || 'company',
          logo_url: (company as any)?.logo_url || null,
        },
      },
    ]

    // The owner must exist before the membership can reference them.
    if (user) {
      entities.push({
        type: 'user',
        data: {
          id: caller.id,
          supabase_user_id: caller.id,
          email: (user as any).email || caller.email || null,
          full_name: (user as any).full_name || null,
          phone: (user as any).phone || null,
          avatar_url: (user as any).avatar_url || null,
          kyc_status: (user as any).kyc_status || 'unverified',
          kyc_level: (user as any).kyc_level || 'none',
          is_active: true,
        },
      })
      entities.push({
        type: 'member',
        data: { tenant_id: tenantId, user_id: caller.id, role: 'owner', status: 'active', is_owner: true },
      })
    }

    const res = await lic.syncPush(entities)
    if (res.api_status === '200') {
      await db.from('companies').update({ lic_tenant_id: tenantId }).eq('id', companyId).is('lic_tenant_id', null)
    }
  } catch (e) {
    // Provisioning is best-effort: if the hub is unreachable the licence call
    // that follows returns a clean error the UI can show.
    console.error('[provision] tenant sync failed', e)
  }
}
