/**
 * Server helpers for talking to / authenticating the licence hub.
 */

import crypto from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const OFFICE_SECRET = process.env.LIC_OFFICE_SECRET || process.env.LIC_API_KEY || ''
const JACKISA_SECRET = process.env.LIC_JACKISA_SECRET || ''

/** Verify an inbound request signed by lic.jackisa.com. */
export function verifyLicSignature(rawBody: string, signatureHeader: string | null, peer: 'office' | 'jackisa' = 'office'): boolean {
  if (!signatureHeader) return false
  const preferred = peer === 'office' ? OFFICE_SECRET : JACKISA_SECRET
  // Try the peer-specific secret first, then fall back to the other peer's
  // secret so a single configured value can serve both directions.
  const secrets = Array.from(new Set([preferred, OFFICE_SECRET, JACKISA_SECRET].filter(Boolean)))
  if (secrets.length === 0) return false
  const provided = signatureHeader.replace(/^sha256=/i, '').trim()
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false
  const expectedBuf = Buffer.from(provided, 'hex')
  return secrets.some((secret) => {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest()
    return expected.length === expectedBuf.length && crypto.timingSafeEqual(expectedBuf, expected)
  })
}

let _admin: SupabaseClient | null = null

/** Lazy service-role client so importing a route never throws at build time. */
export function adminClient(): SupabaseClient {
  if (_admin) return _admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase admin credentials are not configured')
  }
  _admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _admin
}

export function adminAvailable(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}
