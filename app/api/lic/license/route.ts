import { NextRequest, NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { mirrorLicenseFromHub } from '@/lib/lic/mirror'

export const dynamic = 'force-dynamic'

/**
 * POST /api/lic/license
 * Body: { action: 'issue' | 'validate' | 'renew' | 'trial' | 'status',
 *         companyId, planCode?, intervalMonths?, licenseKey?, fingerprint? }
 *
 * Server-side only: keeps the licence secret off the client and mirrors the
 * result into Supabase so the UI can render state without a round-trip.
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
        const res = await lic.issueLicense(companyId, String(body.planCode || 'basic_1m'), body.intervalMonths ? Number(body.intervalMonths) : undefined)
        if (res.api_status === '200') await mirrorLicenseFromHub(companyId, res.data)
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'trial': {
        const fingerprint = String(body.fingerprint || '')
        if (!fingerprint) return NextResponse.json({ ok: false, error: 'fingerprint is required' }, { status: 400 })
        const res = await lic.startTrial(companyId, fingerprint, { user_id: body.userId, msisdn: body.msisdn })
        if (res.api_status === '200' && res.data?.license) {
          await mirrorLicenseFromHub(companyId, { license: res.data.license })
        }
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'renew': {
        const res = await lic.renew(String(body.licenseKey || ''), Number(body.intervalMonths || 1), body.planCode)
        if (res.api_status === '200') await mirrorLicenseFromHub(companyId, res.data)
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'status': {
        const res = await lic.licenseStatus(companyId)
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'change-quote': {
        const res = await lic.changeQuote(companyId, String(body.planCode || ''))
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'change': {
        const res = await lic.changePlan(companyId, String(body.planCode || ''), Boolean(body.paid))
        if (res.api_status === '200') await mirrorLicenseFromHub(companyId, res.data)
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'validate': {
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
