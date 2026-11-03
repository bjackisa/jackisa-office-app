import { NextRequest, NextResponse } from 'next/server'

import { BYPASS_COOKIE, isValidBypass, maintenanceOn } from '@/lib/maintenance'

/**
 * Maintenance gate (Next.js 16 `proxy` convention). Runs before every request
 * except static assets — see the matcher below.
 *
 * While `MAINTENANCE_MODE=on` the whole site is closed: every visitor, and every
 * ordinary signed-in user, is shown the retired-app page. A platform super-admin
 * who has exchanged the bypass key for a signed cookie (POST
 * /api/maintenance/unlock) is the only account let through.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (!maintenanceOn()) return NextResponse.next()

  // The closed page itself, the unlinked admin unlock form, and the
  // lock/unlock API must stay reachable.
  if (pathname === '/maintenance.html' || pathname === '/unlock.html') return NextResponse.next()
  if (pathname === '/api/maintenance/unlock' || pathname === '/api/maintenance/lock') {
    return NextResponse.next()
  }

  const bypass = req.cookies.get(BYPASS_COOKIE)?.value
  if (await isValidBypass(bypass)) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Service unavailable', maintenance: true },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const accept = req.headers.get('accept') || ''
  if (!accept.includes('text/html')) {
    // RSC/prefetch and other non-page fetches are held too, so nothing leaks
    // through a client-side navigation while the app is closed.
    return new NextResponse(null, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }

  const url = req.nextUrl.clone()
  url.pathname = '/maintenance.html'
  url.search = ''
  const res = NextResponse.rewrite(url)
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('X-Maintenance', 'on')
  return res
}

export const config = {
  matcher: [
    // Everything except Next internals and static asset paths.
    '/((?!_next/static|_next/image|favicon.ico|robots.txt).*)',
  ],
}
