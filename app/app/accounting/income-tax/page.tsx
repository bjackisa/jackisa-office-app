'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Calculator, Download, FileText, Info } from 'lucide-react'

type TaxResult = {
  period_start: string
  period_end: string
  gross_income: number
  allowable_expenses: number
  chargeable_income: number
  tax_payable: number
  vat_input: number
  vat_output: number
  net_vat_payable: number
  currency: string
  line_items?: { invoices: any[]; expenses: any[] }
}

const fmt = (n: number | undefined) =>
  new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(Number(n || 0))

export default function IncomeTaxPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [periodStart, setPeriodStart] = useState(`${new Date().getFullYear()}-01-01`)
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10))
  const [result, setResult] = useState<TaxResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('company_employees')
        .select('company_id')
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (data?.company_id) setCompanyId(data.company_id)
    }
    load()
  }, [])

  const compute = async () => {
    if (!companyId) return
    setBusy(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/reports/income-tax', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ companyId, periodStart, periodEnd }),
      })
      const json = await res.json()
      if (json.ok) setResult(json.data)
      else setError(json.error || 'Could not compute income tax')
    } catch (e: any) {
      setError(e?.message || 'Could not compute income tax')
    } finally {
      setBusy(false)
    }
  }

  const downloadCsv = async () => {
    if (!companyId) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/reports/income-tax/csv', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ companyId, periodStart, periodEnd }),
    })
    if (!res.ok) {
      setError('Could not generate the CSV')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `income-tax-${periodStart}-to-${periodEnd}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const presumptive = (result?.chargeable_income ?? 0) <= 150_000_000

  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Income Tax Evaluator</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time Uganda corporate income tax, with a URA-ready CSV for filing.
          </p>
        </div>
        <Button onClick={downloadCsv} disabled={!companyId} variant="outline" className="gap-2">
          <Download className="w-4 h-4" /> URA CSV
        </Button>
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Period start</label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Period end</label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <Button onClick={compute} disabled={busy || !companyId} className="gap-2 h-10">
            {busy ? <Spinner className="w-4 h-4" /> : <Calculator className="w-4 h-4" />}
            Compute
          </Button>
        </div>
      </Card>

      {error && (
        <div className="rounded-xl bg-destructive/[0.06] border border-destructive/15 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Gross income" value={fmt(result.gross_income)} />
            <Stat label="Allowable expenses" value={fmt(result.allowable_expenses)} />
            <Stat label="Chargeable income" value={fmt(result.chargeable_income)} />
            <Stat label="Tax payable" value={fmt(result.tax_payable)} accent />
          </div>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="w-4 h-4" />
              {presumptive
                ? 'Chargeable income is within the presumptive band — the 1% small-business rate applies.'
                : 'Chargeable income exceeds the presumptive threshold — the standard 30% corporate rate applies.'}
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Output VAT</span><span className="font-semibold">{fmt(result.vat_output)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Input VAT</span><span className="font-semibold">{fmt(result.vat_input)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Net VAT payable</span><span className="font-semibold">{fmt(result.net_vat_payable)}</span></div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Supporting lines</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 font-medium">Type</th>
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Reference</th>
                    <th className="py-2 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.line_items?.invoices || []).map((i: any, idx: number) => (
                    <tr key={`inv-${idx}`} className="border-b border-border/50">
                      <td className="py-2">Income</td>
                      <td className="py-2">{i.invoice_date}</td>
                      <td className="py-2">{i.invoice_number || i.customer_name}</td>
                      <td className="py-2 text-right">{fmt(i.total_amount)}</td>
                    </tr>
                  ))}
                  {(result.line_items?.expenses || []).map((e: any, idx: number) => (
                    <tr key={`exp-${idx}`} className="border-b border-border/50">
                      <td className="py-2">Expense</td>
                      <td className="py-2">{e.expense_date}</td>
                      <td className="py-2">{e.description || e.category}</td>
                      <td className="py-2 text-right">{fmt(e.amount)}</td>
                    </tr>
                  ))}
                  {!(result.line_items?.invoices?.length || result.line_items?.expenses?.length) && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-muted-foreground">No transactions in this period.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className={`p-5 ${accent ? 'ring-1 ring-primary/20' : ''}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-xl font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </Card>
  )
}
