import { NextResponse } from 'next/server'

import { BYPASS_COOKIE } from '@/lib/maintenance'

/** Clear the maintenance bypass cookie (e.g. to leave the super-admin view). */
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(BYPASS_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
