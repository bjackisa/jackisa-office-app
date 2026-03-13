export interface TerminationReasonItem {
  date?: string | null
  title: string
  detail?: string | null
  points?: number | null
}

export interface TerminationLetterData {
  companyName: string
  companyEmail?: string | null
  companyPhone?: string | null
  companyAddress?: string | null
  companyCityCountry?: string | null
  employeeName: string
  employeeId?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  dateIssued: string
  dateOfTermination: string
  referenceNumber: string
  finalPayDate?: string
  hrContactName?: string | null
  hrContactEmail?: string | null
  signatoryName?: string | null
  signatoryTitle?: string | null
  reasons: TerminationReasonItem[]
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const safe = (value?: string | null, fallback: string | null = 'N/A') => escapeHtml((value || '').trim() || (fallback || 'N/A'))

export const buildTerminationLetterHtml = (data: TerminationLetterData) => {
  const reasonsHtml =
    data.reasons.length > 0
      ? `<ol class="reason-list">${data.reasons
          .map(
            (reason) =>
              `<li><strong>${safe(reason.title)}</strong>${reason.detail ? ` — ${safe(reason.detail)}` : ''}${
                reason.points != null ? ` <em>(${reason.points} pts)</em>` : ''
              }${reason.date ? ` <span class="muted">[${safe(reason.date)}]</span>` : ''}</li>`
          )
          .join('')}</ol>`
      : '<p class="muted">No historical point deductions were found in the database for this employee.</p>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Termination Letter — ${safe(data.companyName)}</title>
  <style>
    :root { --ink:#1a1a2e; --rule:#b08c5a; --paper:#faf8f4; --meta:#6b6b6b; --danger:#8b1a1a; }
    body { background:#e8e4dc; font-family: Georgia, serif; color:var(--ink); padding:2rem 1rem; }
    .toolbar { max-width:800px; margin:0 auto 1rem; text-align:right; }
    .btn { background:var(--ink); color:#fff; border:none; padding:.5rem 1rem; cursor:pointer; }
    .letter-card { background:var(--paper); max-width:800px; margin:0 auto; padding:2.5rem 3rem; box-shadow:0 8px 24px rgba(0,0,0,.15); border-top:4px solid var(--rule); }
    .letterhead { display:flex; justify-content:space-between; gap:1rem; margin-bottom:1rem; }
    .company-name { font-size:1.4rem; font-weight:700; }
    .company-meta { color:var(--meta); font-size:.85rem; line-height:1.5; }
    .stamp { border:1px solid var(--danger); color:var(--danger); padding:.2rem .5rem; height:fit-content; text-transform:uppercase; font-size:.72rem; }
    h1 { text-align:center; color:var(--danger); margin:1.5rem 0; }
    .meta-table { width:100%; border-collapse:collapse; margin-bottom:1.2rem; }
    .meta-table td { padding:.35rem 0; border-bottom:1px solid #dbc7aa; }
    .meta-table td:first-child { width:40%; color:var(--meta); font-size:.8rem; text-transform:uppercase; }
    p { line-height:1.7; }
    .reason-block { border-left:3px solid var(--rule); padding:.6rem 1rem; background:rgba(176,140,90,.06); margin:1rem 0; }
    .reason-list { margin:0; padding-left:1.1rem; }
    .reason-list li { margin:.35rem 0; }
    .muted { color:var(--meta); font-size:.88em; }
    .sig-block { margin-top:2rem; display:grid; grid-template-columns:1fr 1fr; gap:2rem; }
    .sig-line { border-top:1px solid var(--ink); margin-top:2rem; padding-top:.4rem; }
    @media print { .toolbar { display:none } body { background:#fff; padding:0 } .letter-card { box-shadow:none; max-width:100%; margin:0; } }
  </style>
</head>
<body>
  <div class="toolbar"><button class="btn" onclick="window.print()">Print / Save PDF</button></div>
  <div class="letter-card">
    <div class="letterhead">
      <div>
        <div class="company-name">${safe(data.companyName)}</div>
        <div class="company-meta">${safe(data.companyAddress)}<br/>${safe(data.companyCityCountry)}<br/>${safe(data.companyEmail)} | ${safe(data.companyPhone)}</div>
      </div>
      <div class="stamp">Confidential</div>
    </div>
    <h1>Notice of Termination</h1>
    <table class="meta-table">
      <tr><td>Date Issued</td><td>${safe(data.dateIssued)}</td></tr>
      <tr><td>Reference No.</td><td>${safe(data.referenceNumber)}</td></tr>
      <tr><td>Employee Full Name</td><td>${safe(data.employeeName)}</td></tr>
      <tr><td>Employee ID</td><td>${safe(data.employeeId)}</td></tr>
      <tr><td>Position / Title</td><td>${safe(data.employeePosition)}</td></tr>
      <tr><td>Department</td><td>${safe(data.employeeDepartment)}</td></tr>
      <tr><td>Date of Termination</td><td>${safe(data.dateOfTermination)}</td></tr>
    </table>
    <p>Dear ${safe(data.employeeName)},</p>
    <p>This letter serves as formal written notice that your employment with ${safe(data.companyName)} in the capacity of ${safe(data.employeePosition)} is terminated effective ${safe(data.dateOfTermination)}.</p>
    <div class="reason-block">
      <strong>Grounds for Termination (from HR points history)</strong>
      ${reasonsHtml}
    </div>
    <p>Your final remuneration and any outstanding dues will be processed on or before ${safe(data.finalPayDate, data.dateOfTermination)} based on payroll policy and applicable labor requirements.</p>
    <p>For any clarification, contact ${safe(data.hrContactName, 'HR Department')} at ${safe(data.hrContactEmail, data.companyEmail || null)}.</p>
    <div class="sig-block">
      <div><div class="sig-line">${safe(data.signatoryName, 'HR Manager')}<br/><span class="muted">${safe(data.signatoryTitle, 'Human Resources')}</span></div></div>
      <div><div class="sig-line">${safe(data.employeeName)}<br/><span class="muted">Acknowledged by Employee</span></div></div>
    </div>
  </div>
</body>
</html>`
}

export const openTerminationLetterWindow = (data: TerminationLetterData, popupWindow?: Window | null) => {
  const html = buildTerminationLetterHtml(data)
  const popup = popupWindow || window.open('', '_blank', 'noopener,noreferrer')
  if (!popup) {
    throw new Error('Please allow pop-ups to view and print the termination letter.')
  }

  popup.document.open()
  popup.document.write(html)
  popup.document.close()
}
