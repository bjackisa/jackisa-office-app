/**
 * Runs the checks the URA template macro would run before it lets you generate
 * the upload file: taxpayer identity present, period sane, every amount
 * non-negative, totals internally consistent. A return that fails here would be
 * rejected by the portal, so the app refuses to call it "ready" until it passes.
 */

import type {
  UraReturnBundle, ValidationFinding, ValidationReport,
} from './types'
import { round2 } from './uganda-tax'

const TIN_RE = /^[0-9]{10}$/

export function validateReturn(bundle: UraReturnBundle): ValidationReport {
  const findings: ValidationFinding[] = []
  const add = (severity: ValidationFinding['severity'], code: string, message: string, field?: string) =>
    findings.push({ severity, code, message, field })

  // --- Taxpayer identity ---------------------------------------------------
  if (!bundle.taxpayer.name || bundle.taxpayer.name.trim().length < 2) {
    add('error', 'TIN_NAME', 'Taxpayer name is required.', 'Return Details!B3')
  }
  const tin = (bundle.taxpayer.tin || '').replace(/\s/g, '')
  if (!tin) add('error', 'TIN_MISSING', 'TIN is required — the portal rejects returns without it.', 'Return Details!B4')
  else if (!TIN_RE.test(tin)) add('warning', 'TIN_FORMAT', 'TIN is normally 10 digits. Check it before uploading.', 'Return Details!B4')

  // --- Period --------------------------------------------------------------
  const start = Date.parse(bundle.period.start)
  const end = Date.parse(bundle.period.end)
  if (isNaN(start) || isNaN(end)) add('error', 'PERIOD_INVALID', 'The period dates are not valid dates.', 'Return Details')
  else if (start > end) add('error', 'PERIOD_ORDER', 'Period start is after period end.', 'Return Details')

  if (bundle.returnType === 'income_tax') validateIncomeTax(bundle, add)
  else validatePaye(bundle, add)

  const errors = findings.filter((f) => f.severity === 'error').length
  const warnings = findings.filter((f) => f.severity === 'warning').length
  const passed = findings.filter((f) => f.severity === 'pass').length

  if (!errors && !warnings) {
    add('pass', 'ALL_OK', 'All checks passed. This workbook is ready to upload to the URA portal.')
  }

  return {
    ok: errors === 0,
    errors,
    warnings,
    passed: passed || (errors === 0 ? 1 : 0),
    findings,
    checkedAt: new Date().toISOString(),
  }
}

type Add = (severity: ValidationFinding['severity'], code: string, message: string, field?: string) => void

function validateIncomeTax(bundle: UraReturnBundle, add: Add) {
  const data = bundle.incomeTax
  if (!data) {
    add('error', 'NO_DATA', 'No income tax data was collected for this period.')
    return
  }
  const { computation, totals } = data

  const badLines = data.lines.filter((l) => (l.amount ?? 0) < 0)
  if (badLines.length) add('warning', 'NEGATIVE_LINE', `${badLines.length} line(s) have a negative amount.`, 'Schedule A/B')

  if (totals.grossIncome <= 0) add('warning', 'NO_INCOME', 'Gross income is zero — this is a nil return.', 'Schedule A')
  if (totals.allowableExpenses > totals.grossIncome + totals.additions) {
    add('warning', 'EXPENSES_EXCEED_INCOME', 'Allowable expenses exceed income; chargeable income is nil.', 'Tax Computation')
  }

  // Internal consistency: recompute and compare.
  const expected = round2(Math.max(0, totals.grossIncome - totals.allowableExpenses + totals.additions - totals.deductions))
  if (Math.abs(expected - computation.chargeableIncome) > 0.5) {
    add('error', 'CHARGEABLE_MISMATCH', 'Chargeable income does not match income less expenses plus adjustments.', 'Tax Computation')
  }
  const expectedTax = round2(computation.chargeableIncome * computation.rate)
  if (Math.abs(expectedTax - computation.taxPayable) > 0.5) {
    add('error', 'TAX_MISMATCH', 'Tax payable does not match chargeable income at the applied rate.', 'Tax Computation')
  }
  if (computation.taxPayable > 0) {
    add('pass', 'TAX_COMPUTED', `Tax payable computed at ${(computation.rate * 100).toFixed(0)}%.`, 'Tax Computation')
  }
  // The balance sheet combines chart-of-accounts balances with rows the user
  // added, so compare against that combined figure.
  const addedAssets = round2(data.adjustments.filter((a) => a.kind === 'asset').reduce((s, a) => s + Number(a.amount || 0), 0))
  const expectedAssets = round2((totals.accountsAssets || 0) + addedAssets)
  if (Math.abs(totals.totalAssets - expectedAssets) > 0.5) {
    add('warning', 'ASSETS_MISMATCH', 'Statement of assets does not reconcile with the chart of accounts and added asset rows.', 'Schedule D')
  }
  const addedLiabilities = round2(data.adjustments.filter((a) => a.kind === 'liability').reduce((s, a) => s + Number(a.amount || 0), 0))
  const expectedLiabilities = round2((totals.accountsLiabilities || 0) + addedLiabilities)
  if (Math.abs(totals.totalLiabilities - expectedLiabilities) > 0.5) {
    add('warning', 'LIABILITIES_MISMATCH', 'Statement of liabilities does not reconcile with the chart of accounts and added liability rows.', 'Schedule D')
  }
}

function validatePaye(bundle: UraReturnBundle, add: Add) {
  const data = bundle.paye
  if (!data) {
    add('error', 'NO_DATA', 'No payroll data was collected for this period.')
    return
  }
  if (data.totals.employees === 0) {
    add('warning', 'NO_EMPLOYEES', 'No employees were found on payroll for this period — nil PAYE return.')
  }

  for (const e of data.employees) {
    if (!e.name || e.name.trim().length < 2) add('error', 'EMP_NAME', `An employee row is missing a name.`, 'Schedule 1')
    if (!e.tin) add('warning', 'EMP_TIN', `${e.name} has no TIN; URA prefers one per employee.`, 'Schedule 1')
    if (e.grossSalary < 0) add('error', 'EMP_NEGATIVE', `${e.name} has a negative gross salary.`, 'Schedule 1')
    const expectedGross = round2(e.basicSalary + e.housingAllowance + e.transportAllowance + e.medicalAllowance + e.otherAllowances)
    if (Math.abs(expectedGross - e.grossSalary) > 0.5) {
      add('error', 'EMP_GROSS_MISMATCH', `${e.name}'s gross salary does not equal the sum of its allowances.`, 'Schedule 1')
    }
    const expectedNssf = round2(e.grossSalary * 0.05)
    if (Math.abs(expectedNssf - e.nssf) > 0.5) {
      add('warning', 'EMP_NSSF_MISMATCH', `${e.name}'s NSSF is not 5% of gross.`, 'Schedule 1')
    }
    if (e.paye < 0) add('error', 'EMP_NEGATIVE_TAX', `${e.name} has negative PAYE.`, 'Schedule 1')
  }

  const sumPaye = round2(data.employees.reduce((s, e) => s + e.paye, 0))
  if (Math.abs(sumPaye - data.totals.paye) > 0.5) {
    add('error', 'PAYE_TOTAL_MISMATCH', 'Total PAYE does not equal the sum of employee PAYE.', 'Schedule 1')
  }
  if (data.payePaid > data.totals.paye + 0.5) {
    add('warning', 'OVERPAID', 'PAYE already paid exceeds the PAYE due; expect a credit.', 'Schedule 2')
  }
  if (data.totals.paye > 0) add('pass', 'PAYE_COMPUTED', 'PAYE computed for all employees.', 'Schedule 1')
}
