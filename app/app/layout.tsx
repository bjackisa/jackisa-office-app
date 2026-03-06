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
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-5 animate-fade-in">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
            <span className="text-primary font-bold text-xl">J</span>
          </div>
          <Spinner className="w-5 h-5 text-primary/60" />
          <p className="text-sm text-muted-foreground font-medium">Loading workspace...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
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
        <header className="h-[56px] bg-card/80 backdrop-blur-xl border-b border-border/60 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-muted/50 border border-border/50 w-72 transition-all duration-200 focus-within:border-primary/30 focus-within:bg-background focus-within:shadow-sm">
              <Search className="w-4 h-4 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Search anything..."
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none flex-1"
              />
              <kbd className="text-[10px] text-muted-foreground/40 bg-background border border-border/60 px-1.5 py-0.5 rounded-md font-mono">⌘K</kbd>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="relative p-2 rounded-xl text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-all duration-200">
              <HelpCircle className="w-[18px] h-[18px]" />
            </button>
            <button className="relative p-2 rounded-xl text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-all duration-200">
              <Bell className="w-[18px] h-[18px]" />
              {notificationCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-card">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>
            <div className="w-px h-6 bg-border/40 mx-2.5" />
            <div className="flex items-center gap-2.5 pl-1 py-1 px-2 rounded-xl hover:bg-muted/40 transition-all duration-200 cursor-pointer">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-border/50" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold ring-2 ring-primary/10">
                  {user?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                </div>
              )}
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-foreground leading-tight">{user?.full_name || 'User'}</p>
                <p className="text-[11px] text-muted-foreground/60 leading-tight">{company?.name || 'No workspace'}</p>
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
