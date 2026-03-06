'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { ensureFundMemberPosition } from '@/lib/investment-membership'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Users,
  Plus,
  RefreshCw,
  Wallet,
  TrendingUp,
  Crown,
  DollarSign,
  UserPlus,
} from 'lucide-react'

const roleLabels: Record<string, string> = { chair: 'Chair', treasurer: 'Treasurer', secretary: 'Secretary', member: 'Member' }
const roleColors: Record<string, string> = { chair: 'badge-warning', treasurer: 'badge-info', secretary: 'badge-neutral', member: 'badge-neutral' }

export default function InvestmentClubsPage() {
  const [fund, setFund] = useState<any>(null)
  const [clubs, setClubs] = useState<any[]>([])
  const [myPosition, setMyPosition] = useState<any>(null)
  const [allPositions, setAllPositions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [joinClubId, setJoinClubId] = useState<string | null>(null)
  const [form, setForm] = useState({ club_name: '', description: '' })
  const [joinForm, setJoinForm] = useState({ role: 'member' })

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const ctx = await getSessionContext()
    if (!ctx?.companyId || !ctx.userId) { setLoading(false); return }

    const { data: fundData } = await supabase
      .from('workspace_funds').select('*').eq('company_id', ctx.companyId).maybeSingle()
    if (!fundData) { setLoading(false); return }
    setFund(fundData)

    const { data: empData } = await supabase
      .from('company_employees').select('id').eq('company_id', ctx.companyId).eq('user_id', ctx.userId).maybeSingle()

    if (empData) {
      const posData = await ensureFundMemberPosition(ctx.companyId, ctx.userId, fundData.id)
      setMyPosition(posData)
    }

    const [clubsRes, positionsRes] = await Promise.all([
      supabase.from('investment_clubs').select('*, investment_club_members(*, fund_member_positions(company_employees(users(full_name))))').eq('fund_id', fundData.id).eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('fund_member_positions').select('id, employee_id, company_employees(users(full_name))').eq('fund_id', fundData.id).eq('is_active', true),
    ])

    setClubs(clubsRes.data || [])
    setAllPositions(positionsRes.data || [])
    setLoading(false)
  }

  const createClub = async () => {
    if (!fund || !form.club_name) return
    const { data: newClub } = await supabase.from('investment_clubs').insert({
      fund_id: fund.id,
      club_name: form.club_name,
      description: form.description || null,
    }).select('id').single()

    if (newClub && myPosition) {
      await supabase.from('investment_club_members').insert({
        club_id: newClub.id,
        member_position_id: myPosition.id,
        role: 'chair',
      })
    }

    setForm({ club_name: '', description: '' })
    setShowForm(false)
    await loadData()
  }

  const joinClub = async (clubId: string) => {
    if (!myPosition) return
    await supabase.from('investment_club_members').insert({
      club_id: clubId,
      member_position_id: myPosition.id,
      role: joinForm.role || 'member',
    })
    setJoinClubId(null)
    setJoinForm({ role: 'member' })
    await loadData()
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
        <div className="flex items-center justify-center py-20"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground/40" /></div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Investment Clubs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Form groups, pool contributions, and invest collectively within the fund</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus className="w-4 h-4 mr-1.5" />Create Club</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="stat-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-50"><Users className="w-4 h-4 text-blue-600" /></div>
            <div>
              <p className="text-lg font-bold text-foreground">{clubs.length}</p>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Active Clubs</p>
            </div>
          </div>
        </Card>
        <Card className="stat-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-50"><DollarSign className="w-4 h-4 text-emerald-600" /></div>
            <div>
              <p className="text-lg font-bold text-foreground font-mono">{fund?.currency} {clubs.reduce((s, c) => s + Number(c.total_value || 0), 0).toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Total Club Value</p>
            </div>
          </div>
        </Card>
        <Card className="stat-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-50"><TrendingUp className="w-4 h-4 text-purple-600" /></div>
            <div>
              <p className="text-lg font-bold text-foreground">{clubs.reduce((s, c) => s + (c.investment_club_members?.length || 0), 0)}</p>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Total Club Members</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Create Club Form */}
      {showForm && (
        <Card className="p-5 border border-primary/15 bg-primary/[0.02] space-y-3">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Plus className="w-4 h-4 text-primary" /></div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Create Investment Club</h3>
              <p className="text-[11px] text-muted-foreground/60">You will be assigned as Chair automatically</p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Input placeholder="Club name *" value={form.club_name} onChange={(e) => setForm({ ...form, club_name: e.target.value })} />
            <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="pt-3 border-t border-border/30 flex gap-2">
            <Button size="sm" onClick={createClub}>Create Club</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Clubs Grid */}
      {clubs.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground/60">No investment clubs yet. Create the first one!</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {clubs.map((club: any) => {
            const members = club.investment_club_members || []
            const isMember = myPosition && members.some((m: any) => m.member_position_id === myPosition.id)

            return (
              <Card key={club.id} className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">{club.club_name}</h4>
                      {club.description && <p className="text-[10px] text-muted-foreground/50">{club.description}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold font-mono">{fund?.currency} {Number(club.total_value || 0).toLocaleString()}</p>
                    <p className="text-[9px] text-muted-foreground/40">NAV: {Number(club.club_nav || 1).toFixed(4)}</p>
                  </div>
                </div>

                {/* Members */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium">Members ({members.length})</p>
                  {members.slice(0, 5).map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between py-1">
                      <span className="text-xs text-foreground">{m.fund_member_positions?.company_employees?.users?.full_name || 'Unknown'}</span>
                      <span className={`badge ${roleColors[m.role] || 'badge-neutral'} text-[10px]`}>{roleLabels[m.role] || m.role}</span>
                    </div>
                  ))}
                  {members.length > 5 && <p className="text-[10px] text-muted-foreground/40">+{members.length - 5} more</p>}
                </div>

                {/* Join */}
                {!isMember && myPosition && (
                  joinClubId === club.id ? (
                    <div className="flex gap-2 items-center">
                      <select className="form-select text-xs flex-1" value={joinForm.role} onChange={(e) => setJoinForm({ role: e.target.value })}>
                        <option value="member">Member</option>
                        <option value="treasurer">Treasurer</option>
                        <option value="secretary">Secretary</option>
                      </select>
                      <Button size="sm" onClick={() => joinClub(club.id)}>Join</Button>
                      <Button size="sm" variant="outline" onClick={() => setJoinClubId(null)}>×</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="w-full" onClick={() => setJoinClubId(club.id)}>
                      <UserPlus className="w-3.5 h-3.5 mr-1.5" />Join This Club
                    </Button>
                  )
                )}
                {isMember && (
                  <div className="text-center py-1.5 rounded-lg bg-emerald-50 border border-emerald-100">
                    <p className="text-[10px] text-emerald-700 font-medium">You are a member of this club</p>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
