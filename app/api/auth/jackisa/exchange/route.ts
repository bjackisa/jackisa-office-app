import { NextRequest, NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { hitIp } from '@/lib/security/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/jackisa/exchange
 * Body: { ssoToken }
 *
 * Consumes the one-time token minted by /api/auth/jackisa, ensures a Supabase
 * auth user exists for the email and returns a magic link the client can follow
 * to establish a real session. This is what makes "Continue with Jackisa" a
 * genuine authenticated session rather than a bare profile.
 */
export async function POST(req: NextRequest) {
  const limited = hitIp(req, 'sso-exchange', { windowSeconds: 60, max: 20 })
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many sign-in attempts. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
    )
  }
  const body = await req.json().catch(() => ({}))
  const ssoToken = String(body?.ssoToken || '')
  if (!ssoToken) {
    return NextResponse.json({ ok: false, error: 'ssoToken is required' }, { status: 400 })
  }

  const res = await lic.ssoExchange(ssoToken)
  if (res.api_status !== '200' || !res.data?.profile) {
    return NextResponse.json({ ok: false, error: res.errors?.error_text || 'This sign-in link has expired' }, { status: 401 })
  }

  const profile = res.data.profile
  if (!profile?.email) {
    return NextResponse.json({ ok: false, error: 'Jackisa did not return an email address' }, { status: 400 })
  }

  if (!adminAvailable()) {
    return NextResponse.json({ ok: false, error: 'Sign-in is not configured on this environment' }, { status: 500 })
  }

  const db = adminClient()
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin}/auth/callback`

  try {
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
    let user = list?.users?.find((u) => (u.email || '').toLowerCase() === profile.email.toLowerCase())

    if (!user) {
      const created = await db.auth.admin.createUser({
        email: profile.email,
        email_confirm: true,
        user_metadata: {
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          jackisa_user_id: profile.jackisa_user_id,
        },
      })
      if (created.error) {
        return NextResponse.json({ ok: false, error: created.error.message }, { status: 400 })
      }
      user = created.data.user
    }

    await db.from('users').upsert(
      {
        id: user!.id,
        email: profile.email,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        jackisa_user_id: String(profile.jackisa_user_id || ''),
        kyc_status: profile.verified ? 'verified' : 'unverified',
        kyc_level: profile.verified ? 'individual' : 'none',
      },
      { onConflict: 'id' }
    )

    const link = await db.auth.admin.generateLink({ type: 'magiclink', email: profile.email, options: { redirectTo } })
    if (link.error) {
      return NextResponse.json({ ok: false, error: link.error.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      email: profile.email,
      magicLink: link.data?.properties?.action_link || null,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Sign-in failed' }, { status: 500 })
  }
}
