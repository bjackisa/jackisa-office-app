import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request) {
  try {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null
    if (!token) {
      return new NextResponse('Missing bearer token', { status: 401 })
    }

    // Verify the user from the JWT
    const { data: userResult, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userResult?.user) {
      return new NextResponse('Invalid session', { status: 401 })
    }
    const authedUser = userResult.user

    const body = await request.json().catch(() => ({}))
    const {
      companyName,
      companyEmail,
      industry,
      fullName,
      email,
    } = body || {}

    if (!companyName || !companyEmail || !industry || !fullName || !email) {
      return new NextResponse('Missing registration payload', { status: 400 })
    }

    // Ensure user profile exists FIRST to satisfy FK on companies.created_by
    const { error: userProfileErr } = await supabaseAdmin
      .from('users')
      .upsert(
        {
          id: authedUser.id,
          email,
          full_name: fullName,
          role: 'company_admin',
        },
        { onConflict: 'id' }
      )

    if (userProfileErr) {
      return new NextResponse(`User profile creation failed: ${userProfileErr.message}`, { status: 400 })
    }

    // Create company AFTER user profile to pass FK
    const { data: company, error: companyErr } = await supabaseAdmin
      .from('companies')
      .insert({
        name: companyName,
        email: companyEmail,
        industry,
        created_by: authedUser.id,
      })
      .select()
      .single()

    if (companyErr) {
      return new NextResponse(`Company creation failed: ${companyErr.message}`, { status: 400 })
    }

    // Create employee record (admin)
    const { error: employeeErr } = await supabaseAdmin
      .from('employees')
      .insert({
        user_id: authedUser.id,
        company_id: company.id,
        employee_number: `EMP-${Date.now()}`,
        hire_date: new Date().toISOString().split('T')[0],
        status: 'active',
      })

    if (employeeErr) {
      return new NextResponse(`Employee creation failed: ${employeeErr.message}`, { status: 400 })
    }

    return NextResponse.json({ ok: true, companyId: company.id })
  } catch (err: any) {
    return new NextResponse(err?.message || 'Server error', { status: 500 })
  }
}
