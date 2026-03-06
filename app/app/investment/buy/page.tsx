'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { ensureFundMemberPosition } from '@/lib/investment-membership'
import { getEffectiveFundNav } from '@/lib/investment-metrics'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RefreshCw, ArrowUpCircle, Wallet, DollarSign, Percent, TrendingUp, ShieldCheck, CheckCircle, PieChart, Shield } from 'lucide-react'
import { CreateFundCard } from '@/components/create-fund-card'
import PaymentModal from '@/components/payment-modal'

export default function BuyUnitsPage() {
  const [fund, setFund] = useState<any>(null)
  const [position, setPosition] = useState<any>(null)
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPayment, setShowPayment] = useState(false)

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
    setEmployeeId(empData.id)

    const posData = await ensureFundMemberPosition(ctx.companyId, ctx.userId, fundData.id)
    setPosition(posData)
    setLoading(false)
  }

  const grossAmount = Number(amount) || 0
  const preview = useMemo(() => {
    if (!fund || grossAmount <= 0) return null
    const jackisaFee = Math.round(grossAmount * (fund.jackisa_contribution_fee_rate || 0.015) * 100) / 100
    const afterJackisa = grossAmount - jackisaFee
    const mgmtFee = Math.round(afterJackisa * (fund.mgmt_contribution_fee_rate || 0.02) * 100) / 100
    const net = afterJackisa - mgmtFee
    const nav = getEffectiveFundNav(fund)
    const units = net / nav
    const totalUnitsAfter = (position?.total_units || 0) + units
    const totalFundUnits = (fund.total_units_outstanding || 0) + units
    const ownershipPct = totalFundUnits > 0 ? (totalUnitsAfter / totalFundUnits) * 100 : 0
    return { jackisaFee, mgmtFee, net, nav, units, ownershipPct, totalFees: jackisaFee + mgmtFee }
  }, [fund, grossAmount, position])

  const handleBuy = async () => {
    if (!fund || !employeeId || !userId || grossAmount <= 0) return
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const ensuredPosition = position || await ensureFundMemberPosition(companyId!, userId, fund.id)
      const posId = ensuredPosition?.id
      if (!posId) throw new Error('Could not initialize your fund membership position.')

      const { error: rpcErr } = await supabase.rpc('process_contribution', {
        p_fund_id: fund.id,
        p_member_position_id: posId,
        p_gross_amount: grossAmount,
        p_recorded_by: userId,
      })

      if (rpcErr) throw rpcErr

      setSuccess(`Successfully purchased ${preview?.units.toFixed(4)} units for ${fund.currency} ${preview?.net.toLocaleString()} (after fees).`)
      setAmount('')
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Failed to process contribution.')
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

  if (!fund) {
    return (
      <div className="p-6 lg:p-8 max-w-[900px] mx-auto animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Buy Units</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create your workspace fund first to start investing</p>
        </div>
        {companyId && userId && (
          <CreateFundCard companyId={companyId} userId={userId} onCreated={loadData} />
        )}
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Buy Units</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Invest in {fund.fund_name} — enter the amount you want to contribute</p>
      </div>

      {/* Current NAV info */}
      <Card className="p-4 border border-primary/15 bg-primary/[0.02]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10"><DollarSign className="w-4 h-4 text-primary" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Current NAV</p>
              <p className="text-lg font-bold font-mono">{fund.currency} {getEffectiveFundNav(fund).toFixed(4)}</p>
            </div>
          </div>
          {position && (
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Your Units</p>
              <p className="text-sm font-bold font-mono">{Number(position.total_units || 0).toFixed(4)}</p>
            </div>
          )}
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

      {/* Investment Form */}
      <Card className="p-6 space-y-5">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Contribution Amount ({fund.currency}) *</label>
          <Input
            type="number"
            placeholder={`Enter amount in ${fund.currency}...`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="text-lg font-mono"
            min={0}
          />
        </div>

        {/* Fee Preview */}
        {preview && (
          <div className="space-y-3 p-4 rounded-xl bg-muted/20 border border-border/30">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Transaction Preview</h4>
            <div className="space-y-2">
              {[
                { label: 'Gross contribution', value: `${fund.currency} ${grossAmount.toLocaleString()}`, bold: false },
                { label: `Jackisa platform fee (${((fund.jackisa_contribution_fee_rate || 0.015) * 100).toFixed(2)}%)`, value: `-${fund.currency} ${preview.jackisaFee.toLocaleString()}`, bold: false, red: true },
                { label: `Management fee (${((fund.mgmt_contribution_fee_rate || 0.02) * 100).toFixed(2)}%)`, value: `-${fund.currency} ${preview.mgmtFee.toLocaleString()}`, bold: false, red: true },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                  <span className={`text-xs font-mono tabular-nums ${(row as any).red ? 'text-red-500' : 'text-foreground'}`}>{row.value}</span>
                </div>
              ))}
              <div className="border-t border-border/30 pt-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Net amount invested</span>
                <span className="text-sm font-bold font-mono text-emerald-600">{fund.currency} {preview.net.toLocaleString()}</span>
              </div>
              <div className="border-t border-border/30 pt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5"><PieChart className="w-3 h-3" /> Units you will receive</span>
                  <span className="text-sm font-bold font-mono text-foreground">{preview.units.toFixed(6)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Shield className="w-3 h-3" /> Your ownership of fund</span>
                  <span className="text-xs font-mono text-muted-foreground">{preview.ownershipPct.toFixed(4)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <Button onClick={() => { setError(null); setSuccess(null); setShowPayment(true) }} disabled={submitting || grossAmount <= 0} className="w-full">
          <ArrowUpCircle className="w-4 h-4 mr-1.5" />
          Invest {fund.currency} {grossAmount.toLocaleString()}
        </Button>
      </Card>

      {showPayment && companyId && (
        <PaymentModal
          open={showPayment}
          onClose={() => setShowPayment(false)}
          onSuccess={async () => {
            setShowPayment(false)
            await handleBuy()
          }}
          companyId={companyId}
          userId={userId || undefined}
          direction="collection"
          module="investment"
          moduleReferenceId={fund.id}
          moduleReferenceType="workspace_funds"
          amount={grossAmount}
          currency={fund.currency}
          title="Investment Contribution"
          description={`Buy units in ${fund.fund_name}`}
          metadata={{ fund_name: fund.fund_name, units_preview: preview?.units }}
        />
      )}
    </div>
  )
}
