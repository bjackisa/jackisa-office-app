import { NextRequest, NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { requireCompanyAdmin } from '@/lib/lic/serverAuth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/reports/income-tax/csv
 * Body: { companyId, periodStart?, periodEnd? }
 *
 * Returns a URA-ready CSV: one row per income and expense line, plus a summary
 * block. The accountant can feed this straight into the URA filing portal.
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

  const [{ data: company }, { data: invoices }, { data: expenses }, { data: sales }] = await Promise.all([
    db.from('companies').select('name, tin, email').eq('id', companyId).maybeSingle(),
    db.from('invoices').select('invoice_number, invoice_date, customer_name, total_amount, tax_amount, status').eq('company_id', companyId).gte('invoice_date', periodStart).lte('invoice_date', periodEnd),
    db.from('expenses').select('expense_date, category, description, amount, status').eq('company_id', companyId).gte('expense_date', periodStart).lte('expense_date', periodEnd),
    db.from('sales_orders').select('order_date, total_amount, tax_amount, status').eq('company_id', companyId).gte('order_date', periodStart).lte('order_date', periodEnd),
  ])

  const gross =
    (invoices || []).filter((i: any) => i.status !== 'cancelled').reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0) +
    (sales || []).filter((o: any) => o.status !== 'cancelled').reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0)
  const allowable = (expenses || []).filter((e: any) => e.status !== 'rejected').reduce((s: number, e: any) => s + Number(e.amount || 0), 0)

  const res = await lic.incomeTax({
    tenant_id: companyId,
    gross_income: round(gross),
    allowable_expenses: round(allowable),
    period_start: periodStart,
    period_end: periodEnd,
  })
  const computed = res.data || {}

  const tax = computeUgandaTax(gross - allowable)

  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows: string[] = []
  rows.push(['Section', 'Date', 'Reference', 'Description', 'Debit', 'Credit', 'Status'].map(esc).join(','))
  for (const i of invoices || []) {
    rows.push(['Income', i.invoice_date, i.invoice_number, i.customer_name, '', i.total_amount, i.status].map(esc).join(','))
  }
  for (const o of sales || []) {
    rows.push(['Income', o.order_date, '', 'Sales order', '', o.total_amount, o.status].map(esc).join(','))
  }
  for (const e of expenses || []) {
    rows.push(['Expense', e.expense_date, '', `${e.category || ''} ${e.description || ''}`.trim(), e.amount, '', e.status].map(esc).join(','))
  }
  rows.push('')
  rows.push(['Summary', '', '', '', '', '', ''].map(esc).join(','))
  rows.push(['Gross income', '', '', '', '', round(gross), ''].map(esc).join(','))
  rows.push(['Allowable expenses', '', '', '', round(allowable), '', ''].map(esc).join(','))
  rows.push(['Chargeable income', '', '', '', '', round(Math.max(0, gross - allowable)), ''].map(esc).join(','))
  rows.push(['Tax payable (UGX)', '', '', '', '', round(tax), ''].map(esc).join(','))
  if (computed.tax_payable !== undefined) {
    rows.push(['Tax payable (hub)', '', '', '', '', round(Number(computed.tax_payable)), ''].map(esc).join(','))
  }

  const header = `Jackisa Office — Income Tax Worksheet\r\nCompany: ${company?.name || companyId}\r\nTIN: ${company?.tin || 'N/A'}\r\nPeriod: ${periodStart} to ${periodEnd}\r\nGenerated: ${new Date().toISOString()}\r\n\r\n`

  return new NextResponse(header + rows.join('\r\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="income-tax-${periodStart}-to-${periodEnd}.csv"`,
    },
  })
}

/** Mirrors CronService::ugandaCorporateTax for the CSV summary when the hub is down. */
function computeUgandaTax(chargeable: number): number {
  if (chargeable <= 0) return 0
  const threshold = 150_000_000
  return chargeable <= threshold ? Math.round(chargeable * 0.01 * 100) / 100 : Math.round(chargeable * 0.3 * 100) / 100
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
