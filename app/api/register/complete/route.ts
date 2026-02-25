import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const addDays = (date: Date, days: number) => {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export async function POST(request: Request) {
  try {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null
    if (!token) return new NextResponse('Missing bearer token', { status: 401 })

    const { data: userResult, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userResult?.user) return new NextResponse('Invalid session', { status: 401 })
    const authedUser = userResult.user

    const body = await request.json().catch(() => ({}))
    const rawPackageTier = typeof body?.packageTier === 'string' ? body.packageTier : 'basic'
    const packageTier = ['basic', 'pro', 'platinum'].includes(rawPackageTier) ? rawPackageTier : 'basic'
    const couponCode = body?.couponCode

    const email = (typeof body?.email === 'string' && body.email.trim())
      ? body.email.trim().toLowerCase()
      : (authedUser.email || '').toLowerCase()
    const fullName = (typeof body?.fullName === 'string' && body.fullName.trim())
      ? body.fullName.trim()
      : (authedUser.user_metadata?.full_name || email.split('@')[0] || 'User')
    const companyEmail = (typeof body?.companyEmail === 'string' && body.companyEmail.trim())
      ? body.companyEmail.trim().toLowerCase()
      : email
    const companyName = (typeof body?.companyName === 'string' && body.companyName.trim())
      ? body.companyName.trim()
      : `${fullName}'s Company`
    const industry = (typeof body?.industry === 'string' && body.industry.trim())
      ? body.industry.trim()
      : 'General'

    if (!email) return new NextResponse('Missing user email', { status: 400 })

    const normalizedCoupon = typeof couponCode === 'string' ? couponCode.trim().toUpperCase() : null

    const { error: userProfileErr } = await supabaseAdmin
      .from('users')
      .upsert({ id: authedUser.id, email, full_name: fullName, role: 'company_admin' }, { onConflict: 'id' })

    if (userProfileErr) return new NextResponse(`User profile creation failed: ${userProfileErr.message}`, { status: 400 })

    const { data: existingEmployee } = await supabaseAdmin
      .from('company_employees')
      .select('company_id')
      .eq('user_id', authedUser.id)
      .limit(1)
      .maybeSingle()

    if (existingEmployee?.company_id) {
      await supabaseAdmin
        .from('user_active_company')
        .upsert({ user_id: authedUser.id, company_id: existingEmployee.company_id }, { onConflict: 'user_id' })
      return NextResponse.json({ ok: true, companyId: existingEmployee.company_id, alreadyCompleted: true })
    }

    const { data: tierData, error: tierErr } = await supabaseAdmin
      .from('subscription_tiers')
      .select('tier, monthly_price, yearly_price')
      .eq('tier', packageTier)
      .single()

    if (tierErr || !tierData) return new NextResponse('Invalid subscription package selected', { status: 400 })

    const { data: company, error: companyErr } = await supabaseAdmin
      .from('companies')
      .insert({ name: companyName, email: companyEmail, industry, created_by: authedUser.id })
      .select()
      .single()

    if (companyErr) return new NextResponse(`Company creation failed: ${companyErr.message}`, { status: 400 })

    const { data: role, error: roleErr } = await supabaseAdmin
      .from('company_roles')
      .insert({
        company_id: company.id,
        name: 'Admin',
        description: 'Company administrator with full access',
        is_default: true,
      })
      .select()
      .single()

    if (roleErr) return new NextResponse(`Role creation failed: ${roleErr.message}`, { status: 400 })

    const { error: employeeErr } = await supabaseAdmin
      .from('company_employees')
      .insert({
        user_id: authedUser.id,
        company_id: company.id,
        company_role_id: role.id,
        employee_id_number: 'EMP-001',
        department: 'Management',
        position: 'Administrator',
        status: 'active',
        joined_at: new Date().toISOString(),
      })

    if (employeeErr) return new NextResponse(`Employee creation failed: ${employeeErr.message}`, { status: 400 })

    let monthlyCost = Number(tierData.monthly_price)
    let yearlyCost = Number(tierData.yearly_price)
    let freeDays = 0
    let couponId: string | null = null
    let couponCurrentUses = 0

    if (normalizedCoupon) {
      const { data: coupon, error: couponErr } = await supabaseAdmin
        .from('coupons')
        .select('id, discount_percent, discount_amount, free_days, max_uses, current_uses, expiry_date')
        .eq('code', normalizedCoupon)
        .single()

      if (couponErr || !coupon) return new NextResponse('Invalid coupon code', { status: 400 })
      if (new Date(coupon.expiry_date) < new Date()) return new NextResponse('Coupon has expired', { status: 400 })
      if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) return new NextResponse('Coupon usage limit reached', { status: 400 })

      if (coupon.discount_percent) {
        const rate = Math.min(Math.max(Number(coupon.discount_percent), 0), 100) / 100
        monthlyCost *= 1 - rate
        yearlyCost *= 1 - rate
      }

      if (coupon.discount_amount) {
        const amount = Math.max(Number(coupon.discount_amount), 0)
        monthlyCost = Math.max(0, monthlyCost - amount)
        yearlyCost = Math.max(0, yearlyCost - amount)
      }

      freeDays = coupon.free_days ? Math.max(Number(coupon.free_days), 0) : 0
      couponId = coupon.id
      couponCurrentUses = coupon.current_uses || 0
    }

    const startDate = new Date()
    const endDate = addDays(startDate, 30 + freeDays)

    const { error: subscriptionErr } = await supabaseAdmin.from('company_subscriptions').insert({
      company_id: company.id,
      tier: tierData.tier,
      status: 'active',
      monthly_cost: Number(monthlyCost.toFixed(2)),
      yearly_cost: Number(yearlyCost.toFixed(2)),
      billing_cycle: 'monthly',
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    })

    if (subscriptionErr) return new NextResponse(`Subscription setup failed: ${subscriptionErr.message}`, { status: 400 })

    if (couponId) {
      await supabaseAdmin.from('coupon_usage').insert({ coupon_id: couponId, company_id: company.id })
      await supabaseAdmin.from('coupons').update({ current_uses: couponCurrentUses + 1 }).eq('id', couponId)
    }

    await supabaseAdmin
      .from('user_active_company')
      .upsert({ user_id: authedUser.id, company_id: company.id }, { onConflict: 'user_id' })

    return NextResponse.json({ ok: true, companyId: company.id })
  } catch (err: any) {
    return new NextResponse(err?.message || 'Server error', { status: 500 })
  }
}
