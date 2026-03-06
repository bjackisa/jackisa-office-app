import { supabase } from '@/lib/supabase'

export async function ensureFundMemberPosition(companyId: string, userId: string, fundId: string) {
  const { data: employee, error: employeeError } = await supabase
    .from('company_employees')
    .select('id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (employeeError) throw employeeError
  if (!employee) return null

  const { data: existing, error: existingError } = await supabase
    .from('fund_member_positions')
    .select('*')
    .eq('fund_id', fundId)
    .eq('employee_id', employee.id)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing) return existing

  const { data: created, error: createError } = await supabase
    .from('fund_member_positions')
    .insert({
      fund_id: fundId,
      employee_id: employee.id,
      user_id: userId,
      is_active: true,
    })
    .select('*')
    .single()

  if (createError) throw createError
  return created
}
