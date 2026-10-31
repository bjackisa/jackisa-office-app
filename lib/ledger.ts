/**
 * Double-entry ledger helper.
 *
 * The ledger is the single source of truth for money. Every posting is balanced
 * (debits = credits) and is written atomically through the `jo_post_ledger_entry`
 * Postgres function, so a partially written entry can never exist.
 *
 * Posting is best-effort from the calling module: a failure is logged and never
 * blocks the underlying business action (the ledger can be backfilled).
 */

import { supabase } from '@/lib/supabase'

export interface LedgerLine {
  account_code: string
  debit?: number
  credit?: number
  memo?: string
}

/** The default chart of accounts seeded for every company. */
export const CHART_OF_ACCOUNTS: { code: string; name: string; type: string; normal_side: 'debit' | 'credit' }[] = [
  { code: '1000', name: 'Cash & Bank', type: 'asset', normal_side: 'debit' },
  { code: '1100', name: 'Mobile Money Float', type: 'asset', normal_side: 'debit' },
  { code: '1200', name: 'Accounts Receivable', type: 'asset', normal_side: 'debit' },
  { code: '1500', name: 'Fund Investments', type: 'asset', normal_side: 'debit' },
  { code: '2000', name: 'Accounts Payable', type: 'liability', normal_side: 'credit' },
  { code: '2100', name: 'VAT Payable', type: 'liability', normal_side: 'credit' },
  { code: '2200', name: 'PAYE Payable', type: 'liability', normal_side: 'credit' },
  { code: '2300', name: 'NSSF Payable', type: 'liability', normal_side: 'credit' },
  { code: '2310', name: 'Employer NSSF Payable', type: 'liability', normal_side: 'credit' },
  { code: '2400', name: 'Net Salaries Payable', type: 'liability', normal_side: 'credit' },
  { code: '2500', name: 'Dividends Payable', type: 'liability', normal_side: 'credit' },
  { code: '3000', name: "Owner's Equity", type: 'equity', normal_side: 'credit' },
  { code: '3100', name: 'Retained Earnings', type: 'equity', normal_side: 'credit' },
  { code: '4000', name: 'Sales Revenue', type: 'income', normal_side: 'credit' },
  { code: '4900', name: 'Other Income', type: 'income', normal_side: 'credit' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense', normal_side: 'debit' },
  { code: '6000', name: 'Salaries & Wages', type: 'expense', normal_side: 'debit' },
  { code: '6100', name: 'Rent', type: 'expense', normal_side: 'debit' },
  { code: '6200', name: 'Utilities', type: 'expense', normal_side: 'debit' },
  { code: '6300', name: 'Marketing', type: 'expense', normal_side: 'debit' },
  { code: '6400', name: 'Employer NSSF', type: 'expense', normal_side: 'debit' },
  { code: '6900', name: 'General Expenses', type: 'expense', normal_side: 'debit' },
]

/**
 * Ensure the company has the default chart of accounts. Idempotent.
 * Returns a map of account_code -> account_id.
 */
export async function ensureChartOfAccounts(companyId: string): Promise<Record<string, string>> {
  const { data: existing } = await supabase
    .from('ledger_accounts')
    .select('id, code')
    .eq('company_id', companyId)

  const map: Record<string, string> = {}
  for (const a of existing || []) map[a.code] = a.id

  const missing = CHART_OF_ACCOUNTS.filter((a) => !map[a.code])
  if (missing.length) {
    const { data: inserted } = await supabase
      .from('ledger_accounts')
      .insert(
        missing.map((a) => ({
          company_id: companyId,
          code: a.code,
          name: a.name,
          type: a.type,
          normal_side: a.normal_side,
          is_system: true,
        }))
      )
      .select('id, code')
    for (const a of inserted || []) map[a.code] = a.id
  }
  return map
}

/**
 * Post a balanced entry. `lines` reference accounts by code; the chart of
 * accounts is created on demand. Returns the entry id, or null on failure.
 */
export async function postEntry(params: {
  companyId: string
  entryDate?: string
  memo: string
  reference?: string
  sourceModule: string
  sourceId?: string | null
  lines: LedgerLine[]
  createdBy?: string | null
}): Promise<string | null> {
  try {
    const accounts = await ensureChartOfAccounts(params.companyId)
    const lines = params.lines
      .filter((l) => (l.debit || 0) !== 0 || (l.credit || 0) !== 0)
      .map((l) => ({
        account_id: accounts[l.account_code],
        debit: round(l.debit || 0),
        credit: round(l.credit || 0),
        memo: l.memo,
      }))
      .filter((l) => l.account_id)

    if (lines.length < 2) return null

    const debit = lines.reduce((s, l) => s + l.debit, 0)
    const credit = lines.reduce((s, l) => s + l.credit, 0)
    if (round(debit) !== round(credit)) {
      console.error('[ledger] refusing unbalanced entry', { debit, credit })
      return null
    }

    const { data, error } = await supabase.rpc('jo_post_ledger_entry', {
      p_company_id: params.companyId,
      p_entry_date: params.entryDate || new Date().toISOString().slice(0, 10),
      p_memo: params.memo,
      p_reference: params.reference || null,
      p_source_module: params.sourceModule,
      p_source_id: params.sourceId || null,
      p_lines: lines,
      p_created_by: params.createdBy || null,
    })
    if (error) {
      console.error('[ledger] post failed', error.message)
      return null
    }
    return data as string
  } catch (e) {
    console.error('[ledger] post error', e)
    return null
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
