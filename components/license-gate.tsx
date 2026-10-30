'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLicense } from '@/lib/lic/useLicense'
import { FEATURES, requiredTier } from '@/lib/lic/features'
import { featureForRoute } from '@/components/sidebar-nav'
import { Button } from '@/components/ui/button'
import { Lock, ArrowUpRight, ShieldAlert } from 'lucide-react'

/** Routes that must always stay reachable so a user can fix their licence. */
const UNGATED = ['/app/settings', '/app', '/app/helpdesk']

/**
 * Route-aware gate. Reads the current path, maps it to a feature slug and
 * blocks the page when the tier, business type or role does not unlock it.
 * Settings stay open so the billing page is always reachable.
 */
export function RouteLicenseGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (UNGATED.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return <>{children}</>
  }
  const feature = featureForRoute(pathname)
  if (!feature) return <>{children}</>
  return <LicenseGate feature={feature}>{children}</LicenseGate>
}

/**
 * Route-level gate. Wrap any page's content:
 *   <LicenseGate feature="education"> ... </LicenseGate>
 * Shows an upgrade prompt when the tier/role does not unlock the feature, and a
 * "licence expired" notice when the licence is not valid.
 */
export function LicenseGate({ feature, children }: { feature?: string; children: React.ReactNode }) {
  const { loading, valid, status, can, tier, trial } = useLicense()

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    )
  }

  if (!valid && status !== 'unknown') {
    return (
      <div className="max-w-lg mx-auto mt-16 p-8 rounded-2xl border border-destructive/20 bg-card text-center">
        <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-5">
          <ShieldAlert className="w-7 h-7 text-destructive" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-2">Your licence has lapsed</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Renew your Jackisa Office licence to restore access to your workspace.
        </p>
        <Button asChild className="shadow-glow-primary">
          <Link href="/app/settings/billing">Renew now</Link>
        </Button>
      </div>
    )
  }

  if (feature && !can(feature)) {
    const def = FEATURES[feature]
    const need = requiredTier(feature)
    return (
      <div className="max-w-lg mx-auto mt-16 p-8 rounded-2xl border border-border/50 bg-card text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
          <Lock className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-2">{def?.name || 'This feature'} is not on your plan</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {def?.name || 'This feature'} needs the <span className="font-semibold capitalize">{need}</span> tier.
          You are on <span className="font-semibold capitalize">{tier}</span>
          {trial?.active ? ' (trial)' : ''}. Upgrade to unlock it.
        </p>
        <Button asChild className="shadow-glow-primary">
          <Link href="/app/settings/billing">
            Upgrade plan <ArrowUpRight className="w-4 h-4 ml-1.5" />
          </Link>
        </Button>
      </div>
    )
  }

  return <>{children}</>
}
