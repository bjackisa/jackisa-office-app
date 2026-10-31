import type { NextRequest } from 'next/server'

/**
 * A small in-process fixed-window rate limiter for API routes.
 *
 * Serverless instances are short-lived and per-instance, so this is a best-effort
 * brake on abuse (credential stuffing, trial farming, payment-spam) rather than a
 * global quota. For a hard global limit put a shared store (Upstash/Redis) behind
 * `hit()`. It is deliberately dependency-free so it works on any deployment.
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_KEYS = 10_000

export interface RateLimitOptions {
  /** Window length in seconds. */
  windowSeconds: number
  /** Allowed requests per window per key. */
  max: number
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSeconds: number
}

/** The caller's best-known IP, from proxy headers Vercel sets. */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

/**
 * Count one hit against `key`. Returns ok=false once the window is exhausted.
 * Keys are namespaced by the caller (e.g. `login:<ip>`).
 */
export function hit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  if (buckets.size > MAX_KEYS) sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowSeconds * 1000 })
    return { ok: true, remaining: opts.max - 1, retryAfterSeconds: opts.windowSeconds }
  }

  existing.count += 1
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
  if (existing.count > opts.max) {
    return { ok: false, remaining: 0, retryAfterSeconds }
  }
  return { ok: true, remaining: opts.max - existing.count, retryAfterSeconds }
}

/** Convenience: rate limit by client IP within a named scope. */
export function hitIp(req: NextRequest, scope: string, opts: RateLimitOptions): RateLimitResult {
  return hit(`${scope}:${clientIp(req)}`, opts)
}

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}
