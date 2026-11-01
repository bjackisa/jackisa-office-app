/**
 * Feature gating by subscription tier AND by the user's role in a company.
 *
 * A feature is available when all three hold:
 *   1. the licence tier unlocks it (min_tier <= licence tier), and
 *   2. the company has not explicitly overridden it off, and
 *   3. the role grants it (role is a "top tier" role, or an explicit grant).
 */

export type Tier = 'basic' | 'pro' | 'platinum' | 'enterprise'

/** Company kinds, mirroring companies.kind. */
export type CompanyKind = 'company' | 'institution' | 'ngo' | 'individual' | 'cooperative'

export const TIER_RANK: Record<Tier, number> = {
  basic: 1,
  pro: 2,
  platinum: 3,
  enterprise: 4,
}

/** Features that only make sense for certain kinds of organisation. */
export const FEATURE_KINDS: Record<string, CompanyKind[]> = {
  education: ['institution', 'ngo'],
  students: ['institution', 'ngo'],
  coursework: ['institution', 'ngo'],
  investment: ['company', 'cooperative', 'individual'],
  unit_trust: ['company', 'cooperative', 'individual'],
  dividends: ['company', 'cooperative'],
  commissions: ['company', 'cooperative'],
  affiliate: ['company'],
  cms: ['company', 'ngo'],
}

/** Feature catalogue: slug -> minimum tier. Mirrors the SQL seed + lic. */
export const FEATURES: Record<string, { name: string; category: string; minTier: Tier; route?: string }> = {
  dashboard:    { name: 'Dashboard',            category: 'core',       minTier: 'basic',    route: '/app' },
  payments_hub: { name: 'Payments Hub',         category: 'core',       minTier: 'basic',    route: '/app/payments' },
  accounting:   { name: 'Accounting & Finance', category: 'finance',    minTier: 'basic',    route: '/app/accounting' },
  invoicing:    { name: 'Invoicing',            category: 'finance',    minTier: 'basic',    route: '/app/accounting/invoices' },
  expenses:     { name: 'Expenses',             category: 'finance',    minTier: 'basic',    route: '/app/accounting/expenses' },
  vat:          { name: 'VAT Management',       category: 'finance',    minTier: 'basic',    route: '/app/accounting/vat' },
  ura_efiling:  { name: 'URA e-Filing',         category: 'finance',    minTier: 'basic',    route: '/app/accounting/ura' },
  bookkeeping:  { name: 'Bookkeeping',          category: 'finance',    minTier: 'basic',    route: '/app/accounting/bookkeeping' },
  hr:           { name: 'HR & Payroll',         category: 'hr',         minTier: 'basic',    route: '/app/hr' },
  payroll:      { name: 'Payroll',              category: 'hr',         minTier: 'basic',    route: '/app/hr/payroll' },
  paye:         { name: 'PAYE & Tax',           category: 'hr',         minTier: 'basic',    route: '/app/hr/paye' },
  attendance:   { name: 'Attendance',           category: 'hr',         minTier: 'basic',    route: '/app/hr/attendance' },
  leave:        { name: 'Leave Management',     category: 'hr',         minTier: 'basic',    route: '/app/hr/leave' },
  performance:  { name: 'Performance',          category: 'hr',         minTier: 'pro',      route: '/app/hr/performance' },
  hr_points:    { name: 'HR Points',            category: 'hr',         minTier: 'pro',      route: '/app/hr/points' },
  education:    { name: 'Education Management', category: 'education',  minTier: 'pro',      route: '/app/education' },
  students:     { name: 'Students',             category: 'education',  minTier: 'pro',      route: '/app/education/students' },
  coursework:   { name: 'Coursework',           category: 'education',  minTier: 'pro',      route: '/app/education/coursework' },
  sales:        { name: 'Sales & Marketing',    category: 'sales',      minTier: 'basic',    route: '/app/sales' },
  commissions:  { name: 'Commissions',          category: 'sales',      minTier: 'pro',      route: '/app/sales/commissions' },
  affiliate:    { name: 'Affiliate Program',    category: 'sales',      minTier: 'pro',      route: '/app/affiliate' },
  investment:   { name: 'Investment & Funds',   category: 'investment', minTier: 'pro',      route: '/app/investment' },
  unit_trust:   { name: 'Unit Trust',           category: 'investment', minTier: 'platinum', route: '/app/investment/my-portfolio' },
  dividends:    { name: 'Dividends',            category: 'investment', minTier: 'platinum', route: '/app/dividends' },
  income_tax:   { name: 'Income Tax Evaluator', category: 'finance',    minTier: 'platinum' },
  legal:        { name: 'Legal Documents',      category: 'legal',      minTier: 'pro',      route: '/app/legal' },
  cms:          { name: 'CMS',                  category: 'content',    minTier: 'pro',      route: '/app/cms' },
  helpdesk:     { name: 'Help Desk',            category: 'support',    minTier: 'basic',    route: '/app/helpdesk' },
  kyc:          { name: 'KYC Verification',     category: 'compliance', minTier: 'platinum', route: '/app/settings/license' },
  api_access:   { name: 'API Access',           category: 'platform',   minTier: 'platinum' },
  whapi_alerts: { name: 'WhatsApp Alerts',      category: 'platform',   minTier: 'pro' },
  pdf_reports:  { name: 'PDF Reports',          category: 'platform',   minTier: 'pro' },
}

export function tierRank(tier?: string | null): number {
  return TIER_RANK[(tier as Tier) ?? 'basic'] ?? 1
}

export function isTierAtLeast(tier: string | null | undefined, min: Tier): boolean {
  return tierRank(tier) >= TIER_RANK[min]
}

export interface GateContext {
  tier: string | null | undefined
  /** The kind of organisation (companies.kind). */
  companyKind?: string | null
  /**
   * The kind implied by the company's industry (e.g. "Education" -> institution).
   * Workspaces created before company kinds existed carry the generic `company`
   * default, so the kind bound to a feature must match either the stored kind or
   * the industry-implied kind — otherwise a school on the education industry
   * would never unlock the education modules.
   */
  industryKind?: string | null
  /** Overrides set for the company (feature_slug -> enabled). */
  overrides?: Record<string, boolean>
  /** Role grants (feature_slug -> enabled) for the user's role. */
  roleGrants?: Record<string, boolean>
  /** True when the role is an admin/owner role and gets everything in-tier. */
  isAdminRole?: boolean
}

export function hasFeature(slug: string, ctx: GateContext): boolean {
  const feature = featureDef(slug)
  if (!feature) return true // unknown feature: do not block
  if (!isTierAtLeast(ctx.tier, feature.minTier)) return false
  // A feature bound to certain organisation kinds is unavailable elsewhere,
  // unless the company has been explicitly granted it. The stored kind and the
  // industry-implied kind are both honoured so legacy workspaces keep working.
  const kinds = FEATURE_KINDS[slug]
  if (kinds) {
    const candidates = [ctx.companyKind, ctx.industryKind].filter(Boolean) as string[]
    if (candidates.length > 0 && !candidates.some((k) => kinds.includes(k as CompanyKind))) {
      if (!(ctx.overrides && ctx.overrides[slug])) return false
    }
  }
  if (ctx.overrides && slug in ctx.overrides) return ctx.overrides[slug]
  if (ctx.isAdminRole) return true
  if (ctx.roleGrants && slug in ctx.roleGrants) return ctx.roleGrants[slug]
  // Non-admin roles get the core/basic surface unless explicitly granted.
  return feature.minTier === 'basic'
}

/** The lowest tier that unlocks a feature, for upgrade prompts. */
export function requiredTier(slug: string): Tier {
  return featureDef(slug)?.minTier ?? 'basic'
}

/**
 * Runtime feature catalogue, fed from the synced `platform_features` table so a
 * plan or feature added through the package manager (lic /api/v1/admin/*) gates
 * correctly without a redeploy. The static FEATURES map above is the seed and
 * the offline fallback.
 */
const RUNTIME_FEATURES: Record<string, { name: string; category: string; minTier: Tier }> = {}

export function registerFeatureCatalogue(rows: Array<{ slug?: string; name?: string; category?: string; min_tier?: string }>): void {
  for (const row of rows || []) {
    if (!row?.slug) continue
    RUNTIME_FEATURES[row.slug] = {
      name: row.name || row.slug,
      category: row.category || 'custom',
      minTier: (row.min_tier as Tier) || 'basic',
    }
  }
}

/** Resolve a feature's definition: a synced catalogue row first, then the seed. */
export function featureDef(slug: string): { name: string; category: string; minTier: Tier; route?: string } | undefined {
  const runtime = RUNTIME_FEATURES[slug]
  if (runtime) return { ...runtime, route: FEATURES[slug]?.route }
  return FEATURES[slug]
}

/** Every known feature slug (seed + synced catalogue), for the roles screen. */
export function allFeatureSlugs(): string[] {
  return Array.from(new Set([...Object.keys(FEATURES), ...Object.keys(RUNTIME_FEATURES)]))
}
