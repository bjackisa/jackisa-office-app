'use client'

import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'

/**
 * Completes a "Continue with Jackisa" hand-off, wherever it landed.
 *
 * jackisa.com/office_sso.php returns the visitor to the calling page with
 * `?access_token=...` appended. This exchanges that token for a real Jackisa
 * Office session in three steps:
 *   1. POST /api/auth/jackisa        — verify the jackisa.com session (hub)
 *   2. POST /api/auth/jackisa/exchange — mint a one-time email token
 *   3. verifyOtp in place, or follow the magic link as a fallback
 *
 * Shared by /auth/callback and /auth/join so an invite link works with SSO too.
 */
export async function establishSessionFromJackisa(accessToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const ssoRes = await apiFetch('/api/auth/jackisa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken }),
    })
    const ssoJson = await ssoRes.json()
    if (!ssoJson.ok || !ssoJson.ssoToken) {
      return { ok: false, error: ssoJson.error || 'Jackisa sign-in failed' }
    }

    const exRes = await apiFetch('/api/auth/jackisa/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssoToken: ssoJson.ssoToken }),
    })
    const exJson = await exRes.json()
    if (!exJson.ok) return { ok: false, error: exJson.error || 'Could not complete sign-in' }

    // Preferred: verify the one-time token in place. Works regardless of the
    // Supabase magic-link/PKCE setting.
    if (exJson.tokenHash && exJson.email) {
      const { error: otpErr } = await supabase.auth.verifyOtp({
        token_hash: exJson.tokenHash,
        type: (exJson.otpType || 'email') as any,
      })
      if (!otpErr) return { ok: true }
    }

    if (exJson.magicLink) {
      window.location.href = exJson.magicLink
      return { ok: true }
    }
    return { ok: false, error: 'Could not complete sign-in' }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Sign-in failed' }
  }
}
