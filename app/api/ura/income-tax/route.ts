import { NextRequest, NextResponse } from 'next/server'
import { adminAvailable } from '@/lib/lic/peer'
import { parseBody, previewReturn } from '@/lib/ura/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ura/income-tax
 * Body: { companyId, periodStart, periodEnd }
 *
 * Assembles the income-tax return (invoices, sales, expenses, credit/debit
 * notes, assets, liabilities and adjustments), computes the tax position and
 * returns the validated summary plus the line items, ready for the screen.
 */
export async function POST(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const parsed = parseBody({ ...(await req.json().catch(() => ({}))), returnType: 'income_tax' })
  if ('error' in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 })

  const result = await previewReturn(req, parsed)
  if ('error' in result) return NextResponse.json({ ok: false, error: result.error }, { status: result.status })

  return NextResponse.json({
    ok: true,
    data: {
      taxpayer: result.bundle.taxpayer,
      period: result.bundle.period,
      summary: result.summary,
      validation: result.validation,
      incomeTax: {
        computation: result.bundle.incomeTax!.computation,
        totals: result.bundle.incomeTax!.totals,
        vat: result.bundle.incomeTax!.vat,
        invoices: result.bundle.incomeTax!.invoices,
        sales: result.bundle.incomeTax!.sales,
        expenses: result.bundle.incomeTax!.expenses,
        creditNotes: result.bundle.incomeTax!.creditNotes,
        debitNotes: result.bundle.incomeTax!.debitNotes,
        adjustments: result.bundle.incomeTax!.adjustments,
      },
    },
  })
}
