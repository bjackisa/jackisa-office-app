import { NextRequest, NextResponse } from 'next/server'
import { adminAvailable } from '@/lib/lic/peer'
import { getCaller } from '@/lib/lic/serverAuth'
import { parseBody, prepareReturn, recordFiling } from '@/lib/ura/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ura/file
 * Body: { companyId, returnType, periodStart, periodEnd, record? }
 *
 * Builds the completed, validated URA workbook and streams it back as a
 * download. When `record` is true (default) the filing is written to
 * `ura_filings` so it appears in the filing history.
 */
export async function POST(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const body = await req.json().catch(() => ({}))
  const parsed = parseBody(body)
  if ('error' in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 })

  const prepared = await prepareReturn(req, parsed)
  if ('error' in prepared) return NextResponse.json({ ok: false, error: prepared.error }, { status: prepared.status })

  if (body?.record !== false) {
    const caller = await getCaller(req)
    await recordFiling(parsed.companyId, prepared, caller?.id || null, 'validated')
  }

  const name = `ura-${parsed.returnType === 'paye' ? 'paye' : 'income-tax'}-${parsed.periodStart}-to-${parsed.periodEnd}.xlsx`
  return new NextResponse(prepared.workbook as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      'X-Validation-Ok': String(prepared.validation.ok),
      'X-Validation-Errors': String(prepared.validation.errors),
    },
  })
}
