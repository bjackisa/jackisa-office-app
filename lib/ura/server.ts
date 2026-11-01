/**
 * Server-side orchestration for the URA e-filing feature.
 *
 * One place that: gates the caller, assembles the return bundle from the
 * company's records, runs the URA validation, renders the workbook and records
 * the filing. The API routes stay thin and only differ in what they return.
 */

import { NextRequest } from 'next/server'
import { requireFeature } from '@/lib/lic/guard'
import { adminClient } from '@/lib/lic/peer'
import { buildBundle } from './collect'
import { validateReturn } from './validate'
import { buildWorkbook } from './workbook'
import { calcPaye } from './uganda-tax'
import type { UraReturnBundle, UraReturnType, UraFilingRecord, ValidationReport } from './types'

export const URA_FEATURE = 'ura_efiling'

export interface PreparedReturn {
  bundle: UraReturnBundle
  validation: ValidationReport
  summary: Record<string, any>
  workbook: Buffer
}

export function isReturnType(v: any): v is UraReturnType {
  return v === 'income_tax' || v === 'paye'
}

/** Validate the request body, returning a normalised shape or an error. */
export function parseBody(body: any): { companyId: string; returnType: UraReturnType; periodStart: string; periodEnd: string } | { error: string } {
  const companyId = String(body?.companyId || '')
  if (!companyId) return { error: 'companyId is required' }
  const returnType = body?.returnType
  if (!isReturnType(returnType)) return { error: 'returnType must be income_tax or paye' }
  const periodStart = String(body?.periodStart || `${new Date().getFullYear()}-01-01`)
  const periodEnd = String(body?.periodEnd || new Date().toISOString().slice(0, 10))
  if (Number.isNaN(Date.parse(periodStart)) || Number.isNaN(Date.parse(periodEnd))) {
    return { error: 'periodStart and periodEnd must be valid dates' }
  }
  if (Date.parse(periodStart) > Date.parse(periodEnd)) return { error: 'periodStart must be before periodEnd' }
  return { companyId, returnType, periodStart, periodEnd }
}

/** Gate + build + validate + render. Throws on gate failure via the returned error. */
export async function prepareReturn(
  req: NextRequest,
  params: { companyId: string; returnType: UraReturnType; periodStart: string; periodEnd: string },
): Promise<PreparedReturn | { error: string; status: number }> {
  const gate = await requireFeature(req, params.companyId, URA_FEATURE)
  if ('error' in gate) return gate

  const bundle = await buildBundle(params.companyId, params.returnType, params.periodStart, params.periodEnd)
  const validation = validateReturn(bundle)
  const summary = summarise(bundle)
  const workbook = await buildWorkbook(bundle, validation)
  return { bundle, validation, summary, workbook }
}

export function summarise(bundle: UraReturnBundle): Record<string, any> {
  if (bundle.returnType === 'income_tax') {
    const c = bundle.incomeTax!.computation
    const t = bundle.incomeTax!.totals
    return {
      grossIncome: t.grossIncome,
      allowableExpenses: t.allowableExpenses,
      additions: t.additions,
      deductions: t.deductions,
      chargeableIncome: c.chargeableIncome,
      taxPayable: c.taxPayable,
      rate: c.rate,
      presumptive: c.presumptive,
      totalAssets: t.totalAssets,
      totalLiabilities: t.totalLiabilities,
      lineCount: bundle.incomeTax!.lines.length,
    }
  }
  const p = bundle.paye!.totals
  return {
    employees: p.employees,
    grossSalary: p.grossSalary,
    nssf: p.nssf,
    taxableIncome: p.taxableIncome,
    taxPayable: p.paye,
    netPay: p.netPay,
    payePaid: bundle.paye!.payePaid,
  }
}

/** Gate + build + validate, without rendering the workbook (for preview). */
export async function previewReturn(
  req: NextRequest,
  params: { companyId: string; returnType: UraReturnType; periodStart: string; periodEnd: string },
): Promise<{ bundle: UraReturnBundle; validation: ValidationReport; summary: Record<string, any> } | { error: string; status: number }> {
  const gate = await requireFeature(req, params.companyId, URA_FEATURE)
  if ('error' in gate) return gate
  const bundle = await buildBundle(params.companyId, params.returnType, params.periodStart, params.periodEnd)
  const validation = validateReturn(bundle)
  return { bundle, validation, summary: summarise(bundle) }
}

/** Persist a filing record (upsert on company+type+period). */
export async function recordFiling(
  companyId: string,
  prepared: PreparedReturn,
  createdBy: string | null,
  status: UraFilingRecord['status'] = 'validated',
  deliverTo?: string[],
): Promise<UraFilingRecord | null> {
  const db = adminClient()
  const { bundle, validation, summary } = prepared
  const row: Record<string, any> = {
    company_id: companyId,
    return_type: bundle.returnType,
    period_start: bundle.period.start,
    period_end: bundle.period.end,
    status,
    taxpayer_name: bundle.taxpayer.name,
    tin: bundle.taxpayer.tin || null,
    validation_ok: validation.ok,
    validation,
    summary,
    created_by: createdBy,
  }
  if (bundle.returnType === 'income_tax') {
    row.gross_income = summary.grossIncome
    row.allowable_expenses = summary.allowableExpenses
    row.chargeable_income = summary.chargeableIncome
    row.tax_payable = summary.taxPayable
  } else {
    row.gross_salary = summary.grossSalary
    row.total_paye = summary.taxPayable
    row.employee_count = summary.employees
  }
  if (deliverTo) row.deliver_to = deliverTo

  const { data: existing } = await db
    .from('ura_filings')
    .select('id')
    .eq('company_id', companyId)
    .eq('return_type', bundle.returnType)
    .eq('period_start', bundle.period.start)
    .eq('period_end', bundle.period.end)
    .maybeSingle()

  if (existing?.id) {
    const { data } = await db.from('ura_filings').update(row).eq('id', existing.id).select().maybeSingle()
    return (data as UraFilingRecord) || null
  }
  const { data } = await db.from('ura_filings').insert(row).select().maybeSingle()
  return (data as UraFilingRecord) || null
}

/** Resolve the recipients a return should be delivered to. */
export async function resolveDelivery(companyId: string, opts: { emails?: string[]; whatsapp?: string[]; alsoAdmins?: boolean }) {
  const db = adminClient()
  const emails = new Set<string>()
  const phones = new Set<string>()

  const { data: company } = await db.from('companies').select('email, phone, name').eq('id', companyId).maybeSingle()
  if ((company as any)?.email) emails.add(String((company as any).email).toLowerCase())
  if ((company as any)?.phone) phones.add(String((company as any).phone))

  for (const e of opts.emails || []) if (e && e.includes('@')) emails.add(String(e).toLowerCase())
  for (const p of opts.whatsapp || []) if (p) phones.add(String(p))

  if (opts.alsoAdmins) {
    const { data: company } = await db.from('companies').select('created_by, owner_user_id').eq('id', companyId).maybeSingle()
    const ownerIds = [(company as any)?.created_by, (company as any)?.owner_user_id].filter(Boolean) as string[]

    const { data: admins } = await db
      .from('company_employees')
      .select('user_id, position, company_roles(name)')
      .eq('company_id', companyId)
      .eq('status', 'active')
    const adminUserIds = (admins || [])
      .filter((a: any) => /admin|owner|director|principal|manager/i.test(`${a.company_roles?.name || ''} ${a.position || ''}`))
      .map((a: any) => a.user_id)

    const ids = Array.from(new Set([...ownerIds, ...adminUserIds]))
    if (ids.length) {
      const { data: users } = await db.from('users').select('email, phone').in('id', ids)
      for (const u of users || []) {
        if ((u as any).email) emails.add(String((u as any).email).toLowerCase())
        if ((u as any).phone) phones.add(String((u as any).phone))
      }
    }
  }

  return { emails: Array.from(emails), phones: Array.from(phones) }
}

export { calcPaye }
