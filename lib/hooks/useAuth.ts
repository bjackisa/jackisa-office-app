'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { User, Company, CompanyEmployee, CompanyRole } from '@/types'

export interface AuthState {
  user: User | null
  company: Company | null
  employee: CompanyEmployee | null
  role: CompanyRole | null
  companies: { id: string; name: string; logo_url: string | null }[]
  loading: boolean
}

export function useAuth() {
  const router = useRouter()
  const [state, setState] = useState<AuthState>({
    user: null,
    company: null,
    employee: null,
    role: null,
    companies: [],
    loading: true,
  })

  const loadAuth = useCallback(async () => {
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      if (authError || !authUser) {
        router.replace('/auth/login')
        setState(prev => ({ ...prev, loading: false }))
        return
      }

      let { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle()

      if (!userData) {
        const fallbackName = authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User'
        const { data: createdUser } = await supabase
          .from('users')
          .upsert(
            {
              id: authUser.id,
              email: authUser.email || '',
              full_name: fallbackName,
              role: 'company_admin',
            },
            { onConflict: 'id' }
          )
          .select('*')
          .single()

        userData = createdUser
      }

      // Get all companies user belongs to
      const { data: employeeRecords } = await supabase
        .from('company_employees')
        .select('company_id, companies(id, name, logo_url)')
        .eq('user_id', authUser.id)
        .eq('status', 'active')

      const companies = (employeeRecords || []).map((e: any) => ({
        id: e.companies?.id || e.company_id,
        name: e.companies?.name || 'Unknown',
        logo_url: e.companies?.logo_url || null,
      }))

      // Get active company (from user_active_company or first company)
      let activeCompanyId: string | null = null
      const { data: activeCompanyData } = await supabase
        .from('user_active_company')
        .select('company_id')
        .eq('user_id', authUser.id)
        .single()

      if (activeCompanyData) {
        activeCompanyId = activeCompanyData.company_id
      } else if (companies.length > 0) {
        activeCompanyId = companies[0].id
      }

      let company: Company | null = null
      let employee: CompanyEmployee | null = null
      let role: CompanyRole | null = null

      if (activeCompanyId) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('*')
          .eq('id', activeCompanyId)
          .single()

        company = companyData

        const { data: empData } = await supabase
          .from('company_employees')
          .select('*, company_roles(*)')
          .eq('user_id', authUser.id)
          .eq('company_id', activeCompanyId)
          .single()

        if (empData) {
          employee = empData
          role = empData.company_roles || null
        }
      }

      setState({
        user: userData,
        company,
        employee,
        role,
        companies,
        loading: false,
      })
    } catch (error) {
      console.error('Auth check failed:', error)
      setState(prev => ({ ...prev, loading: false }))
    }
  }, [router])

  useEffect(() => {
    loadAuth()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        loadAuth()
      }
      if (event === 'SIGNED_OUT') {
        setState(prev => ({
          ...prev,
          user: null,
          company: null,
          employee: null,
          role: null,
          companies: [],
          loading: false,
        }))
        router.replace('/auth/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [loadAuth, router])

  const switchCompany = async (companyId: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await supabase
      .from('user_active_company')
      .upsert(
        { user_id: session.user.id, company_id: companyId, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )

    await loadAuth()
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return { ...state, switchCompany, logout, reload: loadAuth }
}
