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

    // Create default Admin role for the company
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

    if (roleErr) {
      return new NextResponse(`Role creation failed: ${roleErr.message}`, { status: 400 })
    }

    // Create employee record (admin) in company_employees
    const { error: employeeErr } = await supabaseAdmin
      .from('company_employees')
      .insert({
        user_id: authedUser.id,
        company_id: company.id,
        company_role_id: role.id,
        employee_id_number: `EMP-001`,
        department: 'Management',
        position: 'Administrator',
        status: 'active',
        joined_at: new Date().toISOString(),
      })

    if (employeeErr) {
      return new NextResponse(`Employee creation failed: ${employeeErr.message}`, { status: 400 })
    }

    // Set active company for the user
    await supabaseAdmin
      .from('user_active_company')
      .upsert({ user_id: authedUser.id, company_id: company.id }, { onConflict: 'user_id' })

    return NextResponse.json({ ok: true, companyId: company.id })
  } catch (err: any) {
    return new NextResponse(err?.message || 'Server error', { status: 500 })
  }
}
