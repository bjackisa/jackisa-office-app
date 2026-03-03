'use client'

import { useAuth } from '@/lib/hooks/useAuth'
import { SidebarNav } from '@/components/sidebar-nav'
import { Spinner } from '@/components/ui/spinner'
import { Bell, Search, HelpCircle } from 'lucide-react'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, company, companies, loading, logout, switchCompany } = useAuth()
  const [notificationCount, setNotificationCount] = useState(0)

  useEffect(() => {
    if (!user) return
    const loadNotifications = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
      setNotificationCount(count || 0)
    }
    loadNotifications()
  }, [user])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f8f9fb]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-lg">J</span>
          </div>
          <Spinner className="w-6 h-6 text-blue-600" />
          <p className="text-sm text-gray-400 font-medium">Loading workspace...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[#f8f9fb]">
      <SidebarNav
        onLogout={logout}
        companyName={company?.name || 'Jackisa Office'}
        userName={user?.full_name || 'User'}
        userEmail={user?.email || ''}
        userAvatar={user?.avatar_url}
        companies={companies}
        onSwitchCompany={switchCompany}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Bar */}
        <header className="h-14 bg-white border-b border-gray-200/80 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200/60 w-72">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search anything..."
                className="bg-transparent text-sm text-gray-600 placeholder:text-gray-400 outline-none flex-1"
              />
              <kbd className="text-[10px] text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="relative p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
              <HelpCircle className="w-[18px] h-[18px]" />
            </button>
            <button className="relative p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
              <Bell className="w-[18px] h-[18px]" />
              {notificationCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>
            <div className="w-px h-6 bg-gray-200 mx-2" />
            <div className="flex items-center gap-2.5 pl-1">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-gray-100" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-xs font-semibold ring-2 ring-blue-50">
                  {user?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                </div>
              )}
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-800 leading-tight">{user?.full_name || 'User'}</p>
                <p className="text-[11px] text-gray-400 leading-tight">{company?.name || 'No workspace'}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
