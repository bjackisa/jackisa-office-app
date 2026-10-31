'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, ShieldCheck } from 'lucide-react'

const JACKISA_LOGO = 'https://jackisa.com/themes/playtag/img/icon.png'

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
export function ContinueWithJackisa({
  label = 'Continue with Jackisa',
  redirect,
  compact = false,
}: {
  label?: string
  redirect?: string
  compact?: boolean
}) {
  const [loading, setLoading] = useState(false)

  const start = () => {
    setLoading(true)
    const back = redirect || `${window.location.origin}/auth/callback`
    const url = `https://jackisa.com/office_sso.php?redirect=${encodeURIComponent(back)}`
    window.location.href = url
  }

  return (
    <div className="space-y-2.5">
      <Button
        type="button"
        onClick={start}
        disabled={loading}
        aria-label="Sign in with your Jackisa account"
        className="w-full h-12 rounded-xl font-semibold bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-sm hover:shadow transition-all active:scale-[0.99]"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 mr-2.5 animate-spin text-slate-500" />
        ) : (
          <img src={JACKISA_LOGO} alt="" className="w-5 h-5 mr-2.5 object-contain" />
        )}
        <span className="text-[15px]">{loading ? 'Taking you to Jackisa…' : label}</span>
      </Button>
      {!compact && (
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/60">
          <ShieldCheck className="w-3 h-3" />
          One account across Jackisa — your profile and photo come with you
        </p>
      )}
    </div>
  )
}
