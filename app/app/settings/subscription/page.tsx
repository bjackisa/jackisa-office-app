'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, X, AlertCircle } from 'lucide-react'
import type { CompanySubscription, SubscriptionPlan } from '@/types'

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<CompanySubscription | null>(null)
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSubscription = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { data: employeeData } = await supabase
          .from('employees')
          .select('company_id')
          .eq('user_id', session.user.id)
          .single()

        if (employeeData) {
          // Get current subscription
          const { data: subData } = await supabase
            .from('company_subscriptions')
            .select('*, plan:subscription_plans(*)')
            .eq('company_id', employeeData.company_id)
            .single()

          if (subData) {
            setSubscription(subData)
          }

          // Get all plans
          const { data: plansData } = await supabase
            .from('subscription_plans')
            .select('*')

          if (plansData) {
            setPlans(plansData)
          }
        }
      } catch (error) {
        console.error('Failed to load subscription:', error)
      } finally {
        setLoading(false)
      }
    }

    loadSubscription()
  }, [])

  const planFeatures = {
    basic: [
      { feature: 'Employees', included: true, value: 'Up to 10' },
      { feature: 'Storage', included: true, value: '5 GB' },
      { feature: 'Accounting Tools', included: true },
      { feature: 'HR Management', included: true },
      { feature: 'Education Module', included: false },
      { feature: 'API Access', included: false },
      { feature: 'Support', included: true, value: 'Email' },
    ],
    pro: [
      { feature: 'Employees', included: true, value: 'Up to 100' },
      { feature: 'Storage', included: true, value: '50 GB' },
      { feature: 'Accounting Tools', included: true },
      { feature: 'HR Management', included: true },
      { feature: 'Education Module', included: true },
      { feature: 'API Access', included: false },
      { feature: 'Support', included: true, value: 'Priority' },
    ],
    platinum: [
      { feature: 'Employees', included: true, value: 'Unlimited' },
      { feature: 'Storage', included: true, value: '500 GB' },
      { feature: 'Accounting Tools', included: true },
      { feature: 'HR Management', included: true },
      { feature: 'Education Module', included: true },
      { feature: 'API Access', included: true },
      { feature: 'Support', included: true, value: '24/7 Dedicated' },
    ],
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded mb-4 w-1/3" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Subscription & Billing</h1>
        <p className="text-muted-foreground">Manage your Jackisa Office subscription</p>
      </div>

      {/* Current Subscription */}
      {subscription && (
        <Card className="p-6 border border-border mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Current Plan</h2>
              <div className="space-y-2">
                <p className="text-foreground">
                  <span className="font-medium capitalize">{subscription.billing_cycle}</span> billing cycle
                </p>
                <p className="text-sm text-muted-foreground">
                  Renewal date: {new Date(subscription.end_date).toLocaleDateString()}
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <div className={`w-2 h-2 rounded-full ${subscription.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-sm font-medium text-foreground capitalize">
                    {subscription.status}
                  </span>
                </div>
              </div>
            </div>
            <Button variant="outline">Change Plan</Button>
          </div>
        </Card>
      )}

      {/* Plans Comparison */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-6">Choose Your Plan</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrentPlan = subscription?.plan_id === plan.id
            const features = planFeatures[plan.tier as keyof typeof planFeatures] || []

            return (
              <Card
                key={plan.id}
                className={`p-6 border transition-all ${
                  isCurrentPlan
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:shadow-lg'
                }`}
              >
                {isCurrentPlan && (
                  <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
                    Current Plan
                  </div>
                )}
                <h3 className="text-2xl font-bold text-foreground mb-2 capitalize">{plan.name}</h3>
                <div className="mb-6">
                  <span className="text-3xl font-bold text-foreground">${plan.monthly_price}</span>
                  <span className="text-muted-foreground ml-2">/month</span>
                  <p className="text-xs text-muted-foreground mt-2">or ${plan.yearly_price}/year</p>
                </div>

                <Button className="w-full mb-6" disabled={isCurrentPlan} variant={isCurrentPlan ? 'outline' : 'default'}>
                  {isCurrentPlan ? 'Current Plan' : 'Upgrade'}
                </Button>

                <div className="space-y-3">
                  {features.map((f) => (
                    <div key={f.feature} className="flex items-start gap-2">
                      {f.included ? (
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="text-sm text-foreground">{f.feature}</p>
                        {'value' in f && f.value && (
                          <p className="text-xs text-muted-foreground">{f.value}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Billing Information */}
      <Card className="p-6 border border-border">
        <h2 className="text-lg font-semibold text-foreground mb-4">Billing Information</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Billing Email</p>
            <p className="text-foreground">company@example.com</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Payment Method</p>
            <p className="text-foreground">Visa ending in 4242</p>
          </div>
          <div className="pt-4 border-t border-border">
            <Button variant="outline">Update Payment Method</Button>
          </div>
        </div>
      </Card>

      {subscription?.status === 'expired' && (
        <Card className="mt-8 p-4 border border-destructive/30 bg-destructive/10 flex items-gap-3">
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
          <div>
            <p className="font-medium text-destructive">Subscription Expired</p>
            <p className="text-sm text-destructive/80">Please renew your subscription to continue using Jackisa Office</p>
          </div>
        </Card>
      )}
    </div>
  )
}
