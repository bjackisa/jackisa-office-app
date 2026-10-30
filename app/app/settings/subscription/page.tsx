'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/ui/spinner'

/**
 * Legacy subscription route. The real licensing + billing surface lives at
 * /app/settings/billing, backed by the licence hub rather than the retired
 * `subscription_plans` table. Keep the route so old links still land somewhere.
 */
export default function SubscriptionPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/app/settings/billing')
  }, [router])

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="w-6 h-6 text-primary" />
        <p className="text-sm text-muted-foreground">Taking you to billing…</p>
      </div>
    </div>
  )
}
