'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSessionContext } from '@/lib/company-context'
import { apiFetch, apiJson } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  Calculator, Download, FileText, Info, Send, Plus, Trash2,
  CheckCircle2, AlertTriangle, XCircle, Landmark, Users, ShieldCheck,
  Receipt, Wallet, TrendingDown, Boxes,
} from 'lucide-react'

type ReturnType = 'income_tax' | 'paye'

interface Finding { severity: 'error' | 'warning' | 'pass'; code: string; message: string }
interface Validation { ok: boolean; errors: number; warnings: number; passed: number; findings: Finding[] }

const fmt = (n: number | undefined) => `UGX ${Math.round(Number(n || 0)).toLocaleString('en-US')}`

const ADJUSTMENT_KINDS: { value: string; label: string; hint: string }[] = [
  { value: 'addition', label: 'Add back', hint: 'Non-deductible expense added back to profit' },
  { value: 'deduction', label: 'Deduction', hint: 'Capital allowance, loss brought forward, etc.' },
  { value: 'income', label: 'Other income', hint: 'Income not captured by an invoice' },
  { value: 'expense', label: 'Other expense', hint: 'Expense not captured by an expense record' },
  { value: 'asset', label: 'Asset', hint: 'Statement of assets — cash, stock, equipment' },
  { value: 'liability', label: 'Liability', hint: 'Statement of liabilities — loans, payables' },
]

export default function UraFilingPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [returnType, setReturnType] = useState<ReturnType>('income_tax')
  const [periodStart, setPeriodStart] = useState(`${new Date().getFullYear()}-01-01`)
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10))

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<any>(null)
  const [validation, setValidation] = useState<Validation | null>(null)
  const [adjustments, setAdjustments] = useState<any[]>([])
  const [filings, setFilings] = useState<any[]>([])
  const [delivering, setDelivering] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const [newKind, setNewKind] = useState('addition')
  const [newLabel, setNewLabel] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newReference, setNewReference] = useState('')

  useEffect(() => {
    getSessionContext().then((ctx) => { if (ctx?.companyId) setCompanyId(ctx.companyId) })
  }, [])

  const loadAdjustments = useCallback(async () => {
    if (!companyId) return
    const res = await apiJson<{ ok: boolean; data?: any[] }>(`/api/ura/adjustments?companyId=${companyId}&returnType=${returnType}`)
    if (res.ok) setAdjustments(res.data || [])
  }, [companyId, returnType])

  const loadFilings = useCallback(async () => {
    if (!companyId) return
    const res = await apiJson<{ ok: boolean; data?: any[] }>(`/api/ura/filings?companyId=${companyId}&returnType=${returnType}`)
    if (res.ok) setFilings(res.data || [])
  }, [companyId, returnType])

  useEffect(() => { loadAdjustments() }, [loadAdjustments])
  useEffect(() => { loadFilings() }, [loadFilings])

  const compute = useCallback(async () => {
    if (!companyId) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const path = returnType === 'paye' ? '/api/ura/paye' : '/api/ura/income-tax'
      const res = await apiJson<any>(path, {
        method: 'POST',
        body: JSON.stringify({ companyId, periodStart, periodEnd }),
      })
      if (res.ok) {
        setPreview(res.data)
        setValidation(res.data.validation)
      } else {
        setError(res.error || 'Could not prepare the return')
      }
    } catch (e: any) {
      setError(e?.message || 'Could not prepare the return')
    } finally {
      setBusy(false)
    }
  }, [companyId, returnType, periodStart, periodEnd])

  const downloadFile = async () => {
    if (!companyId) return
    setBusy(true); setError(null)
    try {
      const res = await apiFetch('/api/ura/file', {
        method: 'POST',
        body: JSON.stringify({ companyId, returnType, periodStart, periodEnd }),
      })
      if (!res.ok) { setError('Could not generate the workbook'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ura-${returnType === 'paye' ? 'paye' : 'income-tax'}-${periodStart}-to-${periodEnd}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      setNotice('Workbook generated. Upload it at ura.go.ug under e-Returns.')
      loadFilings()
    } finally {
      setBusy(false)
    }
  }

  const sendToCompany = async () => {
    if (!companyId) return
    setDelivering(true); setError(null); setNotice(null)
    try {
      const res = await apiJson<any>('/api/ura/send', {
        method: 'POST',
        body: JSON.stringify({ companyId, returnType, periodStart, periodEnd }),
      })
      if (res.ok) {
        const ch = res.data?.delivered || {}
        const parts = [
          ch.email?.ok ? 'emailed' : null,
          ch.whatsapp?.ok ? 'sent on WhatsApp' : null,
        ].filter(Boolean)
        setNotice(parts.length ? `Return ${parts.join(' and ')} to the company.` : 'Delivery was attempted but both channels failed — check the company email and phone.')
        loadFilings()
      } else {
        setError(res.error || 'Could not send the return')
      }
    } finally {
      setDelivering(false)
    }
  }

  const addAdjustment = async () => {
    if (!companyId || !newLabel.trim() || !newAmount) return
    const res = await apiJson<any>('/api/ura/adjustments', {
      method: 'POST',
      body: JSON.stringify({
        companyId, returnType, periodStart, periodEnd,
        kind: newKind, label: newLabel.trim(), amount: Number(newAmount), reference: newReference.trim() || null,
      }),
    })
    if (res.ok) {
      setNewLabel(''); setNewAmount(''); setNewReference('')
      loadAdjustments()
    } else {
      setError(res.error || 'Could not add the row')
    }
  }

  const removeAdjustment = async (id: string) => {
    if (!companyId) return
    await apiFetch(`/api/ura/adjustments?companyId=${companyId}&id=${id}`, { method: 'DELETE' })
    loadAdjustments()
  }

  const summary = preview?.summary
  const computation = preview?.incomeTax?.computation
  const payeTotals = preview?.paye?.totals

  const groupedAdjustments = useMemo(() => {
    const groups: Record<string, any[]> = {}
    for (const a of adjustments) (groups[a.kind] ||= []).push(a)
    return groups
  }, [adjustments])

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">URA e-Filing</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Prepare, validate and deliver URA income tax and PAYE returns — filled into the official
            workbook layout, ready to upload at ura.go.ug.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={downloadFile} disabled={busy || !companyId} variant="outline" className="gap-2">
            <Download className="w-4 h-4" /> URA workbook
          </Button>
          <Button onClick={sendToCompany} disabled={delivering || !companyId} className="gap-2">
            {delivering ? <Spinner size="sm" /> : <Send className="w-4 h-4" />} Send to company
          </Button>
        </div>
      </div>

      {/* Return type + period */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {([['income_tax', 'Income Tax (DT20002)', <Landmark key="i" className="w-4 h-4" />], ['paye', 'PAYE (DT2008)', <Users key="p" className="w-4 h-4" />]] as const).map(([value, label, icon]) => (
            <button
              key={value}
              onClick={() => { setReturnType(value as ReturnType); setPreview(null); setValidation(null) }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                returnType === value ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {icon}{label}
            </button>
          ))}
        </div>
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
            {busy ? <Spinner size="sm" /> : <Calculator className="w-4 h-4" />}
            Prepare &amp; validate
          </Button>
        </div>
      </Card>

      {error && (
        <div className="rounded-xl bg-destructive/[0.06] border border-destructive/15 p-4 text-sm text-destructive">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl bg-emerald-500/[0.07] border border-emerald-500/20 p-4 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />{notice}
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {returnType === 'income_tax' ? (
            <>
              <Stat label="Gross income" value={fmt(summary.grossIncome)} />
              <Stat label="Allowable expenses" value={fmt(summary.allowableExpenses)} />
              <Stat label="Chargeable income" value={fmt(summary.chargeableIncome)} />
              <Stat label="Tax payable" value={fmt(summary.taxPayable)} accent />
            </>
          ) : (
            <>
              <Stat label="Employees" value={String(summary.employees ?? 0)} />
              <Stat label="Gross payroll" value={fmt(summary.grossSalary)} />
              <Stat label="NSSF (5%)" value={fmt(summary.nssf)} />
              <Stat label="PAYE payable" value={fmt(summary.taxPayable)} accent />
            </>
          )}
        </div>
      )}

      {/* Validation */}
      {validation && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            {validation.ok
              ? <ShieldCheck className="w-4 h-4 text-emerald-600" />
              : <AlertTriangle className="w-4 h-4 text-amber-500" />}
            <h2 className="text-sm font-semibold text-foreground">URA validation</h2>
            <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
              validation.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
            }`}>
              {validation.ok ? 'Ready to upload' : `${validation.errors} error(s), ${validation.warnings} warning(s)`}
            </span>
          </div>
          <div className="space-y-2">
            {validation.findings.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {f.severity === 'error' ? <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  : f.severity === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  : <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />}
                <span className={f.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'}>{f.message}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Add rows — available for both return types so the user can add anything */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Add to the return</h2>
          <span className="text-xs text-muted-foreground ml-2">Invoices, expenses, assets, liabilities, credit notes, add-backs…</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Kind</label>
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value)}
              className="w-full h-10 rounded-xl border border-border bg-muted/40 px-3 text-sm"
            >
              {ADJUSTMENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Motor vehicle" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Reference</label>
            <Input value={newReference} onChange={(e) => setNewReference(e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Amount (UGX)</label>
            <Input type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0" />
          </div>
          <Button onClick={addAdjustment} disabled={!newLabel.trim() || !newAmount} className="gap-2 h-10">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground/60 mt-3">
          {ADJUSTMENT_KINDS.find((k) => k.value === newKind)?.hint}
        </p>

        {adjustments.length > 0 && (
          <div className="mt-5 space-y-4">
            {Object.entries(groupedAdjustments).map(([kind, rows]) => (
              <div key={kind}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {ADJUSTMENT_KINDS.find((k) => k.value === kind)?.label || kind}
                </p>
                <div className="space-y-1.5">
                  {rows.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3 text-sm rounded-lg bg-muted/30 px-3 py-2">
                      <span className="flex-1 text-foreground">{a.label}{a.reference ? ` · ${a.reference}` : ''}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">{fmt(a.amount)}</span>
                      <button onClick={() => removeAdjustment(a.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Supporting lines */}
      {preview && returnType === 'income_tax' && preview.incomeTax && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <LineCard title="Income lines" icon={<Receipt className="w-4 h-4" />} lines={[...preview.incomeTax.invoices, ...preview.incomeTax.sales, ...preview.incomeTax.creditNotes]} />
          <LineCard title="Expense lines" icon={<TrendingDown className="w-4 h-4" />} lines={[...preview.incomeTax.expenses, ...preview.incomeTax.debitNotes]} />
        </div>
      )}

      {preview && returnType === 'paye' && preview.paye && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Employee schedule ({preview.paye.employees.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 font-medium">Employee</th>
                  <th className="py-2 font-medium text-right">Gross</th>
                  <th className="py-2 font-medium text-right">NSSF</th>
                  <th className="py-2 font-medium text-right">Chargeable</th>
                  <th className="py-2 font-medium text-right">PAYE</th>
                  <th className="py-2 font-medium text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {preview.paye.employees.map((e: any, i: number) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2">{e.name}</td>
                    <td className="py-2 text-right tabular-nums">{fmt(e.grossSalary)}</td>
                    <td className="py-2 text-right tabular-nums">{fmt(e.nssf)}</td>
                    <td className="py-2 text-right tabular-nums">{fmt(e.taxableIncome)}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{fmt(e.paye)}</td>
                    <td className="py-2 text-right tabular-nums">{fmt(e.netPay)}</td>
                  </tr>
                ))}
                {!preview.paye.employees.length && (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No employees on payroll for this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Income tax computation note */}
      {computation && (
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="w-4 h-4" />
            {computation.presumptive
              ? 'Chargeable income is within the presumptive band — the 1% small-business rate applies.'
              : 'Chargeable income exceeds the presumptive threshold — the standard 30% corporate rate applies.'}
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Output VAT</span><span className="font-semibold">{fmt(preview.incomeTax.vat.outputVat)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Input VAT</span><span className="font-semibold">{fmt(preview.incomeTax.vat.inputVat)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Net VAT</span><span className="font-semibold">{fmt(preview.incomeTax.vat.netVat)}</span></div>
          </div>
        </Card>
      )}

      {/* Filing history */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Filing history</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 font-medium">Period</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium text-right">Tax payable</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Generated</th>
              </tr>
            </thead>
            <tbody>
              {filings.map((f: any) => (
                <tr key={f.id} className="border-b border-border/50">
                  <td className="py-2">{f.period_start} → {f.period_end}</td>
                  <td className="py-2">{f.return_type === 'paye' ? 'PAYE' : 'Income tax'}</td>
                  <td className="py-2 text-right tabular-nums">{fmt(f.return_type === 'paye' ? f.total_paye : f.tax_payable)}</td>
                  <td className="py-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      f.status === 'delivered' ? 'bg-blue-50 text-blue-600'
                        : f.status === 'filed' ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-muted/50 text-muted-foreground'
                    }`}>{f.status}</span>
                  </td>
                  <td className="py-2 text-muted-foreground">{new Date(f.created_at).toLocaleString('en-GB')}</td>
                </tr>
              ))}
              {!filings.length && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No returns generated yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
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

function LineCard({ title, icon, lines }: { title: string; icon: React.ReactNode; lines: any[] }) {
  const total = lines.reduce((s, l) => s + Number(l.amount || 0), 0)
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground">{lines.length} · {fmt(total)}</span>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-1.5 text-muted-foreground">{l.date}</td>
                <td className="py-1.5">{l.description || l.reference}</td>
                <td className="py-1.5 text-right tabular-nums">{fmt(l.amount)}</td>
              </tr>
            ))}
            {!lines.length && (
              <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">No lines in this period.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
