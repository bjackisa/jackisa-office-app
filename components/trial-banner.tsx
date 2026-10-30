'use client'

import Link from 'next/link'
import { useLicense } from '@/lib/lic/useLicense'
import { Button } from '@/components/ui/button'
import { Sparkles, X, AlertTriangle } from 'lucide-react'
import { useState } from 'react'

/**
 * Trial / expiry notice shown across the app shell.
 * - During a trial: shows days left with an upgrade CTA and a dismiss control.
 * - Within 5 days of a paid licence expiring: shows a renewal nudge.
 */
export function TrialBanner() {
  const { trial, valid, status, daysRemaining, loading } = useLicense()
  const [dismissed, setDismissed] = useState(false)

  if (loading || dismissed) return null

  if (trial?.active) {
    const urgent = (trial.daysLeft ?? 99) <= 2
    return (
      <div className={`flex items-center gap-3 px-4 py-2.5 text-sm ${urgent ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-primary/[0.06] text-primary'}`}>
        <Sparkles className="w-4 h-4 flex-shrink-0" />
        <p className="flex-1">
          You are on a free trial — <strong>{trial.daysLeft} day{trial.daysLeft === 1 ? '' : 's'} left</strong>.
          {urgent ? ' Add a payment number to avoid interruption.' : ' Upgrade any time to keep your workspace.'}
        </p>
        <Button asChild size="sm" variant={urgent ? 'default' : 'outline'} className="h-8">
          <Link href="/app/settings/billing">Upgrade</Link>
        </Button>
        <button onClick={() => setDismissed(true)} className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10" aria-label="Dismiss">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  if (valid && daysRemaining !== null && daysRemaining <= 5 && status !== 'trial') {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 text-sm bg-amber-500/10 text-amber-700 dark:text-amber-300">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <p className="flex-1">
          Your licence expires in <strong>{daysRemaining} day{daysRemaining === 1 ? '' : 's'}</strong>. Renew to stay online.
        </p>
        <Button asChild size="sm" variant="outline" className="h-8">
          <Link href="/app/settings/billing">Renew</Link>
        </Button>
      </div>
    )
  }

  return null
}
