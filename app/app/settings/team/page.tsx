'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  UserPlus, Mail, Clock, CheckCircle, XCircle, Send,
  Users, MoreHorizontal, Copy, RefreshCw, Trash2, Shield,
} from 'lucide-react'

interface Invitation {
  id: string
  email: string
  full_name: string
  department: string | null
  position: string | null
  status: string
  expires_at: string
  created_at: string
  company_roles?: { name: string } | null
}

export default function TeamManagementPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)

  const [form, setForm] = useState({
    email: '',
    fullName: '',
    department: '',
    position: '',
    roleId: '',
    salary: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const context = await getSessionContext()
      if (!context?.companyId) return
      setCompanyId(context.companyId)

      const [invRes, rolesRes] = await Promise.all([
        supabase
          .from('employee_invitations')
          .select('*, company_roles(name)')
          .eq('company_id', context.companyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('company_roles')
          .select('*')
          .eq('company_id', context.companyId)
          .order('name'),
      ])

      setInvitations(invRes.data || [])
      setRoles(rolesRes.data || [])
    } catch (error) {
      console.error('Failed to load team data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInvite = async () => {
    if (!form.email || !form.fullName || !form.roleId || !companyId) {
      setMessage({ type: 'error', text: 'Please fill in all required fields.' })
      return
    }

    setSending(true)
    setMessage(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const token = crypto.randomUUID()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      const { error } = await supabase
        .from('employee_invitations')
        .insert({
          company_id: companyId,
          company_role_id: form.roleId,
          email: form.email,
          full_name: form.fullName,
          department: form.department || null,
          position: form.position || null,
          salary: form.salary ? parseFloat(form.salary) : null,
          token,
          status: 'pending',
          invited_by: session.user.id,
          expires_at: expiresAt.toISOString(),
        })

      if (error) throw error

      setMessage({ type: 'success', text: `Invitation sent to ${form.email}` })
      setForm({ email: '', fullName: '', department: '', position: '', roleId: '', salary: '' })
      setShowInviteForm(false)
      loadData()
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to send invitation' })
    } finally {
      setSending(false)
    }
  }

  const revokeInvitation = async (id: string) => {
    await supabase
      .from('employee_invitations')
      .update({ status: 'revoked' })
      .eq('id', id)
    loadData()
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; icon: any; label: string }> = {
      pending: { bg: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock, label: 'Pending' },
      accepted: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle, label: 'Accepted' },
      expired: { bg: 'bg-muted text-muted-foreground border-border', icon: XCircle, label: 'Expired' },
      revoked: { bg: 'bg-red-50 text-red-600 border-red-200', icon: XCircle, label: 'Revoked' },
    }
    return map[status] || map.pending
  }

  const pendingCount = invitations.filter(i => i.status === 'pending').length
  const acceptedCount = invitations.filter(i => i.status === 'accepted').length

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Team Management</h1>
          <p className="text-sm text-muted-foreground">Invite and manage team members for your workspace</p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowInviteForm(!showInviteForm)}
        >
          <UserPlus className="w-4 h-4 mr-1.5" />
          Invite Member
        </Button>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6 stagger-children">
        {[
          { label: 'Total Invitations', value: invitations.length, gradient: 'from-blue-500 to-blue-600' },
          { label: 'Pending', value: pendingCount, gradient: 'from-amber-500 to-orange-500' },
          { label: 'Accepted', value: acceptedCount, gradient: 'from-emerald-500 to-green-600' },
        ].map(stat => (
          <Card key={stat.label} className="stat-card p-4">
            <p className="text-[11px] text-muted-foreground font-medium mb-1">{stat.label}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Invite Form */}
      {showInviteForm && (
        <Card className="border border-primary/15 bg-primary/[0.02] p-5 mb-6">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Send Invitation</h3>
              <p className="text-[11px] text-muted-foreground/60">Invite a new team member</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email *</label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="bg-card"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Full Name *</label>
              <Input
                placeholder="John Doe"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="bg-card"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Role *</label>
              <select
                className="form-select bg-card"
                value={form.roleId}
                onChange={(e) => setForm({ ...form, roleId: e.target.value })}
              >
                <option value="">Select role...</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Department</label>
              <Input
                placeholder="e.g. Finance"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="bg-card"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Position</label>
              <Input
                placeholder="e.g. Senior Accountant"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className="bg-card"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Monthly Salary (UGX)</label>
              <Input
                type="number"
                placeholder="0"
                value={form.salary}
                onChange={(e) => setForm({ ...form, salary: e.target.value })}
                className="bg-card"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-5">
            <Button
              size="sm"
              onClick={handleInvite}
              disabled={sending}
            >
              <Send className="w-4 h-4 mr-1.5" />
              {sending ? 'Sending...' : 'Send Invitation'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowInviteForm(false)}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Invitations Table */}
      <Card className="border border-border/50 bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Invitations</h3>
          <button onClick={loadData} className="p-1.5 rounded-md text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Invitee</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th>Sent</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="!py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading team data...</p>
                  </div>
                </td></tr>
              ) : invitations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <Mail className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground/60 font-medium">No invitations yet</p>
                    <p className="text-xs text-muted-foreground/40 mt-1">Click &quot;Invite Member&quot; to get started</p>
                  </td>
                </tr>
              ) : (
                invitations.map((inv) => {
                  const badge = getStatusBadge(inv.status)
                  const StatusIcon = badge.icon
                  return (
                    <tr key={inv.id} className="group">
                      <td>
                        <p className="text-sm font-medium text-foreground">{inv.full_name}</p>
                        <p className="text-[11px] text-muted-foreground/50">{inv.email}</p>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <Shield className="w-3 h-3 text-muted-foreground/40" />
                          <span className="text-muted-foreground">{inv.company_roles?.name || '—'}</span>
                        </div>
                      </td>
                      <td className="text-muted-foreground">{inv.department || '—'}</td>
                      <td>
                        <span className={`badge ${
                          inv.status === 'accepted' ? 'badge-success' :
                          inv.status === 'pending' ? 'badge-warning' :
                          inv.status === 'revoked' ? 'badge-danger' : 'badge-neutral'
                        }`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="text-xs text-muted-foreground/50">
                        {new Date(inv.created_at).toLocaleDateString()}
                      </td>
                      <td className="text-right">
                        {inv.status === 'pending' && (
                          <button
                            onClick={() => revokeInvitation(inv.id)}
                            className="p-1.5 rounded-md text-muted-foreground/60 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                            title="Revoke invitation"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
