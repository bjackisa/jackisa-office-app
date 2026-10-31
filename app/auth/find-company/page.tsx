'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { BadgeCheck, Building2, CheckCircle2, Search } from 'lucide-react'

type Company = {
  id: string
  name: string
  logo_url: string | null
  kind: string | null
  verified: boolean | null
  industry: string | null
}

/**
 * Find a company to join without an invite link. Search the workspace
 * directory and request admission — a company admin approves from
 * Settings → Team. A person may belong to more than one company.
 */
export default function FindCompanyPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Company[]>([])
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)
  const [requested, setRequested] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data?.user))
  }, [])

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim().length < 2) return
    setSearching(true)
    setMessage(null)
    try {
      const res = await apiFetch('/api/companies/members', {
        method: 'POST',
        body: JSON.stringify({ action: 'search_companies', query }),
      })
      const json = await res.json()
      if (json.ok) setResults(json.companies || [])
      else setMessage(json.error || 'Search failed')
    } catch {
      setMessage('Search failed')
    } finally {
      setSearching(false)
    }
  }

  const request = async (company: Company) => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await apiFetch('/api/companies/members', {
        method: 'POST',
        body: JSON.stringify({ action: 'request_join', companyId: company.id }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Could not send your request')
      setRequested((r) => ({ ...r, [company.id]: true }))
      setMessage(`Request sent to ${company.name}. An administrator will review it.`)
    } catch (err: any) {
      setMessage(err?.message || 'Could not send your request')
    } finally {
      setBusy(false)
    }
  }

  if (signedIn === null) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner className="w-6 h-6 text-primary" /></div>
  }

  if (!signedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="p-8 max-w-md text-center">
          <h1 className="text-lg font-bold mb-2">Sign in to find your team</h1>
          <p className="text-sm text-muted-foreground mb-5">Search for a company and request to join it.</p>
          <Button asChild className="w-full"><Link href="/auth/login">Sign in</Link></Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Find a company</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search for a workspace and request to join. You can belong to more than one company.
          </p>
        </div>

        <form onSubmit={search} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Company name…"
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={searching || query.trim().length < 2}>
            {searching ? 'Searching…' : 'Search'}
          </Button>
        </form>

        {message && <p className="text-sm text-muted-foreground">{message}</p>}

        <div className="space-y-3">
          {results.map((c) => (
            <Card key={c.id} className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {c.logo_url ? (
                  <img src={c.logo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-5 h-5 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold truncate">{c.name}</p>
                  {c.verified && <BadgeCheck className="w-4 h-4 text-amber-500 flex-shrink-0" aria-label="Verified company" />}
                </div>
                <p className="text-xs text-muted-foreground capitalize">
                  {c.kind || 'company'}{c.industry ? ` · ${c.industry}` : ''}
                </p>
              </div>
              {requested[c.id] ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" /> Requested
                </span>
              ) : (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => request(c)}>
                  Request to join
                </Button>
              )}
            </Card>
          ))}
          {!searching && query.trim().length >= 2 && results.length === 0 && !message && (
            <p className="text-sm text-muted-foreground text-center py-6">No companies match “{query}”.</p>
          )}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Have an invite link? <Link href="/auth/join" className="text-primary font-semibold">Join with a link</Link>
        </p>
      </div>
    </div>
  )
}
