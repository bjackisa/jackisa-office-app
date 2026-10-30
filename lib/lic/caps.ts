import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side licence cap enforcement.
 *
 * Caps come from the current licence row and are enforced at the point where a
 * company grows — admitting an employee or enrolling a student — rather than
 * only in the UI, so an over-cap company cannot keep adding members.
 * A cap of 0 means unlimited.
 */

export interface CapResult {
  allowed: boolean
  used: number
  limit: number
  error?: string
}

async function currentCaps(db: SupabaseClient, companyId: string) {
  const { data } = await db
    .from('platform_licenses')
    .select('status, max_employees, max_students, expires_at, grace_until')
    .eq('company_id', companyId)
    .eq('is_current', true)
    .maybeSingle()
  return data
}

function isLicenceLive(lic: any): boolean {
  if (!lic) return false
  if (!['active', 'trial', 'grace'].includes(String(lic.status))) return false
  const deadline = lic.status === 'grace' ? lic.grace_until || lic.expires_at : lic.expires_at
  if (deadline && new Date(deadline).getTime() < Date.now()) return false
  return true
}

export async function checkEmployeeCap(db: SupabaseClient, companyId: string): Promise<CapResult> {
  const lic = await currentCaps(db, companyId)
  const limit = Number(lic?.max_employees ?? 0)
  const { count } = await db
    .from('company_employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'active')
  const used = count || 0
  if (limit > 0 && used >= limit) {
    return { allowed: false, used, limit, error: `Your plan allows ${limit} team members. Upgrade to add more.` }
  }
  return { allowed: true, used, limit }
}

export async function checkStudentCap(db: SupabaseClient, companyId: string): Promise<CapResult> {
  const lic = await currentCaps(db, companyId)
  const limit = Number(lic?.max_students ?? 0)
  const { count } = await db
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
  const used = count || 0
  if (limit > 0 && used >= limit) {
    return { allowed: false, used, limit, error: `Your plan allows ${limit} students. Upgrade to enrol more.` }
  }
  return { allowed: true, used, limit }
}

/** Whether the company's licence is currently live (not expired/revoked). */
export async function isCompanyLicensed(db: SupabaseClient, companyId: string): Promise<boolean> {
  const lic = await currentCaps(db, companyId)
  // No licence row yet: allow so a company can set itself up before licensing.
  if (!lic) return true
  return isLicenceLive(lic)
}
