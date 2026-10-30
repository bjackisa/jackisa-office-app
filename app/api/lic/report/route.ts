import { NextRequest, NextResponse } from 'next/server'
import { adminClient, adminAvailable, verifyLicSignature } from '@/lib/lic/peer'

export const dynamic = 'force-dynamic'

/**
 * POST /api/lic/report — called BY lic.jackisa.com (signed).
 * Body: { tenant_id, kind: 'tax' | 'fund' }
 *
 * Gives lic the raw figures it needs to compute a Uganda income-tax snapshot or
 * a unit-trust NAV snapshot. The hub stores the result; the app never has to
 * run a cron job of its own.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!verifyLicSignature(raw, req.headers.get('x-lic-signature'), 'office')) {
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 })
  }
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })

  const body = JSON.parse(raw || '{}')
  const companyId = String(body?.tenant_id || '')
  const kind = String(body?.kind || 'tax')
  if (!companyId) return NextResponse.json({ ok: false, error: 'tenant_id is required' }, { status: 400 })

  const db = adminClient()

  if (kind === 'tax') {
    // Pull the company's income and expenses for the current fiscal year.
    const yearStart = `${new Date().getFullYear()}-01-01`
    const [{ data: invoices }, { data: expenses }, { data: sales }, { data: vat }] = await Promise.all([
      db.from('invoices').select('total_amount, tax_amount, status, invoice_date').eq('company_id', companyId).gte('invoice_date', yearStart),
      db.from('expenses').select('amount, category, expense_date').eq('company_id', companyId).gte('expense_date', yearStart),
      db.from('sales_orders').select('total_amount, tax_amount, status, order_date').eq('company_id', companyId).gte('order_date', yearStart),
      db.from('vat_records').select('output_vat, input_vat, net_vat_payable, period_start, period_end').eq('company_id', companyId),
    ])
    const gross =
      (invoices || []).filter((i: any) => i.status !== 'cancelled').reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0) +
      (sales || []).filter((o: any) => o.status !== 'cancelled').reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0)
    const allowable = (expenses || []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0)
    const vatInput = (vat || []).reduce((s: number, v: any) => s + Number(v.input_vat || 0), 0)
    const vatOutput = (vat || []).reduce((s: number, v: any) => s + Number(v.output_vat || 0), 0)

    return NextResponse.json({
      ok: true,
      data: {
        period_start: yearStart,
        period_end: new Date().toISOString().slice(0, 10),
        gross_income: round(gross),
        allowable_expenses: round(allowable),
        vat_input: round(vatInput),
        vat_output: round(vatOutput),
        currency: 'UGX',
        line_items: {
          invoices: invoices || [],
          expenses: expenses || [],
        },
      },
    })
  }

  if (kind === 'fund') {
    const { data: fund } = await db
      .from('workspace_funds')
      .select('id, total_assets, total_liabilities, total_units_outstanding, nav_per_unit, currency')
      .eq('company_id', companyId)
      .maybeSingle()
    let liabilitiesSum = 0
    if (fund?.id) {
      const { data: liabs } = await db.from('fund_liabilities').select('outstanding_balance').eq('fund_id', fund.id)
      liabilitiesSum = (liabs || []).reduce((s: number, l: any) => s + Number(l.outstanding_balance || 0), 0)
    }
    return NextResponse.json({
      ok: true,
      data: {
        as_of: new Date().toISOString().slice(0, 10),
        total_assets: round(Number(fund?.total_assets || 0)),
        total_liabilities: round(liabilitiesSum || Number(fund?.total_liabilities || 0)),
        units_outstanding: Number(fund?.total_units_outstanding || 0),
        nav_per_unit: Number(fund?.nav_per_unit || 0),
        currency: fund?.currency || 'UGX',
      },
    })
  }

  return NextResponse.json({ ok: false, error: 'Unknown report kind' }, { status: 400 })
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
