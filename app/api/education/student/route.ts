import { NextRequest, NextResponse } from 'next/server'
import { adminClient, adminAvailable } from '@/lib/lic/peer'
import { lic } from '@/lib/lic/client'

export const dynamic = 'force-dynamic'

/**
 * POST /api/education/student
 *
 * Publishes a student's contact details to the licence hub so that marks
 * notifications and report cards can be delivered without the hub calling back
 * into this app. Called when a student is created or edited.
 *
 * Body: { companyId, student: { id, name, student_no?, phone?, email?, guardian_* } }
 */
export async function POST(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const companyId = String(body?.companyId || '')
  const student = body?.student || {}
  if (!companyId || !student?.id || !student?.name) {
    return NextResponse.json({ ok: false, error: 'companyId, student.id and student.name are required' }, { status: 400 })
  }

  const db = adminClient()
  const { data: company } = await db.from('companies').select('lic_tenant_id').eq('id', companyId).maybeSingle()
  const tenantId = company?.lic_tenant_id || companyId

  const result = await lic.syncStudent({
    tenant_id: tenantId,
    student: {
      id: student.id,
      name: student.name,
      student_no: student.student_no,
      phone: student.phone,
      email: student.email,
      guardian_name: student.guardian_name,
      guardian_phone: student.guardian_phone,
      guardian_email: student.guardian_email,
    },
  })

  return NextResponse.json({ ok: result.api_status === '200', error: (result as any)?.errors?.error_text })
}
