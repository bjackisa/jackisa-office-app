import { NextRequest, NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { mirrorLicenseFromHub } from '@/lib/lic/mirror'
import { requireCompanyAdmin, requireMember } from '@/lib/lic/serverAuth'
import { ensureLicTenant } from '@/lib/lic/provision'

export const dynamic = 'force-dynamic'

/**
 * POST /api/lic/license
 * Body: { action: 'issue' | 'validate' | 'renew' | 'trial' | 'status',
 *         companyId, planCode?, intervalMonths?, licenseKey?, fingerprint? }
 *
 * Server-side only: keeps the licence secret off the client and mirrors the
 * result into Supabase so the UI can render state without a round-trip.
 *
 * Authorisation:
 *   * validate / status / change-quote — any member of the company (the app
 *     heartbeat calls these on behalf of the whole workspace).
 *   * trial — any member; the hub still enforces one-trial-per-device/IP.
 *   * issue / renew / change — a company admin, and only for a licence that is
 *     already paid for. A caller can never mint a free active licence: `issue`
 *     requires an existing trial or paid state on the hub, and `change` only
 *     mirrors a plan the hub already considers paid.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || '')
  const companyId = String(body?.companyId || '')

  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 })
  }

  try {
    switch (action) {
      case 'issue': {
        // Self-service issue is only allowed to start the trial licence or to
        // re-materialise a licence the hub already granted. Paid issuance goes
        // through /api/lic/payments (which the hub fulfils after settlement).
        const guard = await requireCompanyAdmin(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        const status = await lic.licenseStatus(companyId)
        const hubLic = status.data?.license || status.data?.certificate || null
        const hubStatus = String(status.data?.status || hubLic?.status || '')
        if (status.api_status === '200' && hubLic && ['active', 'trial', 'grace'].includes(hubStatus)) {
          // Re-mirror what the hub already has rather than issuing anew.
          await mirrorLicenseFromHub(companyId, status.data)
          return NextResponse.json({ ok: true, data: status.data, reused: true })
        }
        return NextResponse.json(
          { ok: false, error: 'A licence is issued once payment is confirmed. Start a trial or pay for a plan.' },
          { status: 402 }
        )
      }

      case 'trial': {
        const guard = await requireCompanyAdmin(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        const fingerprint = String(body.fingerprint || '')
        if (!fingerprint) return NextResponse.json({ ok: false, error: 'fingerprint is required' }, { status: 400 })
        await ensureLicTenant(companyId, { id: guard.caller.id, email: guard.caller.email })
        const res = await lic.startTrial(companyId, fingerprint, { user_id: guard.caller.id, msisdn: body.msisdn })
        if (res.api_status === '200' && res.data?.license) {
          await mirrorLicenseFromHub(companyId, { license: res.data.license })
        }
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'renew': {
        const guard = await requireCompanyAdmin(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        // Renewal is only free when the hub already recorded a settled payment;
        // otherwise the client must go through /api/lic/payments.
        const res = await lic.renew(String(body.licenseKey || ''), Number(body.intervalMonths || 1), body.planCode)
        if (res.api_status === '200') await mirrorLicenseFromHub(companyId, res.data)
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'status': {
        // Read-only: any member of the company may see its licence status.
        const guard = await requireMember(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        const res = await lic.licenseStatus(companyId)
        // Self-heal: if the hub holds a live licence the office has not mirrored
        // (e.g. a trial started before the mirror was wired), write it now.
        if (res.api_status === '200') await mirrorLicenseFromHub(companyId, res.data)
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'change-quote': {
        const guard = await requireMember(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        const res = await lic.changeQuote(companyId, String(body.planCode || ''))
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'change': {
        // A plan change is only applied when it is fully covered by credit
        // (paid=true is set by the client only for a zero-due change). Anything
        // with an amount due must be paid through /api/lic/payments.
        const guard = await requireCompanyAdmin(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        const paid = Boolean(body.paid)
        const quote = await lic.changeQuote(companyId, String(body.planCode || ''))
        const due = Number(quote.data?.quote?.amount_due ?? NaN)
        if (paid && (Number.isNaN(due) || due > 0.001)) {
          return NextResponse.json({ ok: false, error: 'This plan change requires payment' }, { status: 402 })
        }
        const res = await lic.changePlan(companyId, String(body.planCode || ''), paid)
        if (res.api_status === '200') await mirrorLicenseFromHub(companyId, res.data)
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'validate': {
        const guard = await requireMember(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        const key = String(body.licenseKey || '')
        const res = await lic.validate(key, {
          employees: Number(body.employees || 0),
          students: Number(body.students || 0),
          storage_gb: Number(body.storage_gb || 0),
        })
        await recordValidation(companyId, res)
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      default:
        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Licence request failed' }, { status: 500 })
  }
}

/** Record a validation result and refresh the mirrored licence status. */
async function recordValidation(companyId: string, res: any) {
  if (!adminAvailable() || res?.api_status !== '200') return
  const d = res.data || {}
  const db = adminClient()
  try {
    await db.from('license_validations').insert({
      company_id: companyId,
      status: d.status,
      valid: d.valid,
      within_caps: d.within_caps,
      usage: d.usage || {},
      cap_details: d.cap_details || {},
      response: d,
    })
    if (d.expires_at) {
      await db.from('platform_licenses')
        .update({ last_validated_at: new Date().toISOString(), status: d.status })
        .eq('company_id', companyId).eq('is_current', true)
    }
  } catch (e) {
    console.error('[lic] validation record failed', e)
  }
}
