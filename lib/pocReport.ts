import { computePocRoi } from './pocRoi';
import { apiUrl } from './utils';

/** Escape HTML special characters safely */
function escapeHtml(text: string | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Format number as EUR with de-DE locale */
function formatEur(n: number): string {
  return `€${Math.round(n).toLocaleString('de-DE')}`;
}

/** Create URL-safe slug from text */
function slugify(text: string): string {
  return (text || 'report')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** Generate self-contained HTML report for multiple POCs */
export function generatePocReportHtml(pocs: any[], auditName: string): { html: string; filename: string } {
  const auditSlug = slugify(auditName);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `poc-report-${auditSlug}-${dateStr}.html`;

  // Calculate ROI by POC and store results
  const pocRois = pocs.map(poc => {
    const assignedUCs = [poc.useCase, ...(poc.instances ?? [])].filter(Boolean);
    const process = typeof poc.processId === 'object' ? poc.processId : null;
    return process && assignedUCs.length > 0 ? computePocRoi(assignedUCs, process) : null;
  });

  // Build Executive Summary rows using cached pocRois
  const execSummaryRows = pocs
    .map((poc, i) => {
      const roi = pocRois[i];
      return `
    <tr>
      <td><a href="#poc-${i + 1}">${escapeHtml(poc.name || '—')}</a></td>
      <td>${roi ? formatEur(roi.net) : '—'}</td>
      <td>${roi ? formatEur(roi.dev) : '—'}</td>
      <td>${roi && roi.net > 0 ? roi.paybackMonths.toFixed(1) : '—'} months</td>
    </tr>
  `;
    })
    .join('');

  // Calculate total by summing all POC-level ROI
  const totalNet = pocRois.reduce((sum, r) => sum + (r?.net ?? 0), 0);
  const totalDev = pocRois.reduce((sum, r) => sum + (r?.dev ?? 0), 0);
  const totalPaybackMonths = totalNet > 0 ? totalDev / (totalNet / 12) : 0;

  const pocDetailsHtml = pocs
    .map((poc, idx) => generatePocDetailBlock(poc, idx + 1, auditName))
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>POC Report — ${escapeHtml(auditName)}</title>
  <style>
    :root {
      --paper: #faf9f6;
      --surface: #ffffff;
      --surface-2: #f4f2ec;
      --ink: #1c1a16;
      --ink-soft: #46423a;
      --muted: #857f72;
      --faint: #a8a293;
      --line: #e3dfd4;
      --line-soft: #edeae1;
      --accent: #a8742c;
      --accent-2: #c2872f;
      --good: #3c7a5e;
      --bad: #b04f49;
      --neutral: #5b7298;
      --serif: Georgia, 'Times New Roman', serif;
      --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --mono: ui-monospace, 'SF Mono', Consolas, monospace;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--paper);
      font-family: var(--sans);
      font-size: 0.92rem;
      color: var(--ink-soft);
      line-height: 1.6;
    }
    .report-container {
      max-width: 980px;
      margin: 0 auto;
      padding: 40px 24px;
    }
    .report-header {
      margin-bottom: 40px;
      padding-bottom: 24px;
      border-bottom: 3px solid;
      border-image: linear-gradient(to right, var(--accent), var(--accent-2), transparent) 1;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .report-header h1 {
      font-family: var(--serif);
      font-size: 2.2rem;
      font-weight: 400;
      font-style: italic;
      color: var(--ink);
      margin: 0;
    }
    .audit-meta {
      font-family: var(--mono);
      font-size: 0.68rem;
      color: var(--faint);
      text-align: right;
      line-height: 1.5;
    }
    details {
      margin: 0;
      padding: 0;
      border: none;
      background: none;
    }
    summary {
      cursor: pointer;
      user-select: none;
      list-style: none;
    }
    summary::-webkit-details-marker {
      display: none;
    }
    summary h2 {
      margin: 32px 0 20px 0;
      display: inline;
    }
    .poc-block {
      page-break-after: always;
      margin-bottom: 48px;
      padding-bottom: 32px;
    }
    details:not(:last-child) {
      border-bottom: 1px solid var(--line);
    }
    h2 {
      font-family: var(--serif);
      font-size: 1.85rem;
      font-weight: 400;
      margin: 32px 0 20px 0;
      color: var(--ink);
      border-top: 1px solid var(--line);
      padding-top: 16px;
    }
    h2.section-title {
      border-top: none;
      padding-top: 0;
      margin-top: 0;
    }
    h3 {
      font-family: var(--serif);
      font-size: 1.12rem;
      font-weight: 400;
      margin: 20px 0 12px 0;
      color: var(--ink-soft);
    }
    .exec-summary-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 0.82rem;
    }
    .exec-summary-table th {
      font-family: var(--sans);
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--faint);
      font-weight: 400;
      padding: 12px 8px;
      text-align: left;
      border-bottom: 1px solid var(--line-soft);
      background: none;
    }
    .exec-summary-table td {
      font-family: var(--mono);
      padding: 10px 8px;
      color: var(--ink-soft);
      border-bottom: 1px solid var(--line-soft);
    }
    .exec-summary-table tr.total-row {
      font-weight: bold;
      background: var(--surface-2);
    }
    .roi-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 0.82rem;
    }
    .roi-table th {
      font-family: var(--sans);
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--faint);
      font-weight: 400;
      padding: 12px 8px;
      text-align: left;
      border-bottom: 1px solid var(--line-soft);
      background: none;
    }
    .roi-table td {
      font-family: var(--mono);
      padding: 10px 8px;
      color: var(--ink-soft);
      border-bottom: 1px solid var(--line-soft);
    }
    .badge {
      display: inline-block;
      font-family: var(--mono);
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      padding: 4px 8px;
      border-radius: 0;
      background: var(--surface-2);
      color: var(--ink-soft);
    }
    .badge-ref {
      color: var(--accent);
      background: transparent;
    }
    .badge-inst {
      color: var(--muted);
      background: transparent;
    }
    .b2-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      padding: 12px 0;
      border-bottom: 1px solid var(--line-soft);
      align-items: start;
    }
    .b2-axis {
      font-family: var(--serif);
      font-weight: 500;
      color: var(--ink);
    }
    .b2-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0;
      font-size: 0.85rem;
      font-weight: 400;
      background: none;
      border-left: 3px solid transparent;
      padding-left: 8px;
    }
    .b2-status::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .b2-status.green {
      color: var(--good);
      border-left-color: var(--good);
      background: none;
    }
    .b2-status.green::before { background: var(--good); }
    .b2-status.amber {
      color: var(--accent-2);
      border-left-color: var(--accent-2);
      background: none;
    }
    .b2-status.amber::before { background: var(--accent-2); }
    .b2-status.red {
      color: var(--bad);
      border-left-color: var(--bad);
      background: none;
    }
    .b2-status.red::before { background: var(--bad); }
    .mockups-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    .mockups-table th {
      font-family: var(--sans);
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--faint);
      font-weight: 400;
      padding: 12px 8px;
      text-align: left;
      border-bottom: 1px solid var(--line-soft);
      background: none;
    }
    .mockups-table td {
      font-family: var(--mono);
      padding: 10px 8px;
      color: var(--ink-soft);
      border-bottom: 1px solid var(--line-soft);
    }
    .mockups-table button {
      transition: background 0.2s;
    }
    .mockups-table button:hover {
      background: var(--accent-2) !important;
    }
    p { margin: 12px 0; color: var(--ink-soft); }
    code { background: none; color: var(--accent); font-family: var(--mono); font-size: 0.85rem; padding: 0; }
    @media print {
      body { background: white; }
      .report-container { padding: 20px; }
      .poc-block { page-break-after: always; }
      h2 { page-break-before: avoid; }
      .mockups-table button { display: none; }
      .mockups-table tbody tr td:last-child { display: none; }
      .mockups-table thead tr th:last-child { display: none; }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="report-header">
      <h1>POC Report</h1>
      <div class="audit-meta">
        <strong>Audit:</strong> ${escapeHtml(auditName)} |
        <strong>POCs:</strong> ${pocs.length} |
        <strong>Generated:</strong> ${new Date().toLocaleString('de-DE')}
      </div>
    </div>

    <h2 class="section-title">1 - Executive Summary</h2>
    <table class="exec-summary-table">
      <thead>
        <tr>
          <th>POC Name</th>
          <th>Net Annual Saving (€)</th>
          <th>Dev Cost (€)</th>
          <th>Payback Period (months)</th>
        </tr>
      </thead>
      <tbody>
        ${execSummaryRows}
        ${pocs.length > 1 ? `
        <tr class="total-row">
          <td colspan="1">TOTAL</td>
          <td>${formatEur(totalNet)}</td>
          <td>${formatEur(totalDev)}</td>
          <td>${totalPaybackMonths > 0 ? totalPaybackMonths.toFixed(1) : '—'}</td>
        </tr>
        ` : ''}
      </tbody>
    </table>
    ${totalNet > 0 ? `<p style="font-size: 0.8rem; color: var(--muted); margin-top: 8px;"><em>Note: Payback period calculated as Total Dev Cost ÷ (Total Net Annual Saving ÷ 12).</em></p>` : ''}

    <h2 class="section-title">2 - POC Details</h2>
${pocDetailsHtml}

  </div>
  <script>
    function openMockup(id) {
      var el = document.getElementById(id);
      if (!el) return;
      var b64 = el.getAttribute('data-html-b64');
      if (!b64) return;
      var html = decodeURIComponent(escape(atob(b64)));
      var w = window.open('', '_blank');
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
      }
    }
  </script>
</body>
</html>`;

  return { html, filename };
}

export async function downloadPocReport(
  auditId: string,
  auditName: string,
  options?: { archived?: boolean },
): Promise<void> {
  const res = await fetch(
    apiUrl(
      `/api/pocs?auditId=${auditId}&include=mockups${options?.archived ? '&archived=true' : ''}`,
    ),
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error('Failed to fetch POCs with mockups');
  const pocsWithMockups = await res.json();
  const { html, filename } = generatePocReportHtml(pocsWithMockups, auditName);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function generatePocDetailBlock(poc: any, num: number, auditName: string): string {
  const assignedUCs = [poc.useCase, ...(poc.instances ?? [])].filter(Boolean);
  const process = typeof poc.processId === 'object' ? poc.processId : null;
  const roi = process && assignedUCs.length > 0 ? computePocRoi(assignedUCs, process) : null;

  return `
    <details class="poc-block" id="poc-${num}">
      <summary><h2>2.${num} ${escapeHtml(poc.pocId || `POC ${num}`)} — ${escapeHtml(poc.name || 'Untitled')}</h2></summary>
      ${generateMockupBlock(poc, num)}
      ${generateScopeBlock(poc)}
      ${roi ? generateRoiTableBlock(roi, assignedUCs, auditName) : '<p style="color: #6b7280;">ROI data unavailable.</p>'}
      ${generateSovereigntyBlock(poc)}
    </details>
  `;
}

function generateRoiTableBlock(roi: any, assignedUCs: any[], auditName: string): string {
  if (!assignedUCs.length) return '';

  return `
    <h3>ROI Estimation</h3>
    <table class="roi-table">
      <thead>
        <tr>
          <th>Use Case ID</th>
          <th>Description</th>
          <th>Type</th>
          <th>Audit</th>
          <th>Impl. Time (weeks)</th>
          <th>Net (€/yr)</th>
          <th>Dev (€)</th>
        </tr>
      </thead>
      <tbody>
        ${roi.breakdown.map((item: any, idx: number) => {
          const uc = assignedUCs[idx];
          const isRef = !uc.isInstance;
          const type = isRef ? 'Reference' : 'Instance';
          const audit = isRef ? auditName : (uc.audit?.name ?? '—');
          return `
        <tr>
          <td><code>${escapeHtml(item.cuId)}</code></td>
          <td>${escapeHtml(uc.description ?? '—')}</td>
          <td><span class="badge ${isRef ? 'badge-ref' : 'badge-inst'}">${type}</span></td>
          <td>${escapeHtml(audit)}</td>
          <td>${isRef ? (uc.estimatedImplWeeks ?? '—') : 0}</td>
          <td>${formatEur(item.net)}</td>
          <td>${formatEur(item.dev)} <small>${escapeHtml(item.devLabel)}</small></td>
        </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function generateMockupBlock(poc: any, pocNum: number): string {
  const mockups = poc.mockups ?? [];
  if (!mockups.length) return '';

  const mockupDivs: string[] = [];
  const mockupRows = mockups.map((m: any, idx: number) => {
    const uploadedDate = m.uploadedAt ? new Date(m.uploadedAt).toLocaleDateString('de-DE') : '—';
    const mockupId = `mockup-${pocNum}-${idx}`;
    const b64 = Buffer.from(m.html, 'utf-8').toString('base64');
    mockupDivs.push(`<div id="${mockupId}" data-html-b64="${b64}" style="display:none;"></div>`);

    return `
      <tr>
        <td>${escapeHtml(m.name)}</td>
        <td>${uploadedDate}</td>
        <td>
          <button
            onclick="openMockup('${mockupId}')"
            style="padding: 4px 8px; background: #a8742c; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.85rem;"
          >
            Open mockup
          </button>
        </td>
      </tr>
    `;
  }).join('\n');

  return `
    <h3>Mockups</h3>
    <table class="mockups-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Uploaded</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${mockupRows}
      </tbody>
    </table>
    ${mockupDivs.join('\n')}
  `;
}

function generateScopeBlock(poc: any): string {
  if (!poc.design?.scopeDescription) return '';
  return `
    <h3>Scope</h3>
    <p>${escapeHtml(poc.design.scopeDescription)}</p>
  `;
}

function generateSovereigntyBlock(poc: any): string {
  if (!poc.design?.activeB2Restrictions) return '';

  const restrictions = poc.design.activeB2Restrictions;
  const lines = restrictions.split('\n').filter((l: string) => l.trim());

  let sovereigntyHeader = '';
  const matrices: any[] = [];

  lines.forEach((line: string, idx: number) => {
    if (idx === 0 && !line.includes('|')) {
      sovereigntyHeader = line;
    } else if (line.includes('|')) {
      const parts = line.split('|').map((p: string) => p.trim());
      if (parts.length >= 3) {
        matrices.push({ axis: parts[0], status: parts[1].toLowerCase(), findings: parts[2] });
      }
    }
  });

  if (!sovereigntyHeader && matrices.length === 0) return '';

  return `
    <h3>Sovereignty Matrix</h3>
    ${sovereigntyHeader ? `<p><strong>${escapeHtml(sovereigntyHeader)}</strong></p>` : ''}
    ${matrices.length > 0 ? `
    <table class="roi-table">
      <thead>
        <tr>
          <th>Axis</th>
          <th>Status</th>
          <th>Findings</th>
        </tr>
      </thead>
      <tbody>
        ${matrices.map((m: any) => `
        <tr>
          <td>${escapeHtml(m.axis)}</td>
          <td><span class="b2-status ${m.status}">${m.status.toUpperCase()}</span></td>
          <td>${escapeHtml(m.findings)}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
  `;
}
