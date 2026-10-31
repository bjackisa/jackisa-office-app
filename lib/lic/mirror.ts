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
  const license = data?.license || data?.certificate?.payload || data?.certificate || null
  if (!license) return

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
    certificate: license.certificate ?? (data?.certificate ? JSON.stringify(data.certificate) : null),
    fingerprint: license.fingerprint ?? data?.certificate?.fingerprint ?? null,
    is_current: true,
    last_validated_at: new Date().toISOString(),
  }

  try {
    await db.from('platform_licenses').update({ is_current: false }).eq('company_id', companyId).eq('is_current', true)
    await db.from('platform_licenses').insert(row)
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
