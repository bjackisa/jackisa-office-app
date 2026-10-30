import { NextRequest, NextResponse } from 'next/server'
import { adminClient, adminAvailable, verifyLicSignature } from '@/lib/lic/peer'

export const dynamic = 'force-dynamic'

/**
 * POST /api/lic/fund-daily — called BY lic.jackisa.com (signed) on a daily cron.
 *
 * Runs the unit-trust daily automation (`run_daily_fund_automation`): accrue
 * liability interest, compound, recompute NAV, generate member signals, write
 * the NAV snapshot and process standing orders. The serverless office app has no
 * scheduler of its own, so lic drives it. Returns one row per fund processed.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!verifyLicSignature(raw, req.headers.get('x-lic-signature'), 'office')) {
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 })
  }
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })

  const db = adminClient()
  const { data, error } = await db.rpc('run_daily_fund_automation')
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 })
  }
  const funds = Array.isArray(data) ? data : []
  return NextResponse.json({ ok: true, funds_processed: funds.length, funds })
}
