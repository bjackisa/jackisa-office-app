'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ArrowDownCircle,
  RefreshCw,
  Wallet,
  DollarSign,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react'
import PaymentModal from '@/components/payment-modal'

export default function SellUnitsPage() {
  const [fund, setFund] = useState<any>(null)
  const [position, setPosition] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [unitsToSell, setUnitsToSell] = useState('')
  const [mode, setMode] = useState<'units' | 'amount'>('units')
  const [targetAmount, setTargetAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId || !ctx.userId) { setLoading(false); return }
    setUserId(ctx.userId)
    setCompanyId(ctx.companyId)

    const { data: fundData } = await supabase
      .from('workspace_funds').select('*').eq('company_id', ctx.companyId).maybeSingle()
    if (!fundData) { setLoading(false); return }
    setFund(fundData)

    const { data: empData } = await supabase
      .from('company_employees').select('id').eq('company_id', ctx.companyId).eq('user_id', ctx.userId).maybeSingle()
    if (!empData) { setLoading(false); return }

    const { data: posData } = await supabase
      .from('fund_member_positions').select('*').eq('fund_id', fundData.id).eq('employee_id', empData.id).maybeSingle()
    setPosition(posData)
    setLoading(false)
  }

  const nav = fund?.nav_per_unit || 1
  const maxUnits = position?.total_units || 0

  const effectiveUnits = useMemo(() => {
    if (mode === 'units') return Math.min(Number(unitsToSell) || 0, maxUnits)
    // Reverse calc: target amount → units needed
    const target = Number(targetAmount) || 0
    if (target <= 0 || !fund) return 0
    // Iterative: gross = units * nav, net = gross - fee - tax
    // Approximate: units = target / (nav * (1 - exitFeeRate) * (1 - 0.15 * gainRatio))
    const exitRate = fund.jackisa_exit_fee_rate || 0.0075
    let guess = target / (nav * (1 - exitRate))
    return Math.min(guess, maxUnits)
  }, [mode, unitsToSell, targetAmount, fund, nav, maxUnits])

  const preview = useMemo(() => {
    if (!fund || !position || effectiveUnits <= 0) return null
    const gross = effectiveUnits * nav
    const exitFee = Math.round(gross * (fund.jackisa_exit_fee_rate || 0.0075) * 100) / 100
    const afterFee = gross - exitFee
    const costBasis = (position.avg_cost_basis || 0) * effectiveUnits
    const capitalGain = Math.max(0, afterFee - costBasis)
    const wht = Math.round(capitalGain * 0.15 * 100) / 100
    const net = afterFee - wht
    return { gross, exitFee, afterFee, costBasis, capitalGain, wht, net }
  }, [fund, position, effectiveUnits, nav])

  const handleSell = async () => {
    if (!fund || !position || effectiveUnits <= 0 || !userId) return
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const { error: rpcErr } = await supabase.rpc('process_redemption', {
        p_fund_id: fund.id,
        p_member_position_id: position.id,
        p_units_to_sell: effectiveUnits,
        p_recorded_by: userId,
      })
      if (rpcErr) throw rpcErr

      setSuccess(`Successfully redeemed ${effectiveUnits.toFixed(4)} units. Net payout: ${fund.currency} ${preview?.net.toLocaleString()}.`)
      setUnitsToSell('')
      setTargetAmount('')
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Failed to process redemption.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[900px] mx-auto animate-fade-in">
        <div className="flex items-center justify-center py-20"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground/40" /></div>
      </div>
    )
  }

  if (!fund || !position || maxUnits <= 0) {
    return (
      <div className="p-6 lg:p-8 max-w-[900px] mx-auto animate-fade-in text-center py-20">
        <Wallet className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold">No Units to Sell</h2>
        <p className="text-sm text-muted-foreground">You don&apos;t hold any units in this fund.</p>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Sell Units</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Redeem your units from {fund.fund_name}</p>
      </div>

      {/* Position summary */}
      <Card className="p-4 border border-primary/15 bg-primary/[0.02]">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Units Available</p>
            <p className="text-lg font-bold font-mono">{maxUnits.toFixed(4)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Current NAV</p>
            <p className="text-lg font-bold font-mono">{fund.currency} {nav.toFixed(4)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Portfolio Value</p>
            <p className="text-lg font-bold font-mono">{fund.currency} {(maxUnits * nav).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
      </Card>

      {success && (
        <Card className="p-4 border-emerald-200 bg-emerald-50">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-700 font-medium">{success}</p>
          </div>
        </Card>
      )}

      {error && (
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-sm text-red-600 font-medium">{error}</p>
        </Card>
      )}

      <Card className="p-6 space-y-5">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('units')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${mode === 'units' ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'}`}
          >
            Specify Units
          </button>
          <button
            onClick={() => setMode('amount')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${mode === 'amount' ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'}`}
          >
            Specify Target Payout
          </button>
        </div>

        {mode === 'units' ? (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Units to Sell *</label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Enter units..."
                value={unitsToSell}
                onChange={(e) => setUnitsToSell(e.target.value)}
                className="text-lg font-mono"
                max={maxUnits}
                step="0.0001"
              />
              <Button variant="outline" size="sm" onClick={() => setUnitsToSell(maxUnits.toString())}>Max</Button>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Target Payout Amount ({fund.currency}) *</label>
            <Input
              type="number"
              placeholder={`How much ${fund.currency} do you need?`}
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              className="text-lg font-mono"
            />
            {effectiveUnits > 0 && (
              <p className="text-xs text-muted-foreground mt-1">≈ {effectiveUnits.toFixed(4)} units will be sold</p>
            )}
          </div>
        )}

        {/* Payout Preview */}
        {preview && (
          <div className="space-y-3 p-4 rounded-xl bg-muted/20 border border-border/30">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Payout Breakdown</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Gross redemption ({effectiveUnits.toFixed(4)} × {nav.toFixed(4)})</span>
                <span className="text-xs font-mono">{fund.currency} {preview.gross.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Exit fee ({((fund.jackisa_exit_fee_rate || 0.0075) * 100).toFixed(2)}%)</span>
                <span className="text-xs font-mono text-red-500">-{fund.currency} {preview.exitFee.toLocaleString()}</span>
              </div>
              <div className="border-t border-border/20 pt-2">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Cost basis for sold units</span>
                  <span className="text-xs font-mono text-muted-foreground">{fund.currency} {preview.costBasis.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Capital gain</span>
                  <span className={`text-xs font-mono ${preview.capitalGain > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    {fund.currency} {preview.capitalGain.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Withholding tax (15% on gains)</span>
                  <span className="text-xs font-mono text-red-500">-{fund.currency} {preview.wht.toLocaleString()}</span>
                </div>
              </div>
              <div className="border-t border-border/30 pt-2 flex justify-between">
                <span className="text-xs font-semibold text-foreground">Net payout to you</span>
                <span className="text-lg font-bold font-mono text-emerald-600">{fund.currency} {preview.net.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {effectiveUnits > maxUnits * 0.9 && effectiveUnits > 0 && (
          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <p className="text-xs">You are selling {effectiveUnits >= maxUnits ? 'all' : 'most'} of your units. This will significantly reduce your position.</p>
          </div>
        )}

        <Button onClick={() => { setError(null); setSuccess(null); setShowPayment(true) }} disabled={submitting || effectiveUnits <= 0} variant="destructive" className="w-full">
          <ArrowDownCircle className="w-4 h-4 mr-1.5" />
          Sell {effectiveUnits.toFixed(4)} Units — Receive {fund.currency} {(preview?.net || 0).toLocaleString()}
        </Button>
      </Card>

      {showPayment && companyId && preview && (
        <PaymentModal
          open={showPayment}
          onClose={() => setShowPayment(false)}
          onSuccess={async () => {
            setShowPayment(false)
            await handleSell()
          }}
          companyId={companyId}
          userId={userId || undefined}
          direction="disbursement"
          module="investment"
          moduleReferenceId={fund.id}
          moduleReferenceType="workspace_funds"
          amount={preview.net}
          currency={fund.currency}
          title="Investment Redemption Payout"
          description={`Selling ${effectiveUnits.toFixed(4)} units from ${fund.fund_name}`}
          metadata={{ fund_name: fund.fund_name, units: effectiveUnits, gross: preview.gross, net: preview.net }}
        />
      )}
    </div>
  )
}
