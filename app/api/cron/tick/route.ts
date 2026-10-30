import { NextRequest, NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'
import { verifyLicSignature } from '@/lib/lic/peer'

export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/cron/tick
 *
 * The office app is serverless and cannot schedule work itself, and the licence
 * hub's host has no shell crontab. This route closes the loop: a scheduler the
 * app *does* have (Vercel Cron) calls it, and it asks the hub to run its
 * scheduled jobs (licence expiry, trial reminders, payment reconciliation,
 * tax/fund snapshots, renewal reminders).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET
 * is set in the project. When CRON_SECRET is unset the route still runs, so the
 * schedule works before the secret is configured. A signed call from the hub is
 * also accepted.
 */
async function handle(req: NextRequest) {
  const raw = await req.text().catch(() => '')
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const hubSigned = verifyLicSignature(raw, req.headers.get('x-lic-signature'), 'office')

  if (secret && auth !== `Bearer ${secret}` && !hubSigned) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = safeJson(raw)
  const res = await lic.runCron(body?.job, body?.all === true || !body?.job)
  if (res.api_status !== '200') {
    return NextResponse.json({ ok: false, error: res.errors?.error_text || 'Licence hub unavailable' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, ...res.data })
}

function safeJson(raw: string): any {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
