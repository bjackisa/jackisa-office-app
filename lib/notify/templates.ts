/**
 * Server-side message templates for the notification engine.
 *
 * The office API route (`/api/notify/event`) builds every message here from a
 * small, typed set of facts — it never renders client-supplied HTML. That keeps
 * the rail safe: a member cannot use it to send arbitrary mail to arbitrary
 * people, and every notification carries the same branding and the same
 * attachment shape.
 */

import { escapeHtml } from '@/lib/lic/messages'
import type { DocumentSpec, NotifyEvent } from './events'

export interface TemplateInput {
  companyName: string
  data: Record<string, any>
}

export interface TemplateOutput {
  subject: string
  html: string
  text?: string
  document?: DocumentSpec
  template?: string
}

const money = (v: any, currency = 'UGX') => `${currency} ${Number(v || 0).toLocaleString()}`
const s = (v: any, fallback = '—') => escapeHtml(v === null || v === undefined || v === '' ? fallback : String(v))

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;color:#94a3b8;font-size:13px">${escapeHtml(label)}</td><td style="padding:6px 0;text-align:right;font-size:13px">${value}</td></tr>`
}

function table(rows: string): string {
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0">${rows}</table>`
}

function p(text: string): string {
  return `<p style="margin:0 0 10px;color:#475569;font-size:14px">${text}</p>`
}

type Builder = (input: TemplateInput) => TemplateOutput

const builders: Record<string, Builder> = {
  'hr.points': ({ companyName, data }) => {
    const gain = Number(data.gained || 0) > 0 || String(data.actionType) === 'gain'
    const points = Number(data.points || data.gained || data.lost || 0)
    const balance = Number(data.balance || 0)
    const verb = gain ? 'awarded' : 'deducted'
    const color = gain ? '#12703a' : '#9c2323'
    const subject = `You were ${verb} ${points} points`
    const html =
      p(`Hello ${s(data.employeeName)},`) +
      p(`You have been <strong style="color:${color}">${verb} ${points} point${points === 1 ? '' : 's'}</strong>${data.reason ? ` for <em>${s(data.reason)}</em>` : ''} at <strong>${s(companyName)}</strong>.`) +
      table(row('Points this entry', `<strong style="color:${color}">${gain ? '+' : '-'}${points}</strong>`) + row('Points balance', `<strong>${balance}</strong>`))
    const document: DocumentSpec = {
      kind: 'points_statement',
      eyebrow: 'Human resources',
      title: gain ? 'Points Award Notice' : 'Points Deduction Notice',
      subtitle: `Issued to ${s(data.employeeName)}`,
      meta: [
        ['Employee', String(data.employeeName || '')],
        ['Company', companyName],
        ['Date', String(data.date || new Date().toISOString().slice(0, 10))],
      ],
      tables: [
        {
          title: 'Entry',
          columns: [{ label: 'Detail' }, { label: 'Value', align: 'right' }],
          rows: [
            ['Action', gain ? 'Award' : 'Deduction'],
            ['Points', `${gain ? '+' : '-'}${points}`],
            ['Reason', String(data.reason || '—')],
            [{ text: 'New balance', strong: true }, { text: String(balance), strong: true }],
          ],
        },
      ],
      note: 'Points are used for recognition and performance. Keep this notice for your records.',
    }
    const text = `Hello ${data.employeeName}, you were ${verb} ${points} points${data.reason ? ` (${data.reason})` : ''} at ${companyName}. Your balance is now ${balance}.`
    return { subject, html, text, document, template: 'hr_points' }
  },

  'invoice.created': ({ companyName, data }) => {
    const items: any[] = Array.isArray(data.items) ? data.items : []
    const rows = items.map((it) => [String(it.description || it.name || ''), String(it.quantity ?? ''), money(it.amount ?? it.total ?? 0)] as any[])
    return {
      subject: `Invoice ${s(data.invoiceNumber, '')} from ${companyName}`,
      html:
        p(`Dear ${s(data.customerName, 'customer')},`) +
        p(`Please find invoice <strong>${s(data.invoiceNumber)}</strong> from <strong>${s(companyName)}</strong>, due on <strong>${s(data.dueDate)}</strong>.`) +
        table(row('Invoice total', `<strong>${money(data.total, data.currency || 'UGX')}</strong>`) + row('Amount due', money(data.outstanding ?? data.total, data.currency || 'UGX'))) +
        p('The full invoice is attached as a PDF.'),
      text: `Invoice ${data.invoiceNumber} from ${companyName}: total ${money(data.total, data.currency || 'UGX')}, due ${data.dueDate}. The PDF is attached.`,
      document: {
        kind: 'invoice',
        eyebrow: 'Billing',
        title: 'Tax Invoice',
        subtitle: `Invoice ${s(data.invoiceNumber, '')} · ${s(companyName)}`,
        status: 'Due',
        status_tone: 'due',
        filename: `invoice-${s(data.invoiceNumber, 'invoice')}.pdf`,
        parties: [
          { label: 'Billed from', lines: [String(companyName || '')] },
          { label: 'Bill to', lines: [String(data.customerName || ''), data.customerEmail ? String(data.customerEmail) : ''].filter(Boolean) },
        ],
        meta: [
          ['Invoice no.', String(data.invoiceNumber || '')],
          ['Invoice date', String(data.invoiceDate || new Date().toISOString().slice(0, 10))],
          ['Due date', String(data.dueDate || '')],
        ],
        tables: items.length
          ? [{
              title: 'Items',
              columns: [{ label: 'Description' }, { label: 'Qty', align: 'right' }, { label: 'Amount', align: 'right' }],
              rows,
            }]
          : [],
        totals: [
          { label: 'Subtotal', value: money(data.subtotal ?? data.total, data.currency || 'UGX') },
          { label: 'Tax', value: money(data.tax ?? 0, data.currency || 'UGX') },
          { label: 'Total', value: money(data.total, data.currency || 'UGX') },
          { label: 'Amount due', value: money(data.outstanding ?? data.total, data.currency || 'UGX'), strong: true },
        ],
        note: data.notes ? String(data.notes) : undefined,
      },
      template: 'invoice_created',
    }
  },

  'invoice.paid': ({ companyName, data }) => ({
    subject: `Payment received for invoice ${s(data.invoiceNumber, '')}`,
    html:
      p(`Dear ${s(data.customerName, 'customer')},`) +
      p(`We have received your payment of <strong>${money(data.amount, data.currency || 'UGX')}</strong> against invoice <strong>${s(data.invoiceNumber)}</strong>. Thank you.`) +
      table(row('Invoice', s(data.invoiceNumber)) + row('Amount paid', money(data.amount, data.currency || 'UGX')) + row('Balance', money(data.balance ?? 0, data.currency || 'UGX'))),
    text: `Payment of ${money(data.amount, data.currency || 'UGX')} received for invoice ${data.invoiceNumber}. Thank you.`,
    document: {
      kind: 'receipt',
      eyebrow: 'Payment receipt',
      title: 'Official Receipt',
      subtitle: `Invoice ${s(data.invoiceNumber, '')} · ${s(companyName)}`,
      status: 'Paid',
      status_tone: 'pass',
      filename: `receipt-${s(data.invoiceNumber, 'receipt')}.pdf`,
      parties: [
        { label: 'Received by', lines: [String(companyName || '')] },
        { label: 'Received from', lines: [String(data.customerName || '')] },
      ],
      meta: [['Invoice', String(data.invoiceNumber || '')], ['Date', new Date().toISOString().slice(0, 10)]],
      totals: [
        { label: 'Amount paid', value: money(data.amount, data.currency || 'UGX'), strong: true },
        { label: 'Outstanding balance', value: money(data.balance ?? 0, data.currency || 'UGX') },
      ],
      note: `Thank you for your business. Issued by ${companyName}.`,
    },
    template: 'invoice_paid',
  }),

  'invoice.reminder': ({ companyName, data }) => ({
    subject: `Reminder: invoice ${s(data.invoiceNumber, '')} is due ${s(data.dueDate)}`,
    html:
      p(`Dear ${s(data.customerName, 'customer')},`) +
      p(`This is a friendly reminder that invoice <strong>${s(data.invoiceNumber)}</strong> for <strong>${money(data.outstanding, data.currency || 'UGX')}</strong> is due on <strong>${s(data.dueDate)}</strong>.`) +
      table(row('Amount due', `<strong>${money(data.outstanding, data.currency || 'UGX')}</strong>`) + row('Due date', s(data.dueDate))),
    text: `Reminder: invoice ${data.invoiceNumber} for ${money(data.outstanding, data.currency || 'UGX')} is due ${data.dueDate}.`,
    document: {
      kind: 'invoice',
      title: 'Payment Reminder',
      subtitle: `Invoice ${s(data.invoiceNumber, '')}`,
      meta: [['Billed to', String(data.customerName || '')], ['Due date', String(data.dueDate || '')]],
      totals: [{ label: 'Amount due', value: money(data.outstanding, data.currency || 'UGX'), strong: true }],
      note: 'Please settle this invoice to avoid service interruption.',
    },
    template: 'invoice_reminder',
  }),

  'invoice.overdue': ({ companyName, data }) => ({
    subject: `Overdue: invoice ${s(data.invoiceNumber, '')}`,
    html:
      p(`Dear ${s(data.customerName, 'customer')},`) +
      p(`Invoice <strong>${s(data.invoiceNumber)}</strong> for <strong>${money(data.outstanding, data.currency || 'UGX')}</strong> was due on <strong>${s(data.dueDate)}</strong> and is now overdue by <strong>${s(data.daysOverdue)} day(s)</strong>.`) +
      p('Please arrange payment at your earliest convenience.'),
    text: `Overdue: invoice ${data.invoiceNumber} for ${money(data.outstanding, data.currency || 'UGX')} was due ${data.dueDate}.`,
    template: 'invoice_overdue',
  }),

  'payment.received': ({ companyName, data }) => ({
    subject: `Payment received — ${money(data.amount, data.currency || 'UGX')}`,
    html:
      p(`We received a payment for <strong>${s(companyName)}</strong>.`) +
      table(row('Amount', `<strong>${money(data.amount, data.currency || 'UGX')}</strong>`) + (data.reference ? row('Reference', s(data.reference)) : '') + (data.purpose ? row('Purpose', s(data.purpose)) : '')),
    text: `Payment of ${money(data.amount, data.currency || 'UGX')} received${data.purpose ? ` for ${data.purpose}` : ''}.`,
    template: 'payment_received',
  }),

  'payroll.paid': ({ companyName, data }) => ({
    subject: `Your payslip for ${s(data.period, 'this period')}`,
    html:
      p(`Hello ${s(data.employeeName)},`) +
      p(`Your salary for <strong>${s(data.period)}</strong> has been processed and paid.`) +
      table(row('Gross pay', money(data.gross, data.currency || 'UGX')) + row('Deductions', money(data.deductions, data.currency || 'UGX')) + row('Net pay', `<strong>${money(data.net, data.currency || 'UGX')}</strong>`)),
    text: `Your salary for ${data.period} has been paid. Net pay: ${money(data.net, data.currency || 'UGX')}. Payslip attached.`,
    document: {
      kind: 'payslip',
      eyebrow: 'Payroll',
      title: 'Payslip',
      subtitle: `${s(data.period)} · ${s(companyName)}`,
      status: 'Paid',
      status_tone: 'pass',
      filename: `payslip-${s(data.period, 'period')}.pdf`,
      parties: [
        { label: 'Employer', lines: [String(companyName || '')] },
        { label: 'Employee', lines: [String(data.employeeName || '')] },
      ],
      meta: [['Period', String(data.period || '')], ['Pay date', String(data.payDate || new Date().toISOString().slice(0, 10))]],
      tables: [{
        columns: [{ label: 'Earnings & deductions' }, { label: 'Amount', align: 'right' }],
        rows: [
          ['Basic / gross', money(data.gross, data.currency || 'UGX')],
          ['Deductions (PAYE, NSSF, …)', money(data.deductions, data.currency || 'UGX')],
          [{ text: 'Net pay', strong: true }, { text: money(data.net, data.currency || 'UGX'), strong: true }],
        ],
      }],
      totals: [{ label: 'Net pay', value: money(data.net, data.currency || 'UGX'), strong: true }],
      note: 'This payslip is issued electronically by the employer.',
    },
    template: 'payroll_paid',
  }),

  'dividend.declared': ({ companyName, data }) => ({
    subject: `Dividend declared — ${money(data.amount, data.currency || 'UGX')}`,
    html:
      p(`Hello ${s(data.employeeName || data.memberName)},`) +
      p(`A dividend of <strong>${money(data.amount, data.currency || 'UGX')}</strong> has been declared for you by <strong>${s(companyName)}</strong>.`) +
      table(row('Declared amount', `<strong>${money(data.amount, data.currency || 'UGX')}</strong>`) + (data.payoutDate ? row('Payout date', s(data.payoutDate)) : '')),
    text: `A dividend of ${money(data.amount, data.currency || 'UGX')} has been declared for you.`,
    document: {
      kind: 'dividend_advice',
      eyebrow: 'Shareholder distribution',
      title: 'Dividend Advice Note',
      subtitle: `${s(data.employeeName || data.memberName)} · ${s(companyName)}`,
      meta: [['Beneficiary', String(data.employeeName || data.memberName || '')], ['Company', companyName], ['Date', new Date().toISOString().slice(0, 10)]],
      totals: [{ label: 'Dividend declared', value: money(data.amount, data.currency || 'UGX'), strong: true }],
    },
    template: 'dividend_declared',
  }),

  'sales.order': ({ companyName, data }) => ({
    subject: `Order ${s(data.orderNumber, '')} confirmed`,
    html:
      p(`Dear ${s(data.customerName, 'customer')},`) +
      p(`Thank you for your order <strong>${s(data.orderNumber)}</strong>. Total: <strong>${money(data.total, data.currency || 'UGX')}</strong>.`),
    text: `Order ${data.orderNumber} confirmed. Total ${money(data.total, data.currency || 'UGX')}.`,
    document: {
      kind: 'sales_receipt',
      eyebrow: 'Sales',
      title: 'Sales Receipt',
      subtitle: `Order ${s(data.orderNumber, '')} · ${s(companyName)}`,
      status: 'Paid',
      status_tone: 'pass',
      filename: `receipt-${s(data.orderNumber, 'order')}.pdf`,
      parties: [
        { label: 'Seller', lines: [String(companyName || '')] },
        { label: 'Customer', lines: [String(data.customerName || '')] },
      ],
      meta: [['Order no.', String(data.orderNumber || '')], ['Date', new Date().toISOString().slice(0, 10)]],
      totals: [{ label: 'Total paid', value: money(data.total, data.currency || 'UGX'), strong: true }],
      note: 'Thank you for your business. This receipt confirms your payment.',
    },
    template: 'sales_order',
  }),

  'leave.requested': ({ companyName, data }) => ({
    subject: `Leave request from ${s(data.employeeName)}`,
    html:
      p(`${s(data.employeeName)} has requested leave.`) +
      table(row('Type', s(data.leaveType)) + row('From', s(data.startDate)) + row('To', s(data.endDate)) + row('Days', s(data.days))),
    text: `${data.employeeName} requested ${data.leaveType} leave from ${data.startDate} to ${data.endDate}.`,
    template: 'leave_requested',
  }),

  'leave.decided': ({ companyName, data }) => ({
    subject: `Your leave request was ${s(data.status)}`,
    html:
      p(`Hello ${s(data.employeeName)},`) +
      p(`Your leave request for <strong>${s(data.startDate)}</strong> to <strong>${s(data.endDate)}</strong> has been <strong>${s(data.status)}</strong>.`),
    text: `Your leave request (${data.startDate} to ${data.endDate}) was ${data.status}.`,
    template: 'leave_decided',
  }),

  'helpdesk.ticket': ({ companyName, data }) => ({
    subject: `Support ticket ${s(data.reference, '')}: ${s(data.subject, '')}`,
    html:
      p(`A new support ticket has been opened for ${s(companyName)}.`) +
      table(row('Reference', s(data.reference)) + row('Subject', s(data.subject)) + row('Priority', s(data.priority, 'normal'))),
    text: `New support ticket ${data.reference}: ${data.subject}.`,
    template: 'helpdesk_ticket',
  }),

  'student.enrolled': ({ companyName, data }) => ({
    subject: `Enrolment confirmed for ${s(data.studentName)}`,
    html:
      p(`Hello ${s(data.guardianName || data.studentName)},`) +
      p(`<strong>${s(data.studentName)}</strong> has been enrolled at <strong>${s(companyName)}</strong>.`) +
      table(row('Student no.', s(data.studentNo)) + row('Programme', s(data.programme))),
    text: `${data.studentName} has been enrolled at ${companyName}.`,
    template: 'student_enrolled',
  }),

  'license.expiring': ({ companyName, data }) => ({
    subject: `Your ${s(companyName)} licence expires in ${s(data.daysLeft)} day(s)`,
    html:
      p(`Your licence for <strong>${s(companyName)}</strong> expires on <strong>${s(data.expiresAt)}</strong>.`) +
      p('Renew to keep every module active. You can cancel at any time.'),
    text: `Your licence for ${companyName} expires in ${data.daysLeft} day(s) on ${data.expiresAt}.`,
    template: 'license_expiring',
  }),

  'tax.filing': ({ companyName, data }) => {
    const returnName = String(data.returnName || (data.returnType === 'paye' ? 'PAYE Return (DT2008)' : 'Income Tax Return (DT20002)'))
    const period = String(data.period || '')
    const tin = String(data.tin || '')
    const tax = money(data.taxPayable, 'UGX')
    const validation = data.validationOk ? 'Passed validation' : 'Needs attention'
    return {
      subject: `${returnName} for ${s(period)} — ready to file`,
      html:
        p(`Hello,`) +
        p(`The <strong>${s(returnName)}</strong> for <strong>${s(companyName)}</strong> covering <strong>${s(period)}</strong> has been prepared and validated by Jackisa Office.`) +
        table(
          row('TIN', s(tin)) +
          row('Period', s(period)) +
          (data.chargeableIncome !== undefined ? row('Chargeable income', money(data.chargeableIncome, 'UGX')) : '') +
          (data.grossSalary !== undefined ? row('Gross payroll', money(data.grossSalary, 'UGX')) : '') +
          row('Tax payable', `<strong>${tax}</strong>`) +
          row('Validation', s(validation)),
        ) +
        p('The completed URA workbook is attached. Upload it at ura.go.ug under e-Returns.') +
        (data.dueDate ? p(`Filing deadline: <strong>${s(data.dueDate)}</strong>.`) : ''),
      text: `${returnName} for ${companyName} (${period}) is ready. Tax payable ${tax}. ${validation}. The URA workbook is attached.`,
      document: {
        kind: 'tax_return',
        eyebrow: 'Tax filing',
        title: returnName,
        subtitle: `${s(companyName)} · ${s(period)}`,
        status: data.validationOk ? 'Ready' : 'Draft',
        status_tone: data.validationOk ? 'pass' : 'due',
        filename: `ura-${data.returnType === 'paye' ? 'paye' : 'income-tax'}-${s(period, 'return').replace(/\s+/g, '-')}.xlsx`,
        meta: [
          ['Taxpayer', String(companyName || '')],
          ['TIN', tin],
          ['Period', period],
          ['Return', returnName],
          ...(data.dueDate ? [['Due date', String(data.dueDate)] as [string, string]] : []),
        ],
        tables: [{
          title: 'Summary',
          columns: [{ label: 'Item' }, { label: 'Amount', align: 'right' }],
          rows: [
            ...(data.chargeableIncome !== undefined ? [['Chargeable income', money(data.chargeableIncome, 'UGX')]] : []),
            ...(data.grossSalary !== undefined ? [['Gross payroll', money(data.grossSalary, 'UGX')]] : []),
            ...(data.employees !== undefined ? [['Employees', String(data.employees)]] : []),
            [{ text: 'Tax payable', strong: true }, { text: tax, strong: true }],
          ],
        }],
        note: data.validationOk
          ? 'Validated against URA return checks. Upload the attached workbook at ura.go.ug.'
          : 'Some checks need attention — review the attached workbook before filing.',
      },
      template: 'tax_filing',
    }
  },
}

/** Build a message for an event, falling back to a safe generic template. */
export function buildTemplate(event: string, companyName: string, data: Record<string, any>): TemplateOutput {
  const builder = builders[event]
  if (builder) return builder({ companyName, data })
  const title = String(data.title || 'Notification')
  const body = String(data.message || data.body || 'You have a new notification.')
  return {
    subject: title,
    html: p(escapeHtml(body)),
    text: body,
    template: 'generic',
  }
}

export function knownEvent(event: string): boolean {
  return Object.prototype.hasOwnProperty.call(builders, event)
}

export type { NotifyEvent }
