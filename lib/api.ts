'use client'

import { supabase } from '@/lib/supabase'

/**
 * fetch() that attaches the current Supabase access token, so authenticated
 * API routes can verify the caller instead of trusting the request body.
 *
 * Use this for every call to an /api/* route that acts on a company's data.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  let token: string | undefined
  try {
    const { data } = await supabase.auth.getSession()
    token = data.session?.access_token
  } catch {}

  const headers = new Headers(init.headers || {})
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  return fetch(input, { ...init, headers })
}

/** apiFetch + JSON parse, returning `{}` on an empty or invalid body. */
export async function apiJson<T = any>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(input, init)
  try {
    return (await res.json()) as T
  } catch {
    return {} as T
  }
}
