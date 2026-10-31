'use client'

/**
 * Remembers the plan a visitor chose, from the moment they tap it on the
 * landing/register screen until they actually pay for it. The signup round-trip
 * (email verification, "Continue with Jackisa", or a device switch) reloads the
 * page, so a plain React state would be lost; this keeps it in localStorage.
 *
 * The value is only cleared once a licence is active, so the billing page can
 * pre-select the plan even after the workspace has been created.
 */

const KEY = 'jackisa:plan'

export interface RememberedPlan {
  code: string
  tier: 'basic' | 'pro' | 'platinum'
  intervalMonths: number
}

/** Parse a plan code like `pro_12m` into its parts. */
export function parsePlanCode(code: string | null | undefined): RememberedPlan | null {
  if (!code) return null
  const m = String(code).match(/^(basic|pro|platinum)_(\d+)m$/)
  if (!m) return null
  return { code: String(code), tier: m[1] as RememberedPlan['tier'], intervalMonths: Number(m[2]) }
}

export function rememberPlan(code: string | null | undefined): void {
  const parsed = parsePlanCode(code)
  if (!parsed) return
  try {
    localStorage.setItem(KEY, JSON.stringify(parsed))
  } catch {}
}

export function recallPlan(): RememberedPlan | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsePlanCode(parsed?.code)
  } catch {
    return null
  }
}

export function clearPlan(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {}
}
