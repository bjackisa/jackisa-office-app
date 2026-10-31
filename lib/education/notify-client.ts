/**
 * Browser-side helper for the education notification API.
 *
 * Marks are recorded by the browser directly into Supabase (fast, and the RLS
 * policies already scope them to the company). This helper then asks the server
 * to do the part the browser cannot: compute the standing, render the PDF on
 * the hub and send it to the guardian.
 */

export interface NotifyResult {
  ok: boolean
  documentUrl?: string | null
  error?: string
  standing?: any
}

export async function notifyStudent(params: {
  companyId: string
  studentId: string
  kind: 'marks' | 'transcript'
  module?: { code?: string; name?: string }
  assessment?: {
    kind?: string
    day_number?: number | string
    title?: string
    marks_obtained?: number
    max_marks?: number
  }
}): Promise<NotifyResult> {
  try {
    const res = await fetch('/api/education/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    const json = (await res.json()) as NotifyResult
    return json
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Could not reach the notification service' }
  }
}
