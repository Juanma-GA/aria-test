import { computePocRoi, computeUCRoiTableData } from './pocRoi';
import { apiUrl } from './utils';
import { REPORT_STYLES, escapeHtml, formatEur, slugify } from './reportShared';

/** Shared mockup-viewer script for both report types */
const MOCKUP_SCRIPT = `
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
`;

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
  <style>${REPORT_STYLES}</style>
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
          <td>${totalPaybackMonths > 0 ? totalPaybackMonths.toFixed(1) + ' months' : '—'}</td>
        </tr>
        ` : ''}
      </tbody>
    </table>
    ${totalNet > 0 ? `<p style="font-size: 0.8rem; color: var(--muted); margin-top: 8px;"><em>Note: Payback period calculated as Total Dev Cost ÷ (Total Net Annual Saving ÷ 12).</em></p>` : ''}

    <h2 class="section-title">2 - POC Details</h2>
${pocDetailsHtml}

  </div>
  <script>${MOCKUP_SCRIPT}</script>
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

/** Generate self-contained HTML report for a single POC */
function generateIndividualPocReportHtml(poc: any, auditName: string): { html: string; filename: string } {
  const auditSlug = slugify(auditName);
  const pocSlug = slugify(poc.name || 'poc');
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `poc-report-${auditSlug}-${pocSlug}-${dateStr}.html`;

  const assignedUCs = [poc.useCase, ...(poc.instances ?? [])].filter(Boolean);
  const process = typeof poc.processId === 'object' ? poc.processId : null;
  const roi = process && assignedUCs.length > 0 ? computePocRoi(assignedUCs, process) : null;

  const execSummaryRow = `
    <tr>
      <td>${escapeHtml(poc.name || '—')}</td>
      <td>${roi ? formatEur(roi.net) : '—'}</td>
      <td>${roi ? formatEur(roi.dev) : '—'}</td>
      <td>${roi && roi.net > 0 ? roi.paybackMonths.toFixed(1) : '—'} months</td>
    </tr>
  `;

  const pocDetailHtml = generatePocDetailBlock(poc, 1, auditName, { individual: true });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>POC Report — ${escapeHtml(poc.name || 'POC')} — ${escapeHtml(auditName)}</title>
  <style>${REPORT_STYLES}</style>
</head>
<body>
  <div class="report-container">
    <div class="report-header">
      <h1>POC Report</h1>
      <div class="audit-meta">
        <strong>Audit:</strong> ${escapeHtml(auditName)} |
        <strong>POC:</strong> ${escapeHtml(poc.name || '—')} |
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
        ${execSummaryRow}
      </tbody>
    </table>

    <h2 class="section-title">2 - POC Details</h2>
${pocDetailHtml}

  </div>
  <script>${MOCKUP_SCRIPT}</script>
</body>
</html>`;

  return { html, filename };
}

/** Fetch a single POC (with mockups) and trigger a client-side HTML download */
export async function downloadIndividualPocReport(
  auditId: string,
  pocId: string,
  pocName: string,
  auditName: string,
): Promise<void> {
  const res = await fetch(
    apiUrl(`/api/pocs?auditId=${auditId}&include=mockups`),
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error('Failed to fetch POC with mockups');
  const pocsWithMockups = await res.json();
  const poc = pocsWithMockups.find((p: any) => String(p._id) === String(pocId));
  if (!poc) throw new Error('POC not found');
  const { html, filename } = generateIndividualPocReportHtml(poc, auditName);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function generatePocDetailBlock(poc: any, num: number, auditName: string, opts?: { individual?: boolean }): string {
  const assignedUCs = [poc.useCase, ...(poc.instances ?? [])].filter(Boolean);
  const process = typeof poc.processId === 'object' ? poc.processId : null;
  const roi = process && assignedUCs.length > 0 ? computePocRoi(assignedUCs, process) : null;

  const individual = opts?.individual ?? false;
  const body = `
      ${generateMockupBlock(poc, num)}
      ${generateScopeBlock(poc, num, opts)}
      ${generateSovereigntyBlock(poc, num, opts)}
      ${roi ? generateRoiTableBlock(roi, assignedUCs, auditName, num, process, opts) : '<p style="color: #6b7280;">ROI data unavailable.</p>'}
  `;

  if (individual) {
    return `
    <div class="poc-block" id="poc-${num}">
      ${body}
    </div>
  `;
  }

  return `
    <details class="poc-block" id="poc-${num}" open>
      <summary><h2 class="poc-title">2.${num} ${escapeHtml(poc.name || 'Untitled')}</h2></summary>
      ${body}
    </details>
  `;
}

function generateRoiTableBlock(roi: any, assignedUCs: any[], auditName: string, num: number, pocProcess: any, opts?: { individual?: boolean }): string {
  if (!assignedUCs.length) return '';

  const ucData = computeUCRoiTableData(assignedUCs, auditName, pocProcess);
  const ucTables = ucData
    .map((d) => {
      if (d.status === 'no_process') {
        return `
    <div class="uc-roi-block uc-roi-block--${d.isRef ? 'ref' : 'inst'}">
      <h4 class="uc-roi-title"><span class="uc-type-${d.isRef ? 'ref' : 'inst'}">${d.type}</span>: ${escapeHtml(d.cuId)} – ${escapeHtml(d.description)} from ${escapeHtml(d.auditName)}</h4>
      <p style="color: var(--muted); margin-top: 8px;">Process not available.</p>
    </div>
      `;
      }
      if (d.status === 'no_steps') {
        return `
    <div class="uc-roi-block uc-roi-block--${d.isRef ? 'ref' : 'inst'}">
      <h4 class="uc-roi-title"><span class="uc-type-${d.isRef ? 'ref' : 'inst'}">${d.type}</span>: ${escapeHtml(d.cuId)} – ${escapeHtml(d.description)} from ${escapeHtml(d.auditName)}</h4>
      <p style="color: var(--muted); margin-top: 8px;">No target steps defined.</p>
    </div>
      `;
      }
      const totalRows = d.rows.length;
      const rowsHtml = d.rows
        .map((row, idx) => {
          let html = '<tr>';
          if (idx === 0) html += `<td rowspan="${totalRows}">${escapeHtml(d.procName)}</td>`;
          html += `
      <td>${escapeHtml(row.step)}</td>
      <td>${escapeHtml(row.profile)}</td>
      <td>${row.current}</td>
      <td>${row.saved}</td>`;
          if (idx === 0) html += `<td rowspan="${totalRows}">${d.implWeeks}</td>`;
          html += '</tr>';
          return html;
        })
        .join('');
      return `
    <div class="uc-roi-block uc-roi-block--${d.isRef ? 'ref' : 'inst'}">
      <h4 class="uc-roi-title"><span class="uc-type-${d.isRef ? 'ref' : 'inst'}">${d.type}</span>: ${escapeHtml(d.cuId)} – ${escapeHtml(d.description)} from ${escapeHtml(d.auditName)}</h4>
      <table class="roi-table" style="margin-top: 12px;">
        <thead>
          <tr>
            <th>Process</th>
            <th>Target Steps</th>
            <th>Profiles</th>
            <th>Current Hours/run</th>
            <th>Saved Hours/run</th>
            <th>Impl. Time (weeks)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
    `;
    })
    .join('');

  const headingNumber = opts?.individual ? '2.3' : `2.${num}.3`;
  return `
    <h3>${headingNumber} ROI Estimation Breakdown per Use Case</h3>
    ${ucTables}
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

function generateScopeBlock(poc: any, num: number, opts?: { individual?: boolean }): string {
  if (!poc.design?.scopeDescription) return '';
  const headingNumber = opts?.individual ? '2.1' : `2.${num}.1`;
  return `
    <h3>${headingNumber} Scope</h3>
    <p>${escapeHtml(poc.design.scopeDescription)}</p>
  `;
}

function generateSovereigntyBlock(poc: any, num: number, opts?: { individual?: boolean }): string {
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

  const headingNumber = opts?.individual ? '2.2' : `2.${num}.2`;
  return `
    <h3>${headingNumber} Sovereignty Matrix</h3>
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
