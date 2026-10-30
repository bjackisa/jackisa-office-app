import { NextRequest, NextResponse } from 'next/server'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { getCaller, requireCompanyAdmin } from '@/lib/lic/serverAuth'
import { checkStudentCap } from '@/lib/lic/caps'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * POST /api/students/link
 * A student joins an institution as a student — via an invite link or a
 * request that an institution admin approves.
 *
 * Actions:
 *   create_invite    admin: mint an institution invite link
 *   list_invites     admin: list links
 *   request_join     student: request to join / accept an invite
 *   list_requests    admin: pending student requests
 *   decide_request   admin: approve / reject
 *   list_students    member: linked students
 */
export async function POST(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
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
          .from('institution_invite_links')
          .insert({
            company_id: companyId,
            token,
            label: body.label || null,
            programme: body.programme || null,
            max_uses: body.maxUses ? Number(body.maxUses) : null,
            requires_approval: body.requiresApproval !== false,
            expires_at: body.expiresAt || null,
            created_by: guard.caller.id,
          })
          .select()
          .single()
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
        return NextResponse.json({ ok: true, invite: data, url: `${new URL(req.url).origin}/auth/join?student=${token}` })
      }

      case 'list_invites': {
        const guard = await requireCompanyAdmin(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        const { data } = await db
          .from('institution_invite_links')
          .select('*')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
        return NextResponse.json({ ok: true, invites: data || [] })
      }

      case 'revoke_invite': {
        const guard = await requireCompanyAdmin(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        await db
          .from('institution_invite_links')
          .update({ is_active: false })
          .eq('id', body.inviteId)
          .eq('company_id', companyId)
        return NextResponse.json({ ok: true })
      }

      case 'request_join': {
        const caller = await getCaller(req)
        if (!caller) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })
        const inviteToken = body.inviteToken ? String(body.inviteToken) : null
        let invite: any = null
        if (inviteToken) {
          const { data } = await db.from('institution_invite_links').select('*').eq('token', inviteToken).eq('is_active', true).maybeSingle()
          invite = data
          if (!invite) return NextResponse.json({ ok: false, error: 'This student link is no longer valid' }, { status: 400 })
        }
        const targetCompany = invite?.company_id || companyId
        if (!targetCompany) return NextResponse.json({ ok: false, error: 'companyId or inviteToken is required' }, { status: 400 })

        const cap = await checkStudentCap(db, targetCompany)
        if (!cap.allowed) return NextResponse.json({ ok: false, error: cap.error, cap }, { status: 402 })

        // Find or create the student record for this user.
        let studentId = body.studentId ? String(body.studentId) : null
        if (!studentId) {
          const fullName = [body.firstName, body.lastName].filter(Boolean).join(' ') || caller.email?.split('@')[0] || 'Student'
          const { data: student } = await db
            .from('students')
            .insert({
              company_id: targetCompany,
              full_name: fullName,
              email: caller.email,
              student_id: body.studentNumber || null,
            })
            .select('id')
            .single()
          studentId = student?.id || null
        }
        if (!studentId) return NextResponse.json({ ok: false, error: 'Could not create student record' }, { status: 400 })

        const autoApprove = invite && !invite.requires_approval
        const { data: link, error } = await db
          .from('student_user_links')
          .upsert(
            {
              student_id: studentId,
              company_id: targetCompany,
              user_id: caller.id,
              student_number: body.studentNumber || null,
              programme: body.programme || invite?.programme || null,
              status: autoApprove ? 'active' : 'pending',
              source: inviteToken ? 'invite_link' : 'request',
              invite_link_id: invite?.id || null,
              approved_at: autoApprove ? new Date().toISOString() : null,
            },
            { onConflict: 'student_id,user_id' }
          )
          .select()
          .single()
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
        if (autoApprove && invite) {
          await db.from('institution_invite_links').update({ use_count: (invite.use_count || 0) + 1 }).eq('id', invite.id)
        }
        return NextResponse.json({ ok: true, link, autoApproved: !!autoApprove })
      }

      case 'list_requests': {
        const guard = await requireCompanyAdmin(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        const { data } = await db
          .from('student_user_links')
          .select('*, students(full_name, email, student_id), users(email, full_name, avatar_url)')
          .eq('company_id', companyId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
        return NextResponse.json({ ok: true, requests: data || [] })
      }

      case 'decide_request': {
        const guard = await requireCompanyAdmin(req, companyId)
        if ('error' in guard) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
        await db
          .from('student_user_links')
          .update({ status: body.approve === true ? 'active' : 'rejected', approved_by: guard.caller.id, approved_at: new Date().toISOString() })
          .eq('id', body.linkId)
          .eq('company_id', companyId)
        return NextResponse.json({ ok: true })
      }

      case 'list_students': {
        const { data } = await db
          .from('student_user_links')
          .select('*, students(full_name, email, student_id), users(full_name, avatar_url)')
          .eq('company_id', companyId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
        return NextResponse.json({ ok: true, students: data || [] })
      }

      default:
        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Request failed' }, { status: 500 })
  }
}
