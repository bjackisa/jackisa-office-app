import { supabase } from '@/lib/supabase'

const ACTIVE_EMPLOYEE_STATUSES = ['active', 'pending_invitation']

export interface SessionContext {
  userId: string
  displayName: string
  companyId: string | null
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const userId = session.user.id
  const fallbackName = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User'

  const [{ data: userData }, { data: preferredCompany }] = await Promise.all([
    supabase
      .from('users')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('user_active_company')
      .select('company_id')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  let companyId = preferredCompany?.company_id || null

  if (!companyId) {
    const { data: employeeData } = await supabase
      .from('company_employees')
      .select('company_id')
      .eq('user_id', userId)
      .in('status', ACTIVE_EMPLOYEE_STATUSES)
      .limit(1)
      .maybeSingle()

    companyId = employeeData?.company_id || null
  }

  return {
    userId,
    displayName: userData?.full_name || fallbackName,
    companyId,
  }
}
