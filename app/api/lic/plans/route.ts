import { NextResponse } from 'next/server'
import { lic } from '@/lib/lic/client'

export const dynamic = 'force-dynamic'

// Fallback catalogue so the pricing UI always renders even if lic is briefly
// unreachable. Kept in sync with lic migrations/002_seed.sql.
const FALLBACK_PLANS = [
  { code: 'basic_1m', name: 'Basic Monthly', tier: 'basic', interval_months: 1, price: 25000, currency: 'UGX', max_employees: 10, max_students: 0, storage_gb: 5 },
  { code: 'basic_12m', name: 'Basic Annual', tier: 'basic', interval_months: 12, price: 264000, currency: 'UGX', max_employees: 10, max_students: 0, storage_gb: 5 },
  { code: 'pro_1m', name: 'Pro Monthly', tier: 'pro', interval_months: 1, price: 75000, currency: 'UGX', max_employees: 100, max_students: 500, storage_gb: 50 },
  { code: 'pro_12m', name: 'Pro Annual', tier: 'pro', interval_months: 12, price: 792000, currency: 'UGX', max_employees: 100, max_students: 500, storage_gb: 50 },
  { code: 'platinum_1m', name: 'Platinum Monthly', tier: 'platinum', interval_months: 1, price: 150000, currency: 'UGX', max_employees: 0, max_students: 0, storage_gb: 500 },
  { code: 'platinum_12m', name: 'Platinum Annual', tier: 'platinum', interval_months: 12, price: 1584000, currency: 'UGX', max_employees: 0, max_students: 0, storage_gb: 500 },
]

export async function GET() {
  const res = await lic.plans()
  if (res.api_status === '200' && res.data?.plans?.length) {
    return NextResponse.json({ ok: true, plans: res.data.plans, intervals: res.data.intervals || [1, 3, 6, 12, 24, 36], source: 'lic' })
  }
  return NextResponse.json({ ok: true, plans: FALLBACK_PLANS, intervals: [1, 3, 6, 12, 24, 36], source: 'fallback' })
}
