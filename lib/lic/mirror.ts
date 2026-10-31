import { adminClient, adminAvailable } from '@/lib/lic/peer'

/**
 * Mirror the licence the hub holds for a company into the local
 * `platform_licenses` table, so the UI can render state without a round-trip.
 *
 * Call this whenever the hub's answer may have changed: issuing, renewing, a
 * trial starting, or a payment settling. A licence the hub issues after a
 * payment is not reflected in the app otherwise, which is why a paid licence
 * used to leave the workspace locked.
 */
export async function mirrorLicenseFromHub(companyId: string, data: any): Promise<void> {
  if (!companyId || !adminAvailable()) return

  // The hub returns a signed certificate shaped { payload, signature,
  // fingerprint }; the status endpoint returns a raw licence row; some callers
  // pass the certificate already unwrapped. Normalise all three to the payload
  // before reading fields, otherwise the licence mirrors as tier 'basic' /
  // plan null and the workspace looks like it was given a basic trial.
  const cert = data?.license || data?.certificate || data || null
  const license = cert?.payload || cert
  if (!license) return
  if (!license.plan_code && !license.serial && !license.tier) return

  const db = adminClient()
  const row = {
    company_id: companyId,
    serial: license.serial ?? null,
    license_key: license.license_key ?? null,
    plan_code: license.plan_code ?? null,
    tier: license.tier ?? 'basic',
    status: license.status ?? 'trial',
    interval_months: license.interval_months ?? 1,
    max_employees: license.max_employees ?? license.caps?.max_employees ?? 10,
    max_students: license.max_students ?? license.caps?.max_students ?? 0,
    storage_gb: license.storage_gb ?? license.caps?.storage_gb ?? 5,
    features: normalizeFeatures(license.features),
    starts_at: license.starts_at ?? null,
    expires_at: license.expires_at ?? null,
    grace_until: license.grace_until ?? null,
    certificate: cert?.payload ? JSON.stringify(cert) : license.certificate ?? null,
    fingerprint: cert?.fingerprint ?? license.fingerprint ?? null,
    is_current: true,
    last_validated_at: new Date().toISOString(),
  }

  try {
    // Update the current row in place when it is the same licence, so a repeated
    // sync (e.g. the twice-daily status check) does not pile up dead rows.
    const { data: existing } = await db
      .from('platform_licenses')
      .select('id, license_key')
      .eq('company_id', companyId)
      .eq('is_current', true)
      .maybeSingle()

    if (existing && (existing as any).license_key && (existing as any).license_key === row.license_key) {
      await db.from('platform_licenses').update(row).eq('id', (existing as any).id)
      return
    }

    await db.from('platform_licenses').update({ is_current: false }).eq('company_id', companyId).eq('is_current', true)
    const { error } = await db.from('platform_licenses').insert(row)
    if (error) console.error('[lic] license mirror insert failed', error)
  } catch (e) {
    console.error('[lic] license mirror failed', e)
  }
}

function normalizeFeatures(features: any): Record<string, any> {
  if (!features) return {}
  if (typeof features === 'string') {
    try {
      return JSON.parse(features)
    } catch {
      return {}
    }
  }
  return features
}
