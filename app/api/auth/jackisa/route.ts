import { NextRequest, NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { hitIp } from '@/lib/security/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/jackisa
 * Body: { accessToken }
 *
 * "Continue with Jackisa": verify the visitor's jackisa.com session, pull their
 * profile (including the avatar), upsert them into the office `users` table and
 * return a magic link they can use to finish sign-in. Individuals already
 * verified on jackisa.com are auto-verified here (blue badge).
 */
export async function POST(req: NextRequest) {
  const limited = hitIp(req, 'sso-jackisa', { windowSeconds: 60, max: 20 })
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many sign-in attempts. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
    )
  }
  const body = await req.json().catch(() => ({}))
  const accessToken = String(body?.accessToken || '')
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: 'accessToken is required' }, { status: 400 })
  }

  const res = await lic.ssoJackisa(accessToken)
  if (res.api_status !== '200' || !res.data?.profile) {
    return NextResponse.json({ ok: false, error: res.errors?.error_text || 'Jackisa authentication failed' }, { status: 401 })
  }

  const profile = res.data.profile
  const ssoToken = res.data.sso_token

  // Mirror the profile into Supabase so office has the same avatar and badge.
  if (adminAvailable()) {
    try {
      const db = adminClient()
      const { data: existing } = await db.from('users').select('id').eq('email', profile.email).maybeSingle()
      const patch: Record<string, any> = {
        email: profile.email,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        jackisa_user_id: String(profile.jackisa_user_id || ''),
        kyc_status: profile.verified ? 'verified' : 'unverified',
        kyc_level: profile.verified ? 'individual' : 'none',
        kyc_verified_at: profile.verified ? new Date().toISOString() : null,
      }
      if (existing?.id) {
        await db.from('users').update(patch).eq('id', existing.id)
      }
      // New users are created through the SSO exchange (server-side) so a
      // Supabase auth record is always created alongside the profile.
    } catch (e) {
      console.error('[jackisa sso] mirror failed', e)
    }
  }

  return NextResponse.json({ ok: true, ssoToken, profile })
}
