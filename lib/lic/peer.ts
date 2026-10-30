/**
 * Server helpers for talking to / authenticating the licence hub.
 */

import crypto from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const OFFICE_SECRET = process.env.LIC_OFFICE_SECRET || ''
const JACKISA_SECRET = process.env.LIC_JACKISA_SECRET || ''

/** Verify an inbound request signed by lic.jackisa.com. */
export function verifyLicSignature(rawBody: string, signatureHeader: string | null, peer: 'office' | 'jackisa' = 'office'): boolean {
  if (!signatureHeader) return false
  const secret = peer === 'office' ? OFFICE_SECRET : JACKISA_SECRET
  if (!secret) return false
  const provided = signatureHeader.replace(/^sha256=/i, '').trim()
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
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
