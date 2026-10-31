/**
 * Server-side auth helpers for route handlers. Verifies the caller's Supabase
 * access token, then checks their role in a company via the service-role client
 * so RLS recursion never blocks an administrative action.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adminClient, adminAvailable } from './peer'

export interface Caller {
  id: string
  email: string | null
}

export async function getCaller(req: NextRequest): Promise<Caller | null> {
  const session = await getSession(req)
  return session?.caller ?? null
}

/**
 * Like getCaller, but also returns the raw bearer token so a handler can
 * re-use the caller's own credentials for a downstream request instead of
 * reaching for the service role.
 */
export async function getSession(req: NextRequest): Promise<{ caller: Caller; token: string } | null> {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user) return null
  return { caller: { id: data.user.id, email: data.user.email ?? null }, token }
}

export interface Membership {
  companyId: string
  roleId: string | null
  roleName: string | null
  position: string | null
  isAdmin: boolean
}

export async function getMembership(userId: string, companyId: string): Promise<Membership | null> {
  if (!adminAvailable()) return null
  const db = adminClient()
  const { data } = await db
    .from('company_employees')
    .select('company_id, company_role_id, position, status, company_roles(name)')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .maybeSingle()
  if (data) {
    const roleName = (data as any).company_roles?.name ?? null
    const haystack = `${roleName || ''} ${data.position || ''}`.toLowerCase()
    const isAdmin = /admin|owner|director|principal|manager/.test(haystack)
    return {
      companyId,
      roleId: data.company_role_id,
      roleName,
      position: data.position,
      isAdmin,
    }
  }

  // Fallback for the company owner. Accounts created before the employee-status
  // flow (or where the membership row is missing / not yet 'active') would
  // otherwise be locked out of their own company's billing. The company's
  // creator is the owner and is always treated as an admin member.
  const { data: company } = await db
    .from('companies')
    .select('id, created_by, owner_user_id')
    .eq('id', companyId)
    .maybeSingle()
  if (company && ((company as any).created_by === userId || (company as any).owner_user_id === userId)) {
    return { companyId, roleId: null, roleName: 'Owner', position: 'Owner', isAdmin: true }
  }
  return null
}

export async function requireCompanyAdmin(req: NextRequest, companyId: string): Promise<{ caller: Caller; membership: Membership } | { error: string; status: number }> {
  const caller = await getCaller(req)
  if (!caller) return { error: 'Not signed in', status: 401 }
  const membership = await getMembership(caller.id, companyId)
  if (!membership || !membership.isAdmin) return { error: 'You do not have permission to manage this company', status: 403 }
  return { caller, membership }
}

/** Require the caller to be any active member of the company (admin or not). */
export async function requireMember(req: NextRequest, companyId: string): Promise<{ caller: Caller; membership: Membership } | { error: string; status: number }> {
  const caller = await getCaller(req)
  if (!caller) return { error: 'Not signed in', status: 401 }
  const membership = await getMembership(caller.id, companyId)
  if (!membership) return { error: 'You are not a member of this company', status: 403 }
  return { caller, membership }
}

/**
 * Require a platform super-admin. Used for the package/feature catalogue, which
 * changes what every tenant can buy — deliberately narrower than a company admin.
 * A super-admin is a row in `users` with role = 'super_admin' (the enum value),
 * which is how the platform owner account is flagged.
 */
export async function requireSuperAdmin(req: NextRequest): Promise<{ caller: Caller } | { error: string; status: number }> {
  const caller = await getCaller(req)
  if (!caller) return { error: 'Not signed in', status: 401 }
  if (!adminAvailable()) return { error: 'Not configured', status: 500 }
  const db = adminClient()
  const { data } = await db.from('users').select('role, is_active').eq('id', caller.id).maybeSingle()
  const role = String((data as any)?.role || '').toLowerCase()
  if (role !== 'super_admin' || (data as any)?.is_active === false) {
    return { error: 'Platform administrator access is required', status: 403 }
  }
  return { caller }
}
