/**
 * Jackisa Office — Cross-Module Ecosystem Logger
 * Logs ecosystem events and triggers fund-side effects from any module.
 */

import { supabase } from '@/lib/supabase'

export type EcosystemEventType =
  | 'student_enrolled'
  | 'invoice_paid'
  | 'sale_confirmed'
  | 'payroll_processed'
  | 'attendance_recorded'
  | 'leave_approved'
  | 'performance_reviewed'
  | 'expense_approved'
  | 'commission_paid'
  | 'point_awarded'

interface LogEventParams {
  companyId: string
  eventType: EcosystemEventType
  sourceTable: string
  sourceId: string
  payload?: Record<string, any>
}

/**
 * Log an ecosystem event. The SQL triggers will pick up matching events
 * and process fund allocations, points, etc. automatically.
 */
export async function logEcosystemEvent(params: LogEventParams) {
  try {
    await supabase.from('ecosystem_events').insert({
      company_id: params.companyId,
      event_type: params.eventType,
      source_table: params.sourceTable,
      source_id: params.sourceId,
      payload: params.payload || {},
      processed: false,
    })
  } catch (err) {
    console.error('[Ecosystem] Failed to log event:', params.eventType, err)
  }
}

/**
 * Attempt to allocate a sale/invoice amount to the workspace fund.
 * Returns the allocation result or null if no fund exists.
 */
export async function allocateToFund(params: {
  companyId: string
  grossAmount: number
  profitEstimatePct?: number
  sourceDescription: string
  sourceTable: string
  sourceId: string
}) {
  try {
    const { data: fund } = await supabase
      .from('workspace_funds')
      .select('id, sales_profit_alloc_pct, jackisa_revenue_alloc_fee_rate, mgmt_annual_fee_rate, cash_pool, total_assets, currency')
      .eq('company_id', params.companyId)
      .maybeSingle()

    if (!fund || !fund.sales_profit_alloc_pct) return null

    const profitPct = params.profitEstimatePct ?? 0.30
    const estimatedProfit = params.grossAmount * profitPct
    const allocPct = fund.sales_profit_alloc_pct
    const grossAlloc = estimatedProfit * allocPct
    const jackisaFee = grossAlloc * (fund.jackisa_revenue_alloc_fee_rate || 0.01)
    const mgmtFee = (grossAlloc - jackisaFee) * (fund.mgmt_annual_fee_rate || 0.015)
    const netToFund = grossAlloc - jackisaFee - mgmtFee

    if (netToFund <= 0) return null

    // Record daily sales allocation
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('fund_daily_sales_allocations').upsert({
      fund_id: fund.id,
      alloc_date: today,
      total_sales: params.grossAmount,
      total_profit: estimatedProfit,
      alloc_pct: allocPct,
      gross_allocation: grossAlloc,
      jackisa_fee: jackisaFee,
      mgmt_fee: mgmtFee,
      net_to_fund: netToFund,
    }, { onConflict: 'fund_id,alloc_date' })

    // Update fund cash pool + total assets
    await supabase.from('workspace_funds').update({
      cash_pool: (fund.cash_pool || 0) + netToFund,
      total_assets: (fund.total_assets || 0) + netToFund,
      updated_at: new Date().toISOString(),
    }).eq('id', fund.id)

    // Record Jackisa platform revenue
    await supabase.from('jackisa_platform_revenue').insert({
      fund_id: fund.id,
      fee_type: 'revenue_alloc',
      amount: jackisaFee,
      description: `Revenue alloc fee: ${params.sourceDescription}`,
    })

    return {
      fundId: fund.id,
      currency: fund.currency,
      grossAlloc,
      jackisaFee,
      mgmtFee,
      netToFund,
    }
  } catch (err) {
    console.error('[Ecosystem] allocateToFund error:', err)
    return null
  }
}

/**
 * Auto-contribute from payroll to fund for an employee.
 * Only runs if the employee has a member position with auto_contribute_pct > 0.
 */
export async function autoContributeFromPayroll(params: {
  companyId: string
  employeeId: string
  netPay: number
  userId: string
}) {
  try {
    const { data: fund } = await supabase
      .from('workspace_funds')
      .select('id')
      .eq('company_id', params.companyId)
      .maybeSingle()

    if (!fund) return null

    const { data: position } = await supabase
      .from('fund_member_positions')
      .select('id, auto_contribute_pct')
      .eq('fund_id', fund.id)
      .eq('employee_id', params.employeeId)
      .eq('is_active', true)
      .maybeSingle()

    if (!position || !position.auto_contribute_pct || position.auto_contribute_pct <= 0) return null

    const grossContrib = params.netPay * position.auto_contribute_pct

    const { error } = await supabase.rpc('process_contribution', {
      p_fund_id: fund.id,
      p_member_position_id: position.id,
      p_gross_amount: grossContrib,
      p_recorded_by: params.userId,
    })

    if (error) {
      console.error('[Ecosystem] autoContribute RPC error:', error)
      return null
    }

    return { fundId: fund.id, positionId: position.id, grossContrib }
  } catch (err) {
    console.error('[Ecosystem] autoContributeFromPayroll error:', err)
    return null
  }
}

/**
 * Award HR points and log ecosystem event for attendance.
 */
export async function awardAttendancePoints(params: {
  companyId: string
  employeeId: string
  status: string
  userId: string
}) {
  try {
    const pointsMap: Record<string, number> = {
      present: 2,
      late: -1,
      absent: -3,
      leave: 0,
    }

    const points = pointsMap[params.status]
    if (points === undefined || points === 0) return null

    const descMap: Record<string, string> = {
      present: 'On-time attendance bonus',
      late: 'Late arrival deduction',
      absent: 'Unexcused absence deduction',
    }

    await supabase.from('hr_points').insert({
      company_id: params.companyId,
      employee_id: params.employeeId,
      point_type: 'attendance',
      points,
      description: descMap[params.status] || `Attendance: ${params.status}`,
      recorded_by: params.userId,
    })

    return { points, status: params.status }
  } catch (err) {
    console.error('[Ecosystem] awardAttendancePoints error:', err)
    return null
  }
}

/**
 * Check if a workspace fund exists for the given company.
 */
export async function hasFund(companyId: string): Promise<boolean> {
  const { data } = await supabase
    .from('workspace_funds')
    .select('id')
    .eq('company_id', companyId)
    .maybeSingle()
  return !!data
}
