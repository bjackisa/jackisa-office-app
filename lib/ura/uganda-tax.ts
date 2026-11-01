/**
 * Uganda tax rules in one place.
 *
 * The PAYE bands and the corporate income-tax rates were previously duplicated
 * (app/app/hr/paye/page.tsx, lib/payroll.ts, app/api/reports/income-tax/csv).
 * Everything URA-facing now reads them from here so a Finance Act change is a
 * one-line edit, and the URA workbook builder, the validator and the screens
 * all agree on the same numbers.
 *
 * Rates are the 2025/26 Uganda rates. Keep `PRESUMPTIVE_THRESHOLD` in sync with
 * the `tax.presumptive_threshold` config on lic.jackisa.com.
 */

export const NSSF_EMPLOYEE_RATE = 0.05
export const NSSF_EMPLOYER_RATE = 0.10
export const STANDARD_CORPORATE_RATE = 0.30
export const PRESUMPTIVE_RATE = 0.01
export const PRESUMPTIVE_THRESHOLD = 150_000_000
export const VAT_RATE = 0.18

export interface PayeBand {
  lower: number
  /** `null` means "and above". */
  upper: number | null
  rate: number
  description: string
}

/** Monthly PAYE bands, in order. */
export const PAYE_BANDS: PayeBand[] = [
  { lower: 0, upper: 235_000, rate: 0, description: 'Tax-free threshold' },
  { lower: 235_000, upper: 335_000, rate: 0.1, description: '10% band' },
  { lower: 335_000, upper: 410_000, rate: 0.2, description: '20% band' },
  { lower: 410_000, upper: 10_000_000, rate: 0.3, description: '30% band' },
  { lower: 10_000_000, upper: null, rate: 0.4, description: '40% band (excess over 10m)' },
]

export interface PayeBandLine {
  bandDescription: string
  taxableAmount: number
  rate: number
  tax: number
}

export interface PayeResult {
  grossSalary: number
  nssfContribution: number
  taxableIncome: number
  bands: PayeBandLine[]
  totalPaye: number
  netPay: number
}

/** Progressive monthly PAYE on a gross salary, after the 5% NSSF deduction. */
export function calcPaye(grossSalary: number): PayeResult {
  const gross = Math.max(0, Number(grossSalary) || 0)
  const nssfContribution = round2(gross * NSSF_EMPLOYEE_RATE)
  const taxableIncome = round2(gross - nssfContribution)

  let remaining = taxableIncome
  let totalPaye = 0
  const bands: PayeBandLine[] = []

  for (const band of PAYE_BANDS) {
    if (remaining <= 0) break
    const width = band.upper === null ? remaining : band.upper - band.lower
    const taxableInBand = Math.min(remaining, width)
    const tax = taxableInBand * band.rate
    bands.push({
      bandDescription: band.description,
      taxableAmount: round2(taxableInBand),
      rate: band.rate,
      tax: round2(tax),
    })
    totalPaye += tax
    remaining -= taxableInBand
  }

  return {
    grossSalary: round2(gross),
    nssfContribution,
    taxableIncome,
    bands,
    totalPaye: round2(totalPaye),
    netPay: round2(gross - nssfContribution - totalPaye),
  }
}

export interface IncomeTaxInput {
  grossIncome: number
  allowableExpenses: number
  /** Adjustments the user added (add-backs, capital allowances, losses, …). */
  additions?: number
  deductions?: number
}

export interface IncomeTaxResult {
  grossIncome: number
  allowableExpenses: number
  additions: number
  deductions: number
  chargeableIncome: number
  presumptive: boolean
  rate: number
  taxPayable: number
  minimumTax: number
}

/**
 * Uganda corporate income tax. Chargeable income at or below the presumptive
 * threshold is taxed at 1%, above it at the standard 30% rate.
 */
export function calcIncomeTax(input: IncomeTaxInput): IncomeTaxResult {
  const grossIncome = round2(Math.max(0, Number(input.grossIncome) || 0))
  const allowableExpenses = round2(Math.max(0, Number(input.allowableExpenses) || 0))
  const additions = round2(Number(input.additions) || 0)
  const deductions = round2(Number(input.deductions) || 0)

  const chargeableIncome = round2(Math.max(0, grossIncome - allowableExpenses + additions - deductions))
  const presumptive = chargeableIncome <= PRESUMPTIVE_THRESHOLD
  const rate = presumptive ? PRESUMPTIVE_RATE : STANDARD_CORPORATE_RATE
  const taxPayable = round2(chargeableIncome * rate)

  return {
    grossIncome,
    allowableExpenses,
    additions,
    deductions,
    chargeableIncome,
    presumptive,
    rate,
    taxPayable,
    minimumTax: 0,
  }
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Format a number as a whole-shilling UGX string. */
export function ugx(n: number): string {
  return `UGX ${Math.round(Number(n) || 0).toLocaleString('en-US')}`
}
