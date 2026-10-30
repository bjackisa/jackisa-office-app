'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

/**
 * "Continue with Jackisa" — hands off to jackisa.com to authenticate, then
 * exchanges the returned session for a real Jackisa Office session.
 *
 * The handshake:
 *   1. open jackisa.com/office_sso.php?redirect=<origin>/auth/callback
 *   2. jackisa redirects back with ?access_token=...
 *   3. /auth/callback posts it to /api/auth/jackisa, then exchanges the
 *      one-time SSO token for a magic link and follows it.
 */
export function ContinueWithJackisa({ label = 'Continue with Jackisa', redirect }: { label?: string; redirect?: string }) {
  const [loading, setLoading] = useState(false)

  const start = () => {
    setLoading(true)
    const back = redirect || `${window.location.origin}/auth/callback`
    const url = `https://jackisa.com/office_sso.php?redirect=${encodeURIComponent(back)}`
    window.location.href = url
  }

  return (
    <Button type="button" variant="outline" className="w-full h-11 font-semibold" onClick={start} disabled={loading}>
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : (
        <span className="w-4 h-4 mr-2 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600" />
      )}
      {label}
    </Button>
  )
}
