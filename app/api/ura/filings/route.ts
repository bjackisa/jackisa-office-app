import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/lib/lic/guard'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { URA_FEATURE } from '@/lib/ura/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ura/filings?companyId=&returnType=
 *
 * The filing history: every return generated for the company, newest first.
 */
export async function GET(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const { searchParams } = new URL(req.url)
  const companyId = String(searchParams.get('companyId') || '')
  const returnType = String(searchParams.get('returnType') || '')
  if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 })

  const gate = await requireFeature(req, companyId, URA_FEATURE)
  if ('error' in gate) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })

  const db = adminClient()
  let query = db
    .from('ura_filings')
    .select('id, return_type, period_start, period_end, status, taxpayer_name, tin, gross_income, allowable_expenses, chargeable_income, tax_payable, gross_salary, total_paye, employee_count, validation_ok, summary, deliver_to, created_at')
    .eq('company_id', companyId)
    .order('period_start', { ascending: false })
    .limit(60)
  if (returnType === 'income_tax' || returnType === 'paye') query = query.eq('return_type', returnType)
  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data || [] })
}
