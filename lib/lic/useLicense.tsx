'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { hasFeature as gateFeature, type GateContext, type Tier } from '@/lib/lic/features'

export interface LicenseState {
  loading: boolean
  tier: Tier
  status: string
  planCode: string | null
  licenseKey: string | null
  expiresAt: string | null
  daysRemaining: number | null
  valid: boolean
  withinCaps: boolean
  capDetails: Record<string, any>
  overrides: Record<string, boolean>
  roleGrants: Record<string, boolean>
  isAdminRole: boolean
  trial: { active: boolean; endsAt: string | null; daysLeft: number | null } | null
  badge: { type: string; color: string; label: string } | null
  companyId: string | null
  refresh: () => Promise<void>
  can: (slug: string) => boolean
}

const defaultState: LicenseState = {
  loading: true,
  tier: 'basic',
  status: 'unknown',
  planCode: null,
  licenseKey: null,
  expiresAt: null,
  daysRemaining: null,
  valid: false,
  withinCaps: true,
  capDetails: {},
  overrides: {},
  roleGrants: {},
  isAdminRole: false,
  trial: null,
  badge: null,
  companyId: null,
  refresh: async () => {},
  can: () => true,
}

const LicenseContext = createContext<LicenseState>(defaultState)

export function useLicense() {
  return useContext(LicenseContext)
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))
}

export function LicenseProvider({
  companyId,
  companyKind,
  employee,
  role,
  userId,
  children,
}: {
  companyId: string | null
  companyKind?: string | null
  employee: any
  role: any
  userId: string | null
  children: React.ReactNode
}) {
  const [state, setState] = useState<LicenseState>(defaultState)
  const validated = useRef<string | null>(null)

  const load = useCallback(async () => {
    if (!companyId) {
      setState((s) => ({ ...s, loading: false, companyId: null }))
      return
    }

    try {
      const [{ data: lic }, { data: trial }] = await Promise.all([
        supabase.from('platform_licenses').select('*').eq('company_id', companyId).eq('is_current', true).maybeSingle(),
        supabase.from('trial_registrations').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])

      let overrides: Record<string, boolean> = {}
      let roleGrants: Record<string, boolean> = {}

      if (role?.id) {
        const { data: grants } = await supabase.from('company_role_features').select('feature_slug, enabled').eq('company_role_id', role.id)
        roleGrants = Object.fromEntries((grants || []).map((g: any) => [g.feature_slug, g.enabled]))
      }
      const { data: companyOverrides } = await supabase.from('company_feature_overrides').select('feature_slug, enabled').eq('company_id', companyId)
      overrides = Object.fromEntries((companyOverrides || []).map((o: any) => [o.feature_slug, o.enabled]))

      const roleName = String(role?.name || employee?.position || '').toLowerCase()
      const isAdminRole = /admin|owner|director|manager|principal/.test(roleName)

      const trialEnds = trial?.ends_at ?? null
      setState({
        loading: false,
        tier: (lic?.tier as Tier) || 'basic',
        status: lic?.status || 'unknown',
        planCode: lic?.plan_code || null,
        licenseKey: lic?.license_key || null,
        expiresAt: lic?.expires_at || null,
        daysRemaining: daysUntil(lic?.expires_at || null),
        valid: ['active', 'trial', 'grace'].includes(lic?.status || ''),
        withinCaps: true,
        capDetails: {},
        overrides,
        roleGrants,
        isAdminRole,
        trial: trial
          ? {
              active: ['active', 'reminded'].includes(trial.status) && trialEnds && new Date(trialEnds) > new Date(),
              endsAt: trialEnds,
              daysLeft: daysUntil(trialEnds),
            }
          : null,
        badge: null,
        companyId,
        refresh: load,
        can: () => true,
      })
    } catch (err) {
      console.error('[license] load failed', err)
      setState((s) => ({ ...s, loading: false, companyId }))
    }
  }, [companyId, role?.id, employee?.position])

  useEffect(() => {
    load()
  }, [load])

  // Twice-a-day server heartbeat: once per session, and again if the tab has
  // been open long enough to cross the 12-hour mark.
  useEffect(() => {
    if (!companyId || !userId) return
    const key = `lic-heartbeat-${companyId}`
    const run = async () => {
      const last = Number(localStorage.getItem(key) || 0)
      if (Date.now() - last < 12 * 3600 * 1000) return
      try {
        const [{ count: employees }, { count: students }] = await Promise.all([
          supabase.from('company_employees').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'active'),
          supabase.from('students').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        ])
        const res = await fetch('/api/lic/license', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'validate',
            companyId,
            licenseKey: state.licenseKey,
            employees: employees || 0,
            students: students || 0,
          }),
        })
        const json = await res.json()
        if (json?.data) {
          setState((s) => ({
            ...s,
            valid: !!json.data.valid,
            status: json.data.status || s.status,
            withinCaps: !!json.data.within_caps,
            capDetails: json.data.cap_details || {},
            daysRemaining: json.data.days_remaining ?? s.daysRemaining,
          }))
        }
        localStorage.setItem(key, String(Date.now()))
      } catch (e) {
        console.error('[license] heartbeat failed', e)
      }
    }
    run()
  }, [companyId, userId, state.licenseKey])

  const can = useCallback(
    (slug: string) => {
      const ctx: GateContext = {
        tier: state.tier,
        companyKind,
        overrides: state.overrides,
        roleGrants: state.roleGrants,
        isAdminRole: state.isAdminRole,
      }
      // Licence must be valid and within caps for anything to work.
      if (state.status !== 'unknown' && !state.valid) return false
      return gateFeature(slug, ctx)
    },
    [state.tier, state.overrides, state.roleGrants, state.isAdminRole, state.valid, state.status, companyKind]
  )

  const value = useMemo(() => ({ ...state, refresh: load, can }), [state, load, can])

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>
}
