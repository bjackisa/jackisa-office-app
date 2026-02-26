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
    <div className="p-6 lg:p-8 max-w-[1000px] mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Billing</h1>
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4"><p className="text-xs text-gray-500">Billed Total</p><p className="text-2xl font-bold">{invoiceTotals.total.toLocaleString()}</p></Card>
        <Card className="p-4"><p className="text-xs text-gray-500">Collected</p><p className="text-2xl font-bold">{invoiceTotals.paid.toLocaleString()}</p></Card>
        <Card className="p-4"><p className="text-xs text-gray-500">Outstanding</p><p className="text-2xl font-bold">{invoiceTotals.outstanding.toLocaleString()}</p></Card>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold mb-2">Current Subscription</h2>
        {subscription ? (
          <div className="text-sm space-y-1">
            <p><span className="text-gray-500">Tier:</span> {subscription.tier}</p>
            <p><span className="text-gray-500">Status:</span> {subscription.status}</p>
            <p><span className="text-gray-500">Billing cycle:</span> {subscription.billing_cycle}</p>
            <p><span className="text-gray-500">Monthly cost:</span> {Number(subscription.monthly_cost || 0).toLocaleString()}</p>
          </div>
        ) : <p className="text-sm text-gray-500">No subscription record found.</p>}
      </Card>
    </div>
  )
}
