import { NextRequest, NextResponse } from 'next/server'
import { adminAvailable } from '@/lib/lic/peer'
import { parseBody, previewReturn } from '@/lib/ura/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ura/paye
 * Body: { companyId, periodStart, periodEnd }
 *
 * Assembles the monthly PAYE return from payroll (or current salary structures
 * when no run exists), computes PAYE per employee with the Uganda bands, and
 * returns the validated summary plus the per-employee schedule.
 */
export async function POST(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const parsed = parseBody({ ...(await req.json().catch(() => ({}))), returnType: 'paye' })
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
      paye: result.bundle.paye,
    },
  })
}
