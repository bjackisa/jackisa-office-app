/**
 * Server-side feature gate for route handlers.
 *
 * The client `useLicense().can()` hides UI, but a hidden screen is not a
 * security boundary — a signed-in member could call the API directly. This
 * guard repeats the same three checks (tier, company kind/override, role grant)
 * on the server so a gated module is refused at the data layer too.
 */

import { NextRequest } from 'next/server'
import { adminClient, adminAvailable } from './peer'
import { getCaller, getMembership } from './serverAuth'
import { hasFeature, registerFeatureCatalogue, type GateContext } from './features'

export interface FeatureGate {
  callerId: string
  companyId: string
  isAdminRole: boolean
}

/**
 * Require the caller to be an active member of `companyId` whose licence tier,
 * company kind and role all unlock `slug`. Returns `{ error, status }` to be
 * returned verbatim when access is refused.
 */
export async function requireFeature(
  req: NextRequest,
  companyId: string,
  slug: string
): Promise<FeatureGate | { error: string; status: number }> {
  if (!companyId) return { error: 'companyId is required', status: 400 }
  if (!adminAvailable()) return { error: 'Not configured', status: 500 }

  const caller = await getCaller(req)
  if (!caller) return { error: 'Not signed in', status: 401 }

  const membership = await getMembership(caller.id, companyId)
  if (!membership) return { error: 'You are not a member of this company', status: 403 }

  const db = adminClient()
  const [{ data: lic }, { data: company }, { data: catalogue }, { data: overrides }, { data: grants }] = await Promise.all([
    db.from('platform_licenses').select('tier, status, expires_at, grace_until').eq('company_id', companyId).eq('is_current', true).maybeSingle(),
    db.from('companies').select('kind').eq('id', companyId).maybeSingle(),
    db.from('platform_features').select('slug, name, category, min_tier'),
    db.from('company_feature_overrides').select('feature_slug, enabled').eq('company_id', companyId),
    membership.roleId
      ? db.from('company_role_features').select('feature_slug, enabled').eq('company_role_id', membership.roleId)
      : Promise.resolve({ data: [] as any[] }),
  ])

  if (catalogue?.length) registerFeatureCatalogue(catalogue as any[])

  const status = String((lic as any)?.status || 'unknown')
  if (status !== 'unknown' && !['active', 'trial', 'grace'].includes(status)) {
    return { error: 'Your licence is not active', status: 402 }
  }

  const ctx: GateContext = {
    tier: (lic as any)?.tier || 'basic',
    companyKind: (company as any)?.kind || null,
    overrides: Object.fromEntries((overrides || []).map((o: any) => [o.feature_slug, o.enabled])),
    roleGrants: Object.fromEntries((grants || []).map((g: any) => [g.feature_slug, g.enabled])),
    isAdminRole: membership.isAdmin,
  }

  if (!hasFeature(slug, ctx)) {
    return { error: 'Your plan or role does not include this module', status: 403 }
  }

  return { callerId: caller.id, companyId, isAdminRole: membership.isAdmin }
}
