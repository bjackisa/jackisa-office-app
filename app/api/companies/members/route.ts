import { NextRequest, NextResponse } from 'next/server'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { getCaller, requireCompanyAdmin } from '@/lib/lic/serverAuth'
import { checkEmployeeCap } from '@/lib/lic/caps'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * POST /api/companies/members
 * One endpoint for the whole admission flow. Actions:
 *   create_invite      admin: mint a shareable invite link
 *   list_invites       admin: list invite links
 *   revoke_invite      admin: deactivate an invite link
 *   request_join       user:  ask to join a company (or accept an invite token)
 *   list_requests      admin: pending join requests
 *   decide_request     admin: approve/reject a join request
 *   list_members       member: list active members
 *   set_role           admin: change a member's role
 *   remove_member      admin: deactivate a member
 */
export async function POST(req: NextRequest) {
  if (!adminAvailable()) {
    return NextResponse.json({ ok: false, error: 'Membership service is not configured' }, { status: 500 })
  }
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || '')
  const companyId = String(body?.companyId || '')
  const db = adminClient()

  try {
    switch (action) {
      case 'create_invite': {
        const guard = await requireCompanyAdmin(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        const token = crypto.randomBytes(24).toString('base64url')
        const { data, error } = await db
          .from('company_invite_links')
          .insert({
            company_id: companyId,
            company_role_id: body.companyRoleId || null,
            token,
            label: body.label || null,
            department: body.department || null,
            position: body.position || null,
            max_uses: body.maxUses ? Number(body.maxUses) : null,
            requires_approval: !!body.requiresApproval,
            expires_at: body.expiresAt || null,
            created_by: guard.caller.id,
          })
          .select()
          .single()
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
        return NextResponse.json({ ok: true, invite: data, url: `${new URL(req.url).origin}/auth/join?invite=${token}` })
      }

      case 'list_invites': {
        const guard = await requireCompanyAdmin(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        const { data } = await db.from('company_invite_links').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
        return NextResponse.json({ ok: true, invites: data || [] })
      }

      case 'revoke_invite': {
        const guard = await requireCompanyAdmin(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        await db.from('company_invite_links').update({ is_active: false }).eq('id', body.inviteId).eq('company_id', companyId)
        return NextResponse.json({ ok: true })
      }

      case 'request_join': {
        const caller = await getCaller(req)
        if (!caller) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })
        const inviteToken = body.inviteToken ? String(body.inviteToken) : null
        let invite: any = null
        if (inviteToken) {
          const { data } = await db.from('company_invite_links').select('*').eq('token', inviteToken).eq('is_active', true).maybeSingle()
          invite = data
          if (!invite) return NextResponse.json({ ok: false, error: 'This invite link is no longer valid' }, { status: 400 })
          if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
            return NextResponse.json({ ok: false, error: 'This invite link has expired' }, { status: 400 })
          }
          if (invite.max_uses && invite.use_count >= invite.max_uses) {
            return NextResponse.json({ ok: false, error: 'This invite link has reached its limit' }, { status: 400 })
          }
        }
        const targetCompany = invite?.company_id || companyId
        if (!targetCompany) return NextResponse.json({ ok: false, error: 'companyId or inviteToken is required' }, { status: 400 })

        const autoApprove = invite && !invite.requires_approval
        if (autoApprove) {
          const cap = await checkEmployeeCap(db, targetCompany)
          if (!cap.allowed) return NextResponse.json({ ok: false, error: cap.error, cap }, { status: 402 })
        }
        const { data: request, error } = await db
          .from('company_join_requests')
          .upsert(
            {
              company_id: targetCompany,
              user_id: caller.id,
              company_role_id: invite?.company_role_id || body.companyRoleId || null,
              department: body.department || invite?.department || null,
              position: body.position || invite?.position || null,
              message: body.message || null,
              source: inviteToken ? 'invite_link' : 'request',
              invite_link_id: invite?.id || null,
              status: autoApprove ? 'approved' : 'pending',
              decided_at: autoApprove ? new Date().toISOString() : null,
            },
            { onConflict: 'company_id,user_id' }
          )
          .select()
          .single()
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

        if (autoApprove) {
          await db.from('company_employees').upsert(
            {
              company_id: targetCompany,
              user_id: caller.id,
              company_role_id: invite.company_role_id || null,
              position: invite.position || 'Member',
              department: invite.department || null,
              status: 'active',
              joined_at: new Date().toISOString(),
              invite_link_id: invite.id,
            },
            { onConflict: 'company_id,user_id' }
          )
          await db.from('company_invite_links').update({ use_count: (invite.use_count || 0) + 1 }).eq('id', invite.id)
        }

        return NextResponse.json({ ok: true, request, autoApproved: !!autoApprove })
      }

      case 'list_requests': {
        const guard = await requireCompanyAdmin(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        const { data } = await db
          .from('company_join_requests')
          .select('*, users(email, full_name, avatar_url)')
          .eq('company_id', companyId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
        return NextResponse.json({ ok: true, requests: data || [] })
      }

      case 'decide_request': {
        const guard = await requireCompanyAdmin(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        const requestId = String(body.requestId || '')
        const approve = body.approve === true
        const { data: request } = await db.from('company_join_requests').select('*').eq('id', requestId).eq('company_id', companyId).maybeSingle()
        if (!request) return NextResponse.json({ ok: false, error: 'Request not found' }, { status: 404 })

        if (approve) {
          const cap = await checkEmployeeCap(db, companyId)
          if (!cap.allowed) return NextResponse.json({ ok: false, error: cap.error, cap }, { status: 402 })
        }

        await db
          .from('company_join_requests')
          .update({ status: approve ? 'approved' : 'rejected', decided_by: guard.caller.id, decided_at: new Date().toISOString(), decision_note: body.note || null })
          .eq('id', requestId)

        if (approve) {
          await db.from('company_employees').upsert(
            {
              company_id: companyId,
              user_id: request.user_id,
              company_role_id: request.company_role_id || null,
              position: request.position || 'Member',
              department: request.department || null,
              status: 'active',
              joined_at: new Date().toISOString(),
            },
            { onConflict: 'company_id,user_id' }
          )
          if (request.invite_link_id) {
            const { data: invite } = await db.from('company_invite_links').select('use_count').eq('id', request.invite_link_id).maybeSingle()
            if (invite) await db.from('company_invite_links').update({ use_count: (invite.use_count || 0) + 1 }).eq('id', request.invite_link_id)
          }
        }
        return NextResponse.json({ ok: true })
      }

      case 'list_members': {
        const caller = await getCaller(req)
        if (!caller) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })
        const { data } = await db
          .from('company_employees')
          .select('id, user_id, position, department, status, joined_at, company_role_id, company_roles(name), users(email, full_name, avatar_url, kyc_status)')
          .eq('company_id', companyId)
          .order('joined_at', { ascending: true })
        return NextResponse.json({ ok: true, members: data || [] })
      }

      case 'set_role': {
        const guard = await requireCompanyAdmin(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        await db.from('company_employees').update({ company_role_id: body.companyRoleId, position: body.position }).eq('company_id', companyId).eq('user_id', body.userId)
        return NextResponse.json({ ok: true })
      }

      case 'remove_member': {
        const guard = await requireCompanyAdmin(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        if (body.userId === guard.caller.id) return NextResponse.json({ ok: false, error: 'You cannot remove yourself' }, { status: 400 })
        await db.from('company_employees').update({ status: 'inactive' }).eq('company_id', companyId).eq('user_id', body.userId)
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Request failed' }, { status: 500 })
  }
}

/** GET /api/companies/members?companyId=...&invite=token — public invite lookup */
export async function GET(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const url = new URL(req.url)
  const invite = url.searchParams.get('invite')
  const db = adminClient()
  if (invite) {
    const { data } = await db
      .from('company_invite_links')
      .select('id, company_id, label, department, position, requires_approval, is_active, expires_at, companies(name, logo_url)')
      .eq('token', invite)
      .eq('is_active', true)
      .maybeSingle()
    if (!data) return NextResponse.json({ ok: false, error: 'Invite not found' }, { status: 404 })
    return NextResponse.json({ ok: true, invite: data })
  }
  return NextResponse.json({ ok: false, error: 'invite token required' }, { status: 400 })
}
