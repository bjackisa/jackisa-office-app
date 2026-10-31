/**
 * Industry profiles.
 *
 * The workspace tailors itself to what the customer actually does: the signup
 * form picks an industry from this list, and the dashboard, sidebar copy and
 * quick actions read the matching profile. Keeping the list in one place means
 * "add a new industry" is a data change, not a code change.
 */

import type { CompanyKind } from '@/lib/lic/features'

export interface IndustryProfile {
  slug: string
  label: string
  /** Suggested companies.kind when this industry is chosen. */
  kind: CompanyKind
  tagline: string
  /** Module slugs to spotlight first on the dashboard. */
  featured: string[]
  /** Short, industry-flavoured quick actions. */
  quickActions: { label: string; href: string }[]
  /** Vocabulary swaps, e.g. staff vs students. */
  glossary: { people: string; person: string; customer: string }
}

export const INDUSTRIES: IndustryProfile[] = [
  {
    slug: 'retail',
    label: 'Retail & Wholesale',
    kind: 'company',
    tagline: 'Sell faster, track stock, and see your daily margins.',
    featured: ['sales', 'invoicing', 'expenses', 'accounting'],
    quickActions: [
      { label: 'New sale', href: '/app/sales/orders' },
      { label: 'Record expense', href: '/app/accounting/expenses' },
      { label: 'Daily takings', href: '/app/accounting' },
    ],
    glossary: { people: 'Staff', person: 'Staff member', customer: 'Customer' },
  },
  {
    slug: 'services',
    label: 'Professional Services',
    kind: 'company',
    tagline: 'Win clients, invoice on time, and keep projects profitable.',
    featured: ['invoicing', 'accounting', 'cms', 'helpdesk'],
    quickActions: [
      { label: 'Raise invoice', href: '/app/accounting/invoices' },
      { label: 'New client', href: '/app/accounting/invoices' },
      { label: 'Open a ticket', href: '/app/helpdesk' },
    ],
    glossary: { people: 'Team', person: 'Consultant', customer: 'Client' },
  },
  {
    slug: 'manufacturing',
    label: 'Manufacturing & Production',
    kind: 'company',
    tagline: 'Cost your production, manage suppliers, and control overheads.',
    featured: ['accounting', 'expenses', 'bookkeeping', 'hr'],
    quickActions: [
      { label: 'Purchase order', href: '/app/sales/orders' },
      { label: 'Record expense', href: '/app/accounting/expenses' },
      { label: 'Payroll', href: '/app/hr/payroll' },
    ],
    glossary: { people: 'Workforce', person: 'Operator', customer: 'Buyer' },
  },
  {
    slug: 'education',
    label: 'School & Education',
    kind: 'institution',
    tagline: 'Run classes, record marks, and send results to parents.',
    featured: ['education', 'students', 'coursework', 'payments_hub'],
    quickActions: [
      { label: 'Add a student', href: '/app/education/students' },
      { label: 'Enter marks', href: '/app/education/coursework' },
      { label: 'Final grades', href: '/app/education/grades' },
    ],
    glossary: { people: 'Students', person: 'Student', customer: 'Parent' },
  },
  {
    slug: 'healthcare',
    label: 'Health & Clinic',
    kind: 'company',
    tagline: 'Bill patients, manage staff rotas, and keep clean records.',
    featured: ['payments_hub', 'invoicing', 'hr', 'expenses'],
    quickActions: [
      { label: 'Bill a patient', href: '/app/accounting/invoices' },
      { label: 'Duty roster', href: '/app/hr/attendance' },
      { label: 'Stock expense', href: '/app/accounting/expenses' },
    ],
    glossary: { people: 'Staff', person: 'Practitioner', customer: 'Patient' },
  },
  {
    slug: 'finance',
    label: 'Finance, SACCO & Investment',
    kind: 'cooperative',
    tagline: 'Grow member funds with unit trusts, dividends, and NAV.',
    featured: ['investment', 'unit_trust', 'dividends', 'accounting'],
    quickActions: [
      { label: 'Buy units', href: '/app/investment/buy' },
      { label: 'Declare dividend', href: '/app/dividends' },
      { label: 'Fund NAV', href: '/app/investment' },
    ],
    glossary: { people: 'Members', person: 'Member', customer: 'Client' },
  },
  {
    slug: 'hospitality',
    label: 'Hospitality & Food',
    kind: 'company',
    tagline: 'Serve more guests, control costs, and pay your crew on time.',
    featured: ['sales', 'expenses', 'hr', 'accounting'],
    quickActions: [
      { label: 'Daily sales', href: '/app/sales/orders' },
      { label: 'Kitchen expense', href: '/app/accounting/expenses' },
      { label: 'Payroll', href: '/app/hr/payroll' },
    ],
    glossary: { people: 'Crew', person: 'Team member', customer: 'Guest' },
  },
  {
    slug: 'technology',
    label: 'Technology & Software',
    kind: 'company',
    tagline: 'Invoice subscriptions, track growth, and manage your build team.',
    featured: ['invoicing', 'accounting', 'hr', 'api_access'],
    quickActions: [
      { label: 'New subscription invoice', href: '/app/accounting/invoices' },
      { label: 'Hire someone', href: '/app/hr/employees' },
      { label: 'API access', href: '/app/settings' },
    ],
    glossary: { people: 'Team', person: 'Engineer', customer: 'Account' },
  },
  {
    slug: 'agriculture',
    label: 'Agriculture & Farming',
    kind: 'cooperative',
    tagline: 'Track seasons, sales, and shared equipment across the co-op.',
    featured: ['sales', 'expenses', 'investment', 'accounting'],
    quickActions: [
      { label: 'Record a sale', href: '/app/sales/orders' },
      { label: 'Input costs', href: '/app/accounting/expenses' },
      { label: 'Member funds', href: '/app/investment' },
    ],
    glossary: { people: 'Members', person: 'Farmer', customer: 'Buyer' },
  },
  {
    slug: 'ngo',
    label: 'NGO & Non-profit',
    kind: 'ngo',
    tagline: 'Account for grants, report to donors, and track every shilling.',
    featured: ['accounting', 'expenses', 'bookkeeping', 'cms'],
    quickActions: [
      { label: 'Log a grant', href: '/app/accounting' },
      { label: 'Programme expense', href: '/app/accounting/expenses' },
      { label: 'Donor report', href: '/app/accounting/bookkeeping' },
    ],
    glossary: { people: 'Beneficiaries', person: 'Beneficiary', customer: 'Donor' },
  },
  {
    slug: 'logistics',
    label: 'Transport & Logistics',
    kind: 'company',
    tagline: 'Track trips, fuel, and deliveries — and get paid for each run.',
    featured: ['sales', 'expenses', 'invoicing', 'hr'],
    quickActions: [
      { label: 'New delivery', href: '/app/sales/orders' },
      { label: 'Fuel & repairs', href: '/app/accounting/expenses' },
      { label: 'Driver payroll', href: '/app/hr/payroll' },
    ],
    glossary: { people: 'Drivers', person: 'Driver', customer: 'Client' },
  },
  {
    slug: 'other',
    label: 'Other',
    kind: 'company',
    tagline: 'A flexible workspace that grows with you.',
    featured: ['accounting', 'invoicing', 'hr', 'payments_hub'],
    quickActions: [
      { label: 'Raise invoice', href: '/app/accounting/invoices' },
      { label: 'Add staff', href: '/app/hr/employees' },
      { label: 'View accounts', href: '/app/accounting' },
    ],
    glossary: { people: 'Staff', person: 'Staff member', customer: 'Customer' },
  },
]

const BY_SLUG = new Map(INDUSTRIES.map((i) => [i.slug, i]))

/** Resolve a profile from a free-text or slug industry value. */
export function profileFor(industry?: string | null): IndustryProfile {
  if (!industry) return BY_SLUG.get('other')!
  const key = industry.trim().toLowerCase()
  const bySlug = BY_SLUG.get(key)
  if (bySlug) return bySlug
  // Tolerate legacy free-text values ("Technology, Finance, Education").
  const byLabel = INDUSTRIES.find((i) => i.label.toLowerCase() === key)
  if (byLabel) return byLabel
  const partial = INDUSTRIES.find((i) => key.includes(i.slug) || i.label.toLowerCase().split(/[^a-z]+/).some((w) => w.length > 3 && key.includes(w)))
  return partial || BY_SLUG.get('other')!
}

export function industryOptions(): { value: string; label: string }[] {
  return INDUSTRIES.map((i) => ({ value: i.slug, label: i.label }))
}
