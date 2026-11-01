import { NextRequest, NextResponse } from 'next/server'
import { adminAvailable } from '@/lib/lic/peer'
import { getCaller } from '@/lib/lic/serverAuth'
import { sendEmail, sendWhatsApp } from '@/lib/lic/notify'
import { parseBody, prepareReturn, recordFiling, resolveDelivery } from '@/lib/ura/server'
import { ugx } from '@/lib/ura/uganda-tax'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ura/send
 * Body: { companyId, returnType, periodStart, periodEnd, emails?, whatsapp?, alsoAdmins? }
 *
 * Builds the validated URA workbook and sends it to the company's email and
 * WhatsApp number (plus any extra recipients), so the person who files at URA
 * has the file and the figures without downloading anything. The workbook is
 * attached to the email; the WhatsApp copy carries the summary and the filing
 * deadline.
 */
export async function POST(req: NextRequest) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  const body = await req.json().catch(() => ({}))
  const parsed = parseBody(body)
  if ('error' in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 })

  const prepared = await prepareReturn(req, parsed)
  if ('error' in prepared) return NextResponse.json({ ok: false, error: prepared.error }, { status: prepared.status })

  const recipients = await resolveDelivery(parsed.companyId, {
    emails: Array.isArray(body?.emails) ? body.emails : undefined,
    whatsapp: Array.isArray(body?.whatsapp) ? body.whatsapp : undefined,
    alsoAdmins: body?.alsoAdmins !== false,
  })

  if (!recipients.emails.length && !recipients.phones.length) {
    return NextResponse.json({ ok: false, error: 'No company email or phone is on record to send to.' }, { status: 400 })
  }

  const { bundle, validation, summary, workbook } = prepared
  const isPaye = bundle.returnType === 'paye'
  const returnName = isPaye ? 'PAYE Return (DT2008)' : 'Income Tax Return (DT20002)'
  const subject = `${returnName} for ${bundle.period.label} — ${bundle.taxpayer.name}`
  const filename = `ura-${isPaye ? 'paye' : 'income-tax'}-${bundle.period.start}-to-${bundle.period.end}.xlsx`

  const taxLine = isPaye
    ? `<tr><td style="padding:6px 0;color:#94a3b8">PAYE payable</td><td style="text-align:right;font-weight:600">${ugx(summary.taxPayable)}</td></tr>`
    : `<tr><td style="padding:6px 0;color:#94a3b8">Chargeable income</td><td style="text-align:right">${ugx(summary.chargeableIncome)}</td></tr>
       <tr><td style="padding:6px 0;color:#94a3b8">Tax payable</td><td style="text-align:right;font-weight:600">${ugx(summary.taxPayable)}</td></tr>`

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:560px">
      <h2 style="margin:0 0 4px">${returnName}</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px">${bundle.taxpayer.name} · ${bundle.period.label}</p>
      <p style="font-size:14px;color:#475569">The return below was prepared and validated by Jackisa Office.
      Open the official URA template for this return, copy these figures in, press <strong>VALIDATE</strong>,
      then upload the generated file at <strong>ura.go.ug</strong> under e-Returns.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
        <tr><td style="padding:6px 0;color:#94a3b8">TIN</td><td style="text-align:right">${bundle.taxpayer.tin || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8">Period</td><td style="text-align:right">${bundle.period.start} to ${bundle.period.end}</td></tr>
        ${taxLine}
        <tr><td style="padding:6px 0;color:#94a3b8">Validation</td><td style="text-align:right">${validation.ok ? 'Passed' : `${validation.errors} error(s)`}</td></tr>
        ${bundle.period.dueDate ? `<tr><td style="padding:6px 0;color:#94a3b8">Filing deadline</td><td style="text-align:right">${bundle.period.dueDate}</td></tr>` : ''}
      </table>
      <p style="font-size:13px;color:#94a3b8">The completed URA workbook is attached (${filename}).</p>
    </div>`

  const text =
    `${returnName} — ${bundle.taxpayer.name}\n` +
    `Period: ${bundle.period.label}\n` +
    (isPaye ? `PAYE payable: ${ugx(summary.taxPayable)}\n` : `Chargeable income: ${ugx(summary.chargeableIncome)}\nTax payable: ${ugx(summary.taxPayable)}\n`) +
    `Validation: ${validation.ok ? 'Passed' : `${validation.errors} error(s)`}\n` +
    (bundle.period.dueDate ? `Deadline: ${bundle.period.dueDate}\n` : '') +
    `The completed URA workbook has been emailed. Copy the figures into the official URA template, press VALIDATE, then upload the generated file at ura.go.ug under e-Returns.`

  const [email, whatsapp] = await Promise.all([
    recipients.emails.length
      ? sendEmail({
          to: recipients.emails,
          subject,
          html,
          template: 'ura_filing',
          attachment: { filename, data: workbook.toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        })
      : Promise.resolve({ ok: false, error: 'no_email' }),
    recipients.phones.length
      ? sendWhatsApp({ to: recipients.phones[0], body: text, template: 'ura_filing' })
      : Promise.resolve({ ok: false, error: 'no_whatsapp_number' }),
  ])

  const caller = await getCaller(req)
  await recordFiling(parsed.companyId, prepared, caller?.id || null, 'delivered', [...recipients.emails, ...recipients.phones])

  return NextResponse.json({
    ok: true,
    data: {
      delivered: { email, whatsapp },
      recipients,
      validation,
    },
  })
}
