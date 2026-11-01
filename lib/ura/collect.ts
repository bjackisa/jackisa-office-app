/**
 * Assembles a URA return bundle from the company's own records.
 *
 * This is the "fill in the return" step: it reads invoices, sales orders,
 * expenses, credit/debit notes, the chart of accounts (assets/liabilities) and
 * any adjustments the user added, then hands everything to the income-tax
 * computation. For PAYE it reads the latest salary structure per employee and
 * computes PAYE per person with the shared Uganda rules.
 *
 * Server-only (uses the service-role client).
 */

import { adminClient } from '@/lib/lic/peer'
import { calcIncomeTax, calcPaye, round2, PRESUMPTIVE_THRESHOLD } from './uganda-tax'
import { dueDateFor, type UraReturnBundle, type UraIncomeTaxData, type UraLine, type UraPayeData, type UraPayeEmployee, type TaxAdjustment } from './types'

interface CollectArgs {
  companyId: string
  periodStart: string
  periodEnd: string
}

export interface TaxpayerRow {
  name: string
  tin: string | null
  email: string | null
  phone: string | null
  address: string | null
}

export async function loadTaxpayer(companyId: string): Promise<TaxpayerRow> {
  const db = adminClient()
  const { data } = await db
    .from('companies')
    .select('name, tin, tax_id, email, phone, address')
    .eq('id', companyId)
    .maybeSingle()
  const c = (data || {}) as any
  return {
    name: c.name || 'Unnamed company',
    // `tin` was added by the migration; `tax_id` is the original column. Accept
    // either so a return can be built before the backfill runs.
    tin: c.tin || c.tax_id || null,
    email: c.email || null,
    phone: c.phone || null,
    address: c.address || null,
  }
}

/**
 * Run a Supabase read that may legitimately fail (table/column absent, empty
 * period) and return an empty list instead of breaking the whole return.
 */
async function safe<T = any>(promise: PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  try {
    const { data, error } = await promise
    if (error) return []
    return (data || []) as T[]
  } catch {
    return []
  }
}

/** True when two [start,end] date ranges overlap (string ISO dates). */
function overlaps(aStart?: string | null, aEnd?: string | null, bStart?: string, bEnd?: string): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return true
  return aStart <= bEnd && aEnd >= bStart
}

function periodLabel(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return `${start} to ${end}`
  const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()
  if (sameMonth) return s.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  return `${s.toLocaleDateString('en-GB')} – ${e.toLocaleDateString('en-GB')}`
}

export async function loadAdjustments(companyId: string, returnType: 'income_tax' | 'paye', periodStart?: string, periodEnd?: string): Promise<TaxAdjustment[]> {
  const db = adminClient()
  const data = await safe(db.from('tax_adjustments').select('*').eq('company_id', companyId).eq('return_type', returnType))
  // Keep adjustments whose period overlaps the requested one, plus ones with no period.
  return (data as any[]).filter((a) => overlaps(a.period_start, a.period_end, periodStart, periodEnd))
}

// ---------------------------------------------------------------------------
// Income tax
// ---------------------------------------------------------------------------

export async function collectIncomeTax(args: CollectArgs): Promise<UraIncomeTaxData> {
  const db = adminClient()
  const { companyId, periodStart, periodEnd } = args

  const [invoices, expenses, sales, creditNotes, debitNotes, vat, accounts, adjustments] = await Promise.all([
    safe(db.from('invoices').select('invoice_number, invoice_date, customer_name, total_amount, tax_amount, status').eq('company_id', companyId).gte('invoice_date', periodStart).lte('invoice_date', periodEnd)),
    safe(db.from('expenses').select('expense_date, category, description, amount, status').eq('company_id', companyId).gte('expense_date', periodStart).lte('expense_date', periodEnd)),
    safe(db.from('sales_orders').select('order_number, order_date, customer_name, total_amount, tax_amount, status').eq('company_id', companyId).gte('order_date', periodStart).lte('order_date', periodEnd)),
    safe(db.from('credit_notes').select('credit_note_number, credit_date, reason, amount').eq('company_id', companyId).gte('credit_date', periodStart).lte('credit_date', periodEnd)),
    safe(db.from('debit_notes').select('debit_note_number, debit_date, reason, amount').eq('company_id', companyId).gte('debit_date', periodStart).lte('debit_date', periodEnd)),
    safe(db.from('vat_records').select('output_vat, input_vat, net_vat_payable, period_start, period_end').eq('company_id', companyId)),
    safe(db.from('accounting_accounts').select('account_code, account_name, account_type, balance').eq('company_id', companyId)),
    loadAdjustments(companyId, 'income_tax', periodStart, periodEnd),
  ])

  const invLines: UraLine[] = (invoices || [])
    .filter((i: any) => i.status !== 'cancelled')
    .map((i: any) => ({ section: 'Income', date: i.invoice_date, reference: i.invoice_number, description: i.customer_name, amount: Number(i.total_amount || 0), status: i.status }))

  const salesLines: UraLine[] = (sales || [])
    .filter((o: any) => o.status !== 'cancelled')
    .map((o: any) => ({ section: 'Income', date: o.order_date, reference: o.order_number, description: o.customer_name || 'Sales order', amount: Number(o.total_amount || 0), status: o.status }))

  // A credit note reduces income.
  const creditLines: UraLine[] = (creditNotes || []).map((c: any) => ({
    section: 'Income', date: c.credit_date, reference: c.credit_note_number, description: `Credit note — ${c.reason || ''}`.trim(), amount: -Math.abs(Number(c.amount || 0)),
  }))

  const expenseLines: UraLine[] = (expenses || [])
    .filter((e: any) => e.status !== 'rejected')
    .map((e: any) => ({ section: 'Expense', date: e.expense_date, reference: '', description: `${e.category || ''} ${e.description || ''}`.trim(), amount: Number(e.amount || 0), status: e.status }))

  const debitLines: UraLine[] = (debitNotes || []).map((d: any) => ({
    section: 'Expense', date: d.debit_date, reference: d.debit_note_number, description: `Debit note — ${d.reason || ''}`.trim(), amount: Math.abs(Number(d.amount || 0)),
  }))

  const grossIncome = round2(
    invLines.reduce((s, l) => s + (l.amount || 0), 0) +
    salesLines.reduce((s, l) => s + (l.amount || 0), 0) +
    creditLines.reduce((s, l) => s + (l.amount || 0), 0),
  )
  const allowableExpenses = round2(expenseLines.reduce((s, l) => s + (l.amount || 0), 0) + debitLines.reduce((s, l) => s + (l.amount || 0), 0))

  const additions = round2(adjustments.filter((a) => a.kind === 'addition').reduce((s, a) => s + Number(a.amount || 0), 0))
  const deductions = round2(adjustments.filter((a) => a.kind === 'deduction').reduce((s, a) => s + Number(a.amount || 0), 0))
  // Assets/liabilities come from the chart of accounts where it is populated,
  // and from user-added rows otherwise.
  const acctAssets = round2((accounts || []).filter((a: any) => String(a.account_type || '').toLowerCase() === 'asset').reduce((s: number, a: any) => s + Number(a.balance || 0), 0))
  const acctLiabilities = round2((accounts || []).filter((a: any) => String(a.account_type || '').toLowerCase() === 'liability').reduce((s: number, a: any) => s + Number(a.balance || 0), 0))
  const totalAssets = round2(acctAssets + adjustments.filter((a) => a.kind === 'asset').reduce((s, a) => s + Number(a.amount || 0), 0))
  const totalLiabilities = round2(acctLiabilities + adjustments.filter((a) => a.kind === 'liability').reduce((s, a) => s + Number(a.amount || 0), 0))

  const computation = calcIncomeTax({ grossIncome, allowableExpenses, additions, deductions })

  // Only VAT records whose period overlaps the return period belong to it.
  const periodVat = (vat || []).filter((v: any) => overlaps(v.period_start, v.period_end, periodStart, periodEnd))
  const outputVat = round2(periodVat.reduce((s: number, v: any) => s + Number(v.output_vat || 0), 0))
  const inputVat = round2(periodVat.reduce((s: number, v: any) => s + Number(v.input_vat || 0), 0))

  return {
    lines: [...invLines, ...salesLines, ...creditLines, ...expenseLines, ...debitLines],
    invoices: invLines,
    sales: salesLines,
    expenses: expenseLines,
    creditNotes: creditLines,
    debitNotes: debitLines,
    adjustments,
    vat: { outputVat, inputVat, netVat: round2(outputVat - inputVat) },
    totals: { grossIncome, allowableExpenses, additions, deductions, totalAssets, totalLiabilities },
    computation,
  }
}

// ---------------------------------------------------------------------------
// PAYE
// ---------------------------------------------------------------------------

export async function collectPaye(args: CollectArgs): Promise<UraPayeData> {
  const db = adminClient()
  const { companyId, periodStart, periodEnd } = args

  // Prefer an approved/paid payroll run for the period; fall back to current
  // salary structures so a company that never ran payroll can still file.
  const { data: run } = await db
    .from('payroll_runs')
    .select('id, status, total_paye, total_gross, total_nssf, total_net, employee_count')
    .eq('company_id', companyId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle()

  const employees: UraPayeEmployee[] = []
  let payePaid = 0

  if (run?.id) {
    payePaid = Number((run as any).total_paye || 0)
    // payroll_records.employee_id references company_employees.id (not users.id),
    // so join the employee row and its user for the name.
    const records = await safe(db
      .from('payroll_records')
      .select('employee_id, gross_salary, nssf_contribution, taxable_amount, paye_tax, net_salary, company_employees(employee_id_number, nssf_number, salary_structures(basic_salary, housing_allowance, transport_allowance, medical_allowance, other_allowances, is_current), users(full_name))')
      .eq('company_id', companyId)
      .eq('payroll_run_id', run.id))
    for (const r of records as any[]) {
      const e = r.company_employees
      const struct = currentStructure(e)
      employees.push({
        name: e?.users?.full_name || 'Employee',
        nssfNumber: e?.nssf_number || undefined,
        periodStart, periodEnd,
        basicSalary: Number(struct?.basic_salary || 0),
        housingAllowance: Number(struct?.housing_allowance || 0),
        transportAllowance: Number(struct?.transport_allowance || 0),
        medicalAllowance: Number(struct?.medical_allowance || 0),
        otherAllowances: Number(struct?.other_allowances || 0),
        grossSalary: Number(r.gross_salary || 0),
        nssf: Number(r.nssf_contribution || 0),
        taxableIncome: Number(r.taxable_amount || 0),
        paye: Number(r.paye_tax || 0),
        netPay: Number(r.net_salary || 0),
      })
    }
  } else {
    const structs = await safe(db
      .from('salary_structures')
      .select('basic_salary, housing_allowance, transport_allowance, medical_allowance, other_allowances, is_current, company_employees(employee_id_number, nssf_number, users(full_name))')
      .eq('company_id', companyId)
      .eq('is_current', true))

    for (const s of structs as any[]) {
      const e = s.company_employees
      const basic = Number(s.basic_salary || 0)
      const housing = Number(s.housing_allowance || 0)
      const transport = Number(s.transport_allowance || 0)
      const medical = Number(s.medical_allowance || 0)
      const other = Number(s.other_allowances || 0)
      const gross = round2(basic + housing + transport + medical + other)
      const paye = calcPaye(gross)
      employees.push({
        name: e?.users?.full_name || 'Employee',
        nssfNumber: e?.nssf_number || undefined,
        periodStart, periodEnd,
        basicSalary: basic, housingAllowance: housing, transportAllowance: transport, medicalAllowance: medical, otherAllowances: other,
        grossSalary: gross,
        nssf: paye.nssfContribution,
        taxableIncome: paye.taxableIncome,
        paye: paye.totalPaye,
        netPay: paye.netPay,
      })
    }
  }

  const totals = {
    employees: employees.length,
    grossSalary: round2(employees.reduce((s, e) => s + e.grossSalary, 0)),
    nssf: round2(employees.reduce((s, e) => s + e.nssf, 0)),
    taxableIncome: round2(employees.reduce((s, e) => s + e.taxableIncome, 0)),
    paye: round2(employees.reduce((s, e) => s + e.paye, 0)),
    netPay: round2(employees.reduce((s, e) => s + e.netPay, 0)),
  }

  return { employees, totals, payePaid }
}

function currentStructure(e: any) {
  const list = Array.isArray(e?.salary_structures) ? e.salary_structures : e?.salary_structures ? [e.salary_structures] : []
  return list.find((s: any) => s.is_current) || list[0] || null
}

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

export async function buildBundle(companyId: string, returnType: 'income_tax' | 'paye', periodStart: string, periodEnd: string): Promise<UraReturnBundle> {
  const taxpayer = await loadTaxpayer(companyId)
  const bundle: UraReturnBundle = {
    returnType,
    taxpayer: {
      companyId,
      name: taxpayer.name,
      tin: taxpayer.tin || '',
      email: taxpayer.email || undefined,
      phone: taxpayer.phone || undefined,
      address: taxpayer.address || undefined,
    },
    period: { start: periodStart, end: periodEnd, label: periodLabel(periodStart, periodEnd) },
    currency: 'UGX',
    generatedAt: new Date().toISOString(),
  }
  bundle.period.dueDate = dueDateFor(returnType, bundle.period)

  if (returnType === 'income_tax') bundle.incomeTax = await collectIncomeTax({ companyId, periodStart, periodEnd })
  else bundle.paye = await collectPaye({ companyId, periodStart, periodEnd })

  return bundle
}

export { PRESUMPTIVE_THRESHOLD }
