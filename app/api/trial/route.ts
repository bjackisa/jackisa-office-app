import { NextRequest, NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { getCaller, requireMember } from '@/lib/lic/serverAuth'
import { ensureLicTenant } from '@/lib/lic/provision'
import { mirrorLicenseFromHub } from '@/lib/lic/mirror'
import { hitIp } from '@/lib/security/rate-limit'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const TRIAL_DAYS = 7

/**
 * POST /api/trial
 * Body: { action: 'start' | 'cancel' | 'status', companyId, msisdn?, fingerprint? }
 *
 * Starts a 7-day free trial. Eligibility is decided on the licence hub using a
 * device fingerprint plus IP, so a brand-new device/IP gets one trial and a
 * near-identical repeat does not. After the trial the number on file is charged
 * by JPesa; the user may cancel any time before then.
 */
export async function POST(req: NextRequest) {
  const limited = hitIp(req, 'trial', { windowSeconds: 3600, max: 5 })
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many trial attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
    )
  }
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || 'start')
  const companyId = String(body?.companyId || '')
  if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 })

  const caller = await getCaller(req)
  if (!caller) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })
  // The caller must belong to the workspace the trial is for — otherwise a
  // signed-in user could start, inspect or cancel another company's trial.
  const guard = await requireMember(req, companyId)
  if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '0.0.0.0'
  const fingerprint = String(body?.fingerprint || deriveFingerprint(req))

  if (action === 'cancel') {
    // Cancel on the hub first (it owns the trial and sends the cancellation
    // notification on both channels), then mirror the local record.
    const hub = await lic.cancelTrial(companyId, 'Cancelled by customer')
    if (adminAvailable()) {
      const db = adminClient()
      await db
        .from('trial_registrations')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .in('status', ['active', 'reminded'])
    }
    // The cancelled trial licence is no longer current locally.
    if (hub.api_status === '200' && adminAvailable()) {
      await adminClient()
        .from('platform_licenses')
        .update({ status: 'expired', expires_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('is_current', true)
        .eq('status', 'trial')
    }
    return NextResponse.json({ ok: true, cancelled: true, hub: hub.api_status === '200' })
  }

  if (action === 'status') {
    if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
    const db = adminClient()
    const { data } = await db.from('trial_registrations').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    return NextResponse.json({ ok: true, trial: data })
  }

  // action === 'start'
  // Guarantee the hub knows this tenant before we reference it, otherwise the
  // trial insert fails the tenant foreign key (the bug that returned a 500).
  await ensureLicTenant(companyId, { id: caller?.id || '', email: caller?.email || null })

  const res = await lic.startTrial(companyId, fingerprint, {
    user_id: caller?.id,
    msisdn: body?.msisdn ? String(body.msisdn) : undefined,
    ip,
    plan_code: body?.planCode ? String(body.planCode) : undefined,
  })
  if (res.api_status !== '200') {
    return NextResponse.json({ ok: false, error: res.errors?.error_text || 'Could not start a trial' }, { status: 400 })
  }

  const granted = res.data?.granted !== false
  const endsAt = res.data?.ends_at || new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString()

  // Mirror the licence the hub just issued (the chosen plan/tier, not a default
  // basic one) into platform_licenses so the app renders the right tier and a
  // real status instead of falling back to basic / unknown.
  if (granted && res.data?.license) {
    await mirrorLicenseFromHub(companyId, { license: res.data.license })
  }

  if (adminAvailable()) {
    try {
      const db = adminClient()
      await db.from('trial_registrations').insert({
        company_id: companyId,
        user_id: caller?.id || null,
        fingerprint,
        ip_address: ip,
        msisdn: body?.msisdn ? String(body.msisdn) : null,
        ends_at: endsAt,
        status: 'active',
      })
    } catch (e) {
      console.error('[trial] mirror failed', e)
    }
  }

  return NextResponse.json({ ok: true, granted, endsAt, days: TRIAL_DAYS })
}

function deriveFingerprint(req: NextRequest): string {
  // Device/browser based, deliberately NOT keyed on the user id: a brand-new
  // account on a device that already consumed a trial must not look new.
  // Include a client-supplied `fingerprint` header when present (the app sets a
  // persisted device id) so the same physical device is recognised even if its
  // user-agent string is later updated by a browser release.
  const ua = req.headers.get('user-agent') || ''
  const lang = req.headers.get('accept-language') || ''
  const enc = req.headers.get('accept-encoding') || ''
  const ch = req.headers.get('sec-ch-ua') || ''
  const device = req.headers.get('x-device-id') || ''
  return crypto.createHash('sha256').update(`${device}|${ua}|${lang}|${enc}|${ch}`).digest('hex')
}
