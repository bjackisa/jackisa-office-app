import { NextRequest, NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { requireCompanyAdmin } from '@/lib/lic/serverAuth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/reports/income-tax
 * Body: { companyId, periodStart?, periodEnd? }
 *
 * Gathers the company's income and allowable expenses from Supabase, then asks
 * lic.jackisa.com to compute the Uganda income-tax position (presumptive vs
 * standard rate). Admin-only: financials are sensitive.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const companyId = String(body?.companyId || '')
  if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 })

  const gate = await requireCompanyAdmin(req, companyId)
  if ('error' in gate) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })

  const db = adminClient()
  const periodStart = String(body?.periodStart || `${new Date().getFullYear()}-01-01`)
  const periodEnd = String(body?.periodEnd || new Date().toISOString().slice(0, 10))

  const [{ data: invoices }, { data: expenses }, { data: sales }, { data: vat }] = await Promise.all([
    db.from('invoices').select('invoice_number, total_amount, tax_amount, status, invoice_date, customer_name').eq('company_id', companyId).gte('invoice_date', periodStart).lte('invoice_date', periodEnd),
    db.from('expenses').select('description, category, amount, expense_date, status').eq('company_id', companyId).gte('expense_date', periodStart).lte('expense_date', periodEnd),
    db.from('sales_orders').select('total_amount, tax_amount, status, order_date').eq('company_id', companyId).gte('order_date', periodStart).lte('order_date', periodEnd),
    db.from('vat_records').select('output_vat, input_vat, net_vat_payable, period_start, period_end').eq('company_id', companyId),
  ])

  const gross =
    (invoices || []).filter((i: any) => i.status !== 'cancelled').reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0) +
    (sales || []).filter((o: any) => o.status !== 'cancelled').reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0)
  const allowable = (expenses || []).filter((e: any) => e.status !== 'rejected').reduce((s: number, e: any) => s + Number(e.amount || 0), 0)
  const vatInput = (vat || []).reduce((s: number, v: any) => s + Number(v.input_vat || 0), 0)
  const vatOutput = (vat || []).reduce((s: number, v: any) => s + Number(v.output_vat || 0), 0)

  const res = await lic.incomeTax({
    tenant_id: companyId,
    gross_income: round(gross),
    allowable_expenses: round(allowable),
    vat_input: round(vatInput),
    vat_output: round(vatOutput),
    period_start: periodStart,
    period_end: periodEnd,
  })

  if (res.api_status !== '200' || !res.data) {
    return NextResponse.json({ ok: false, error: res.errors?.error_text || 'Tax computation failed' }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    data: {
      ...res.data,
      line_items: {
        invoices: invoices || [],
        expenses: expenses || [],
      },
    },
  })
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
