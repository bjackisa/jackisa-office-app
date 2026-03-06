'use client'

import { useEffect, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'

export default function BillingPage() {
  const [subscription, setSubscription] = useState<any | null>(null)
  const [invoiceTotals, setInvoiceTotals] = useState({ total: 0, paid: 0, outstanding: 0 })

  useEffect(() => {
    const load = async () => {
      const ctx = await getSessionContext(); if (!ctx?.companyId) return

      const [subRes, invRes] = await Promise.all([
        supabase.from('company_subscriptions').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('invoices').select('total_amount, paid_amount, status').eq('company_id', ctx.companyId),
      ])

      setSubscription(subRes.data || null)

      const inv = invRes.data || []
      const total = inv.reduce((s:any, i:any) => s + Number(i.total_amount || 0), 0)
      const paid = inv.reduce((s:any, i:any) => s + Number(i.paid_amount || 0), 0)
      setInvoiceTotals({ total, paid, outstanding: Math.max(total - paid, 0) })
    }
    load()
  }, [])

  return (
    <div className="p-6 lg:p-8 max-w-[1000px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Overview of your billing and subscription</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 stagger-children">
        {[
          { label: 'Billed Total', value: invoiceTotals.total.toLocaleString() },
          { label: 'Collected', value: invoiceTotals.paid.toLocaleString() },
          { label: 'Outstanding', value: invoiceTotals.outstanding.toLocaleString() },
        ].map(stat => (
          <Card key={stat.label} className="stat-card p-4">
            <p className="text-[11px] text-muted-foreground font-medium mb-1">{stat.label}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border/30">
          <h2 className="text-sm font-semibold text-foreground">Current Subscription</h2>
        </div>
        <div className="p-5">
          {subscription ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Tier</p>
                <p className="font-medium text-foreground capitalize">{subscription.tier}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <span className={`badge ${subscription.status === 'active' ? 'badge-success' : 'badge-warning'}`}>{subscription.status}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Billing Cycle</p>
                <p className="font-medium text-foreground capitalize">{subscription.billing_cycle}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Monthly Cost</p>
                <p className="font-bold text-foreground font-mono tabular-nums">{Number(subscription.monthly_cost || 0).toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground font-medium">No subscription record found</p>
              <p className="text-xs text-muted-foreground/40 mt-1">Contact support to set up your plan</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
