import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { hitIp } from '@/lib/security/rate-limit'
import { BYPASS_COOKIE, BYPASS_TTL_SECONDS, isSuperAdmin, makeBypassCookie } from '@/lib/maintenance'

/**
 * Exchange the maintenance bypass key for a signed cookie.
 *
 * The caller must prove BOTH:
 *   1. knowledge of `MAINTENANCE_BYPASS_KEY`, and
 *   2. ownership of a `super_admin` account (email + password).
 *
 * The key alone is never enough, so even if it leaks the app stays closed to
 * everyone but a platform administrator. The password is verified directly
 * against Supabase here because the normal sign-in page is itself behind the
 * gate. A valid Supabase bearer token is also accepted in place of a password.
 */
export async function POST(req: NextRequest) {
  const limit = hitIp(req, 'maintenance-unlock', { windowSeconds: 300, max: 10 })
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const configured = (process.env.MAINTENANCE_BYPASS_KEY || '').trim()
  if (!configured) {
    return NextResponse.json({ error: 'Maintenance bypass is not configured' }, { status: 500 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    key?: string
    email?: string
    password?: string
    token?: string
  }

  if (!timingSafeEqual(String(body.key || ''), configured)) {
    return NextResponse.json({ error: 'Invalid bypass key' }, { status: 403 })
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !serviceKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  let userId: string | null = null
  if (body.token) {
    const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data } = await client.auth.getUser(String(body.token))
    userId = data?.user?.id ?? null
  } else if (body.email && body.password) {
    const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await client.auth.signInWithPassword({
      email: String(body.email).trim().toLowerCase(),
      password: String(body.password),
    })
    if (error || !data?.user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }
    userId = data.user.id
  }

  if (!userId) {
    return NextResponse.json({ error: 'Provide an administrator email and password' }, { status: 401 })
  }

  if (!(await isSuperAdmin(url, serviceKey, userId))) {
    return NextResponse.json({ error: 'Platform administrator access is required' }, { status: 403 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(BYPASS_COOKIE, await makeBypassCookie(userId), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: BYPASS_TTL_SECONDS,
  })
  return res
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
