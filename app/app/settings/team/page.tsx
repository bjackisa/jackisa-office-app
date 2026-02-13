'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: empData } = await supabase
        .from('company_employees')
        .select('company_id')
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .limit(1)
        .single()

      if (!empData) return
      setCompanyId(empData.company_id)

      const [invRes, rolesRes] = await Promise.all([
        supabase
          .from('employee_invitations')
          .select('*, company_roles(name)')
          .eq('company_id', empData.company_id)
          .order('created_at', { ascending: false }),
        supabase
          .from('company_roles')
          .select('*')
          .eq('company_id', empData.company_id)
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
      expired: { bg: 'bg-gray-100 text-gray-500 border-gray-200', icon: XCircle, label: 'Expired' },
      revoked: { bg: 'bg-red-50 text-red-600 border-red-200', icon: XCircle, label: 'Revoked' },
    }
    return map[status] || map.pending
  }

  const pendingCount = invitations.filter(i => i.status === 'pending').length
  const acceptedCount = invitations.filter(i => i.status === 'accepted').length

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Team Management</h1>
          <p className="text-sm text-gray-500">Invite and manage team members for your workspace</p>
        </div>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700"
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
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Invitations', value: invitations.length, icon: Mail, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Pending', value: pendingCount, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Accepted', value: acceptedCount, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(stat => (
          <Card key={stat.label} className="p-4 border border-gray-200/60 bg-white">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Invite Form */}
      {showInviteForm && (
        <Card className="border border-blue-200 bg-blue-50/30 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-600" />
            Send Invitation
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Email *</label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Full Name *</label>
              <Input
                placeholder="John Doe"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Role *</label>
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
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
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Department</label>
              <Input
                placeholder="e.g. Finance"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Position</label>
              <Input
                placeholder="e.g. Senior Accountant"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className="bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Monthly Salary (UGX)</label>
              <Input
                type="number"
                placeholder="0"
                value={form.salary}
                onChange={(e) => setForm({ ...form, salary: e.target.value })}
                className="bg-white"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-5">
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
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
      <Card className="border border-gray-200/60 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Invitations</h3>
          <button onClick={loadData} className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Invitee</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Sent</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-400">Loading...</td>
                </tr>
              ) : invitations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <Mail className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400 font-medium">No invitations yet</p>
                    <p className="text-xs text-gray-300 mt-1">Click &quot;Invite Member&quot; to get started</p>
                  </td>
                </tr>
              ) : (
                invitations.map((inv) => {
                  const badge = getStatusBadge(inv.status)
                  const StatusIcon = badge.icon
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{inv.full_name}</p>
                          <p className="text-[11px] text-gray-400">{inv.email}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Shield className="w-3 h-3 text-gray-400" />
                          <span className="text-sm text-gray-600">{inv.company_roles?.name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-gray-500">{inv.department || '—'}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${badge.bg}`}>
                          <StatusIcon className="w-3 h-3" />
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-gray-400">
                          {new Date(inv.created_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {inv.status === 'pending' && (
                          <button
                            onClick={() => revokeInvitation(inv.id)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
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
