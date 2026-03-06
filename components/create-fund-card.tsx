'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Landmark,
  Rocket,
  RefreshCw,
  CheckCircle,
  TrendingUp,
  Shield,
  Users,
  DollarSign,
  Zap,
} from 'lucide-react'

interface CreateFundCardProps {
  companyId: string
  userId: string
  onCreated?: () => void
}

export function CreateFundCard({ companyId, userId, onCreated }: CreateFundCardProps) {
  const [step, setStep] = useState<'intro' | 'form' | 'creating' | 'done'>('intro')
  const [form, setForm] = useState({
    fund_name: '',
    currency: 'UGX',
    sales_profit_alloc_pct: '10',
  })
  const [error, setError] = useState<string | null>(null)

  const createFund = async () => {
    if (!form.fund_name.trim()) {
      setError('Please enter a fund name.')
      return
    }
    setStep('creating')
    setError(null)

    try {
      const { error: insertErr } = await supabase.from('workspace_funds').insert({
        company_id: companyId,
        fund_name: form.fund_name.trim(),
        currency: form.currency,
        inception_date: new Date().toISOString().split('T')[0],
        nav_per_unit: 1.0,
        total_units_outstanding: 0,
        total_assets: 0,
        total_liabilities: 0,
        cash_pool: 0,
        trailing_annual_return: 0.08,
        sales_profit_alloc_pct: Number(form.sales_profit_alloc_pct || 10) / 100,
        min_daily_sales_threshold: 0,
      })

      if (insertErr) {
        if (insertErr.message?.includes('duplicate') || insertErr.message?.includes('unique')) {
          setError('A fund already exists for this company. Please refresh the page.')
        } else {
          throw insertErr
        }
        setStep('form')
        return
      }

      setStep('done')
      setTimeout(() => onCreated?.(), 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to create fund.')
      setStep('form')
    }
  }

  if (step === 'done') {
    return (
      <Card className="p-8 border-emerald-200 bg-emerald-50/50 text-center">
        <CheckCircle className="w-12 h-12 mx-auto text-emerald-600 mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-1">Fund Created Successfully!</h2>
        <p className="text-sm text-muted-foreground">Your workspace investment fund is now live. Loading dashboard...</p>
      </Card>
    )
  }

  if (step === 'creating') {
    return (
      <Card className="p-8 text-center">
        <RefreshCw className="w-8 h-8 mx-auto text-primary animate-spin mb-4" />
        <h2 className="text-lg font-semibold text-foreground">Setting up your fund...</h2>
        <p className="text-sm text-muted-foreground mt-1">Initializing NAV, fee structure, and member positions</p>
      </Card>
    )
  }

  if (step === 'form') {
    return (
      <div className="space-y-6">
        <Card className="p-6 border border-primary/15 bg-primary/[0.02] space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Landmark className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Configure Your Fund</h3>
              <p className="text-[11px] text-muted-foreground/60">Set up the basics — you can adjust all settings later</p>
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">{error}</div>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Fund Name *</label>
              <Input
                placeholder="e.g. Company Growth Fund"
                value={form.fund_name}
                onChange={(e) => setForm({ ...form, fund_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Currency</label>
              <select
                className="form-select"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <option value="UGX">UGX — Uganda Shilling</option>
                <option value="USD">USD — US Dollar</option>
                <option value="KES">KES — Kenya Shilling</option>
                <option value="TZS">TZS — Tanzania Shilling</option>
                <option value="RWF">RWF — Rwanda Franc</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="EUR">EUR — Euro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Revenue Share to Fund (%)</label>
              <Input
                type="number"
                placeholder="10"
                value={form.sales_profit_alloc_pct}
                onChange={(e) => setForm({ ...form, sales_profit_alloc_pct: e.target.value })}
                min={0}
                max={100}
              />
              <p className="text-[10px] text-muted-foreground/50 mt-1">% of daily profit auto-allocated to fund</p>
            </div>
          </div>

          <div className="pt-4 border-t border-border/30 flex items-center gap-3">
            <Button onClick={createFund}>
              <Rocket className="w-4 h-4 mr-1.5" />Launch Fund
            </Button>
            <Button variant="outline" onClick={() => setStep('intro')}>Back</Button>
          </div>
        </Card>
      </div>
    )
  }

  // Intro step
  return (
    <div className="space-y-6">
      <Card className="p-8 border border-primary/15 bg-gradient-to-br from-primary/[0.04] to-transparent text-center">
        <Landmark className="w-14 h-14 mx-auto text-primary/60 mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Start Your Workspace Investment Fund</h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-6">
          Create a fund for your company and its employees. Revenue from sales, invoices, and daily operations
          will automatically flow into the fund. Employees can buy units, track returns, and build wealth together.
        </p>
        <Button size="lg" onClick={() => setStep('form')}>
          <Rocket className="w-4 h-4 mr-2" />Create Your Fund
        </Button>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        {[
          {
            icon: Zap,
            title: 'Automated Revenue Flow',
            desc: 'Sales, invoices, and commissions auto-allocate a share of profit to the fund. NAV updates daily.',
            color: 'text-blue-600',
            bg: 'bg-blue-50',
          },
          {
            icon: Users,
            title: 'Employee Wealth Building',
            desc: 'Employees buy units, track signals, set up standing orders, and designate beneficiaries.',
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
          },
          {
            icon: Shield,
            title: 'Full Transparency',
            desc: 'Three-tier fee waterfall: Jackisa platform fee → Management fee → Net to member. Everything is visible.',
            color: 'text-purple-600',
            bg: 'bg-purple-50',
          },
        ].map((f) => (
          <Card key={f.title} className="p-5">
            <div className={`w-10 h-10 rounded-xl ${f.bg} flex items-center justify-center mb-3`}>
              <f.icon className={`w-5 h-5 ${f.color}`} />
            </div>
            <h4 className="text-sm font-semibold text-foreground mb-1">{f.title}</h4>
            <p className="text-xs text-muted-foreground/70 leading-relaxed">{f.desc}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5 bg-muted/10">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />What Happens When You Create a Fund
        </h4>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs text-muted-foreground">
          {[
            'NAV starts at 1.0000 per unit',
            'Employees can immediately buy units',
            'Sales revenue auto-allocates to fund cash pool',
            'Invoice payments trigger fund contributions',
            'Payroll can auto-contribute a % of salary',
            'Attendance data feeds performance signals',
            'Daily compounding runs automatically',
            'Projections & reports available instantly',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 py-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
