import { NextRequest, NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'
import { adminClient, adminAvailable } from '@/lib/lic/peer'

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
        await mirrorLicense(companyId, res)
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'trial': {
        const fingerprint = String(body.fingerprint || '')
        if (!fingerprint) return NextResponse.json({ ok: false, error: 'fingerprint is required' }, { status: 400 })
        const res = await lic.startTrial(companyId, fingerprint, { user_id: body.userId, msisdn: body.msisdn })
        if (res.api_status === '200' && res.data?.license) {
          await mirrorLicense(companyId, { api_status: '200', data: { certificate: res.data.license } })
        }
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'renew': {
        const res = await lic.renew(String(body.licenseKey || ''), Number(body.intervalMonths || 1), body.planCode)
        await mirrorLicense(companyId, res)
        return NextResponse.json({ ok: res.api_status === '200', data: res.data, error: res.errors?.error_text })
      }

      case 'status': {
        const res = await lic.licenseStatus(companyId)
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

/** Copy the certificate the hub returned into the local mirror table. */
async function mirrorLicense(companyId: string, res: any) {
  if (!adminAvailable() || res?.api_status !== '200') return
  const cert = res?.data?.certificate
  if (!cert?.payload) return
  const p = cert.payload
  const db = adminClient()
  try {
    await db.from('platform_licenses').update({ is_current: false }).eq('company_id', companyId).eq('is_current', true)
    await db.from('platform_licenses').insert({
      company_id: companyId,
      serial: p.serial,
      license_key: p.license_key,
      plan_code: p.plan_code,
      tier: p.tier,
      status: p.status,
      interval_months: p.interval_months,
      max_employees: p.caps?.max_employees ?? 10,
      max_students: p.caps?.max_students ?? 0,
      storage_gb: p.caps?.storage_gb ?? 5,
      features: p.features ?? {},
      starts_at: p.starts_at,
      expires_at: p.expires_at,
      grace_until: p.grace_until,
      certificate: JSON.stringify(cert),
      fingerprint: cert.fingerprint,
      is_current: true,
      last_validated_at: new Date().toISOString(),
    })
  } catch (e) {
    console.error('[lic] mirror failed', e)
  }
}

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
