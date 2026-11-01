/**
 * Shared URA e-filing types.
 *
 * These are import-safe from both the server (API routes, workbook builder)
 * and the client (the filing screen), so no server-only module is pulled in.
 */

import type { IncomeTaxResult } from './uganda-tax'

export type UraReturnType = 'income_tax' | 'paye'

export interface UraTaxpayer {
  companyId: string
  name: string
  tin: string
  email?: string
  phone?: string
  address?: string
}

export interface UraPeriod {
  start: string
  end: string
  /** Human label, e.g. "Jan 2026" or "2025/26". */
  label: string
  /** Statutory filing deadline (ISO date), when known. */
  dueDate?: string
}

/** An arbitrary row the user adds to strengthen the return. */
export interface TaxAdjustment {
  id?: string
  company_id?: string
  return_type: UraReturnType
  period_start?: string | null
  period_end?: string | null
  /** income | expense | asset | liability | addition | deduction */
  kind: string
  label: string
  amount: number
  reference?: string | null
  notes?: string | null
  created_at?: string
}

export interface UraLine {
  section: string
  date?: string
  reference?: string
  description?: string
  tin?: string
  /** Expense / credit side. */
  debit?: number
  /** Income / debit side. */
  credit?: number
  amount?: number
  status?: string
}

export interface UraIncomeTaxData {
  lines: UraLine[]
  invoices: UraLine[]
  sales: UraLine[]
  expenses: UraLine[]
  creditNotes: UraLine[]
  debitNotes: UraLine[]
  adjustments: TaxAdjustment[]
  vat: { outputVat: number; inputVat: number; netVat: number }
  totals: {
    grossIncome: number
    allowableExpenses: number
    additions: number
    deductions: number
    totalAssets: number
    totalLiabilities: number
  }
  computation: IncomeTaxResult
}

export interface UraPayeEmployee {
  name: string
  tin?: string
  nssfNumber?: string
  periodStart: string
  periodEnd: string
  basicSalary: number
  housingAllowance: number
  transportAllowance: number
  medicalAllowance: number
  otherAllowances: number
  grossSalary: number
  nssf: number
  taxableIncome: number
  paye: number
  netPay: number
}

export interface UraPayeData {
  employees: UraPayeEmployee[]
  totals: {
    employees: number
    grossSalary: number
    nssf: number
    taxableIncome: number
    paye: number
    netPay: number
  }
  /** PAYE already remitted for the period, when known. */
  payePaid: number
}

export interface UraReturnBundle {
  returnType: UraReturnType
  taxpayer: UraTaxpayer
  period: UraPeriod
  currency: string
  generatedAt: string
  incomeTax?: UraIncomeTaxData
  paye?: UraPayeData
}

export type ValidationSeverity = 'error' | 'warning' | 'pass'

export interface ValidationFinding {
  severity: ValidationSeverity
  code: string
  message: string
  /** Which sheet/field the finding relates to. */
  field?: string
}

export interface ValidationReport {
  ok: boolean
  errors: number
  warnings: number
  passed: number
  findings: ValidationFinding[]
  checkedAt: string
}

export interface UraFilingRecord {
  id?: string
  company_id?: string
  return_type: UraReturnType
  period_start: string
  period_end: string
  status: string
  taxpayer_name?: string
  tin?: string
  gross_income?: number
  allowable_expenses?: number
  chargeable_income?: number
  tax_payable?: number
  gross_salary?: number
  total_paye?: number
  employee_count?: number
  validation_ok?: boolean
  validation?: ValidationReport | null
  summary?: Record<string, any> | null
  deliver_to?: string[] | null
  created_by?: string
  created_at?: string
  updated_at?: string
}

/** Statutory due dates (best-effort; Uganda financial year runs Jul–Jun). */
export function dueDateFor(returnType: UraReturnType, period: { start: string; end: string }): string | undefined {
  const end = new Date(period.end)
  if (isNaN(end.getTime())) return undefined
  if (returnType === 'paye') {
    // PAYE is due by the 15th of the following month.
    const d = new Date(end.getFullYear(), end.getMonth() + 1, 15)
    return iso(d)
  }
  // Final corporate return: 6 months after the accounting year end.
  const d = new Date(end.getFullYear(), end.getMonth() + 6, end.getDate())
  return iso(d)
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
