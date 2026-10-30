/**
 * Payroll runs.
 *
 * A run turns each active employee's current salary structure into a payslip
 * (gross, NSSF, PAYE, net). Nothing is stored on the employee row as a static
 * figure — the structure is the source of truth, so a salary change flows into
 * the next run automatically.
 */

import { supabase } from '@/lib/supabase'
import { postEntry } from '@/lib/ledger'

export const NSSF_EMPLOYEE_RATE = 0.05
export const NSSF_EMPLOYER_RATE = 0.10

const PAYE_BANDS = [
  { lower: 0, upper: 235_000, rate: 0 },
  { lower: 235_000, upper: 335_000, rate: 0.1 },
  { lower: 335_000, upper: 410_000, rate: 0.2 },
  { lower: 410_000, upper: 10_000_000, rate: 0.3 },
  { lower: 10_000_000, upper: Infinity, rate: 0.4 },
]

export function calcPAYE(gross: number) {
  const nssf = round(gross * NSSF_EMPLOYEE_RATE)
  const taxable = gross - nssf
  let remaining = taxable
  let paye = 0
  for (const band of PAYE_BANDS) {
    if (remaining <= 0) break
    const width = band.upper === Infinity ? remaining : band.upper - band.lower
    const amt = Math.min(remaining, width)
    paye += amt * band.rate
    remaining -= amt
  }
  paye = round(paye)
  return { nssf, paye, net: round(gross - nssf - paye) }
}

export interface PayslipInput {
  employeeId: string
  gross: number
}

/** Resolve an employee's gross pay from their current salary structure. */
export async function grossFromStructure(companyId: string, employeeId: string): Promise<number> {
  const { data } = await supabase
    .from('salary_structures')
    .select('basic_salary, housing_allowance, transport_allowance, medical_allowance, other_allowances')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .eq('is_current', true)
    .maybeSingle()
  if (!data) return 0
  const other = data.other_allowances && typeof data.other_allowances === 'object'
    ? Object.values(data.other_allowances as Record<string, number>).reduce((s, v) => s + Number(v || 0), 0)
    : 0
  return round(
    Number(data.basic_salary || 0) + Number(data.housing_allowance || 0) +
    Number(data.transport_allowance || 0) + Number(data.medical_allowance || 0) + other
  )
}

/**
 * Create (or reuse) a draft payroll run for a period and generate payslips.
 * Idempotent per (company, period): re-running replaces the draft's payslips.
 */
export async function createPayrollRun(params: {
  companyId: string
  periodStart: string
  periodEnd: string
  userId: string
}): Promise<{ runId?: string; count: number; error?: string }> {
  const { companyId, periodStart, periodEnd, userId } = params

  const { data: employees } = await supabase
    .from('company_employees')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'active')

  const slips: any[] = []
  for (const emp of employees || []) {
    const gross = await grossFromStructure(companyId, emp.id)
    if (gross <= 0) continue
    const { nssf, paye, net } = calcPAYE(gross)
    slips.push({
      company_id: companyId,
      employee_id: emp.id,
      payroll_period_start: periodStart,
      payroll_period_end: periodEnd,
      gross_salary: gross,
      nssf_contribution: nssf,
      taxable_amount: round(gross - nssf),
      paye_tax: paye,
      net_salary: net,
      status: 'draft',
      currency: 'UGX',
    })
  }

  if (slips.length === 0) return { count: 0, error: 'No employees with a salary structure for this period' }

  const totals = slips.reduce(
    (acc, s) => ({
      gross: acc.gross + s.gross_salary,
      nssf: acc.nssf + s.nssf_contribution,
      paye: acc.paye + s.paye_tax,
      net: acc.net + s.net_salary,
    }),
    { gross: 0, nssf: 0, paye: 0, net: 0 }
  )

  const { data: run, error: runErr } = await supabase
    .from('payroll_runs')
    .upsert(
      {
        company_id: companyId,
        period_start: periodStart,
        period_end: periodEnd,
        status: 'draft',
        employee_count: slips.length,
        total_gross: round(totals.gross),
        total_nssf: round(totals.nssf),
        total_paye: round(totals.paye),
        total_net: round(totals.net),
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,period_start,period_end' }
    )
    .select('id')
    .single()

  if (runErr || !run) return { count: 0, error: runErr?.message || 'Could not create the payroll run' }

  await supabase.from('payroll_records').delete().eq('payroll_run_id', run.id)
  const withRun = slips.map((s) => ({ ...s, payroll_run_id: run.id }))
  const { error: slipErr } = await supabase.from('payroll_records').insert(withRun)
  if (slipErr) return { count: 0, error: slipErr.message }

  return { runId: run.id, count: slips.length }
}

/** Approve a run: freeze it and post the payroll journal. */
export async function approvePayrollRun(runId: string, userId: string): Promise<{ error?: string }> {
  const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', runId).single()
  if (!run) return { error: 'Payroll run not found' }

  const { error } = await supabase
    .from('payroll_runs')
    .update({ status: 'approved', approved_by: userId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', runId)
  if (error) return { error: error.message }

  await postEntry({
    companyId: run.company_id,
    entryDate: run.period_end,
    memo: `Payroll ${run.period_start} to ${run.period_end}`,
    sourceModule: 'payroll_run',
    sourceId: runId,
    lines: [
      { account_code: '6000', debit: Number(run.total_gross), memo: 'Gross salaries' },
      { account_code: '2200', credit: Number(run.total_paye), memo: 'PAYE payable to URA' },
      { account_code: '2300', credit: Number(run.total_nssf), memo: 'NSSF payable' },
      { account_code: '2400', credit: Number(run.total_net), memo: 'Net salaries payable' },
    ],
    createdBy: userId,
  })
  return {}
}

/** Mark one payslip paid once its disbursement succeeds; post the cash movement. */
export async function markPayslipPaid(params: {
  recordId: string
  paymentId?: string
  userId: string
}): Promise<void> {
  const { data: rec } = await supabase.from('payroll_records').select('*').eq('id', params.recordId).single()
  if (!rec) return
  await supabase
    .from('payroll_records')
    .update({ status: 'paid', payment_id: params.paymentId || null, paid_at: new Date().toISOString() })
    .eq('id', params.recordId)

  await postEntry({
    companyId: rec.company_id,
    memo: `Salary paid (payslip ${rec.id.slice(0, 8)})`,
    sourceModule: 'payslip',
    sourceId: params.recordId,
    lines: [
      { account_code: '2400', debit: Number(rec.net_salary), memo: 'Clear net salary payable' },
      { account_code: '1000', credit: Number(rec.net_salary), memo: 'Cash disbursed' },
    ],
    createdBy: params.userId,
  })
}

/** Mark the current period's payslip for an employee as paid. */
export async function markPayslipPaidByEmployee(params: {
  companyId: string
  employeeId: string
  paymentId?: string
  userId: string
}): Promise<void> {
  const { data: rec } = await supabase
    .from('payroll_records')
    .select('id')
    .eq('company_id', params.companyId)
    .eq('employee_id', params.employeeId)
    .eq('status', 'draft')
    .order('payroll_period_start', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!rec) return
  await markPayslipPaid({ recordId: rec.id, paymentId: params.paymentId, userId: params.userId })
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
