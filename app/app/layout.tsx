'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SidebarNav } from '@/components/sidebar-nav'
import type { User } from '@/types'
import { Spinner } from '@/components/ui/spinner'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [companyName, setCompanyName] = useState('Jackisa Office')

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session) {
          router.push('/auth/login')
          return
        }

        // Fetch user data
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (userData) {
          setUser(userData)

          // Fetch company data if employee
          if (userData.role === 'employee' || userData.role === 'company_admin') {
            const { data: employeeData } = await supabase
              .from('employees')
              .select('company_id')
              .eq('user_id', session.user.id)
              .single()

            if (employeeData) {
              const { data: companyData } = await supabase
                .from('companies')
                .select('name')
                .eq('id', employeeData.company_id)
                .single()

              if (companyData) {
                setCompanyName(companyData.name)
              }
            }
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Spinner className="w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      <SidebarNav onLogout={handleLogout} companyName={companyName} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto bg-background">
          {children}
        </div>
      </main>
    </div>
  )
}
