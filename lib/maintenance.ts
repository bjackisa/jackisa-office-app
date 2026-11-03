/**
 * Maintenance mode.
 *
 * When `MAINTENANCE_MODE=on`, every request is served the retired-app page
 * (`public/maintenance.html`) — no exceptions, no skip buttons. The only way
 * through is for a platform super-admin to prove their identity and exchange it
 * for a signed, short-lived bypass cookie; everyone else (visitors and ordinary
 * signed-in users alike) is held at the closed page.
 *
 * The gate itself lives in `proxy.ts`; this module holds the pieces that both
 * the proxy and the unlock API route need.
 */

export const BYPASS_COOKIE = 'jo_maint_bypass'
export const BYPASS_TTL_SECONDS = 60 * 60 * 8

export function maintenanceOn(): boolean {
  return (process.env.MAINTENANCE_MODE || '').trim().toLowerCase() === 'on'
}

export function bypassKeyConfigured(): boolean {
  return Boolean(bypassKey())
}

function bypassKey(): string {
  return (process.env.MAINTENANCE_BYPASS_KEY || '').trim()
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * The bypass cookie is `userId.hmac`, where the hash binds the bypass key to the
 * bearer's Supabase user id. A leaked cookie therefore cannot be replayed for a
 * different account, and rotating `MAINTENANCE_BYPASS_KEY` invalidates all of them.
 */
export async function bypassToken(userId: string): Promise<string> {
  return sha256Hex(`${bypassKey()}::${userId}`)
}

export async function makeBypassCookie(userId: string): Promise<string> {
  return `${userId}.${await bypassToken(userId)}`
}

export async function isValidBypass(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue || !bypassKeyConfigured()) return false
  const sep = cookieValue.indexOf('.')
  if (sep <= 0) return false
  const userId = cookieValue.slice(0, sep)
  const provided = cookieValue.slice(sep + 1)
  const expected = await bypassToken(userId)
  if (provided.length !== expected.length) return false
  // Constant-time-ish comparison; the token is a hash, so this is defence in depth.
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

export async function isSuperAdmin(supabaseUrl: string, serviceRoleKey: string, userId: string): Promise<boolean> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/users?select=role,is_active&id=eq.${encodeURIComponent(userId)}&limit=1`,
    {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      cache: 'no-store',
    }
  )
  if (!res.ok) return false
  const rows = (await res.json().catch(() => [])) as Array<{ role?: string; is_active?: boolean }>
  const row = rows[0]
  if (!row) return false
  if (row.is_active === false) return false
  return String(row.role || '').toLowerCase() === 'super_admin'
}
