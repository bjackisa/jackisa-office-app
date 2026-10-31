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
  const email = profile.email.toLowerCase()

  try {
    // Look the user up by email. listUsers is paged and only scans a window, so
    // page through until the address is found (or the list is exhausted) rather
    // than trusting the first page.
    let user: { id: string; email?: string } | undefined
    for (let page = 1; page <= 20; page++) {
      const { data: list, error: listErr } = await db.auth.admin.listUsers({ page, perPage: 1000 })
      if (listErr) break
      const found = list?.users?.find((u) => (u.email || '').toLowerCase() === email)
      if (found) {
        user = found
        break
      }
      if (!list?.users || list.users.length < 1000) break
    }

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
        // The user may have been created between the scan and this call.
        const retry = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const existing = retry.data?.users?.find((u) => (u.email || '').toLowerCase() === email)
        if (!existing) {
          return NextResponse.json({ ok: false, error: created.error.message }, { status: 400 })
        }
        user = existing
      } else {
        user = created.data.user
      }
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
        kyc_verified_at: profile.verified ? new Date().toISOString() : null,
      },
      { onConflict: 'id' }
    )

    // Mint a one-time email OTP the client verifies with verifyOtp(). This is
    // flow-independent: unlike the magic link (which relies on the project's
    // PKCE/implicit setting and detectSessionInUrl racing the page), the token
    // hash verifies the same way on any Supabase project.
    const link = await db.auth.admin.generateLink({
      type: 'magiclink',
      email: profile.email,
      options: { redirectTo },
    })
    if (link.error) {
      return NextResponse.json({ ok: false, error: link.error.message }, { status: 400 })
    }

    const props: any = link.data?.properties || {}
    return NextResponse.json({
      ok: true,
      email: profile.email,
      tokenHash: props.hashed_token || null,
      otpType: 'email',
      magicLink: props.action_link || null,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Sign-in failed' }, { status: 500 })
  }
}
