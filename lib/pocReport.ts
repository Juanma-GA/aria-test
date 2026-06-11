import { computePocRoi } from './pocRoi';

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

function getDecisionBgColor(type: string): string {
  const colors: Record<string, string> = {
    green: '#dcfce7',
    teal: '#ccfbf1',
    amber: '#fef3c7',
    red: '#fee2e2',
    slate: '#f1f5f9'
  };
  return colors[type] || '#f3f4f6';
}

function getDecisionTextColor(type: string): string {
  const colors: Record<string, string> = {
    green: '#166534',
    teal: '#0d5f5f',
    amber: '#a16207',
    red: '#991b1b',
    slate: '#475569'
  };
  return colors[type] || '#374151';
}

/** Generate self-contained HTML report for multiple POCs */
export function generatePocReportHtml(pocs: any[], auditName: string): { html: string; filename: string } {
  const auditSlug = slugify(auditName);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `poc-report-${auditSlug}-${dateStr}.html`;

  const pocSections = pocs
    .map((poc, idx) => generatePocSection(poc, idx + 1))
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
    .nav-toc {
      background: var(--surface-2);
      padding: 16px 20px;
      margin-bottom: 32px;
      border-left: 3px solid var(--accent);
    }
    .nav-toc strong {
      display: block;
      margin-bottom: 12px;
      font-family: var(--mono);
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: var(--muted);
    }
    .nav-toc a {
      display: block;
      margin-bottom: 6px;
      font-family: var(--mono);
      font-size: 0.8rem;
      color: var(--accent);
      text-decoration: none;
    }
    .nav-toc a:last-child { margin-bottom: 0; }
    .nav-toc a:hover { color: var(--accent-2); }
    .poc-block {
      page-break-after: always;
      margin-bottom: 48px;
      padding-bottom: 32px;
    }
    .poc-block:not(:last-child) {
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
      counter-increment: poc-counter;
    }
    h2::before {
      content: '§ ' counter(poc-counter);
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--accent-2);
      margin-right: 12px;
      letter-spacing: 0.08em;
    }
    h3 {
      font-family: var(--serif);
      font-size: 1.12rem;
      font-weight: 400;
      margin: 20px 0 12px 0;
      color: var(--ink-soft);
    }
    h4 {
      font-family: var(--mono);
      font-size: 0.66rem;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: var(--muted);
      margin: 16px 0 8px 0;
    }
    .poc-header-badges {
      margin-bottom: 16px;
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    details {
      margin: 20px 0;
      padding: 0;
      background: none;
      border: none;
    }
    summary {
      cursor: pointer;
      font-family: var(--serif);
      font-size: 1rem;
      font-weight: 500;
      color: var(--ink-soft);
      padding: 12px 0;
      user-select: none;
      border-bottom: 1px solid var(--line-soft);
    }
    summary:hover { color: var(--accent); }
    details[open] summary { border-bottom-color: var(--line); }
    details[open] > :not(summary) {
      padding-top: 12px;
    }
    .roi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0;
      margin: 20px 0;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }
    .roi-card {
      padding: 16px;
      border: none;
      border-right: 1px solid var(--line-soft);
      border-top: 2px solid transparent;
      background: none;
    }
    .roi-card:last-child { border-right: none; }
    .roi-card.green { border-top-color: var(--good); }
    .roi-card.amber { border-top-color: var(--accent-2); }
    .roi-card.red { border-top-color: var(--bad); }
    .roi-card.slate { border-top-color: var(--neutral); }
    .roi-label {
      font-family: var(--mono);
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .roi-value {
      font-family: var(--serif);
      font-size: 1.9rem;
      font-weight: 400;
      color: var(--ink);
      margin-bottom: 4px;
    }
    .roi-formula {
      font-family: var(--mono);
      font-size: 0.68rem;
      color: var(--muted);
      margin-top: 8px;
      line-height: 1.4;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 0.82rem;
    }
    th {
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
    td {
      font-family: var(--mono);
      padding: 10px 8px;
      color: var(--ink-soft);
      border-bottom: 1px solid var(--line-soft);
    }
    tr:hover { background: none; }
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
    .badge-phase {
      color: var(--neutral);
      background: transparent;
    }
    .badge-decision-green {
      color: var(--good);
      background: transparent;
    }
    .badge-decision-teal {
      color: var(--accent-2);
      background: transparent;
    }
    .badge-decision-amber {
      color: var(--accent-2);
      background: transparent;
    }
    .badge-decision-red {
      color: var(--bad);
      background: transparent;
    }
    .badge-decision-slate {
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
    .criteria-list {
      list-style: none;
      margin: 12px 0;
    }
    .criteria-list li {
      padding: 6px 0;
      color: var(--ink-soft);
    }
    .criteria-done::before {
      content: '✓ ';
      color: var(--good);
      font-weight: bold;
      margin-right: 6px;
    }
    .criteria-pending::before {
      content: '○ ';
      color: var(--accent-2);
      font-weight: bold;
      margin-right: 6px;
    }
    .milestone-item {
      margin: 12px 0;
      padding: 0;
      background: none;
    }
    .milestone-bar {
      height: 4px;
      background: var(--line-soft);
      overflow: hidden;
      margin: 6px 0;
    }
    .milestone-progress {
      height: 100%;
      background: var(--accent);
    }
    p {
      margin: 12px 0;
      color: var(--ink-soft);
    }
    code {
      background: none;
      color: var(--accent);
      font-family: var(--mono);
      font-size: 0.85rem;
      padding: 0;
    }
    pre {
      background: var(--surface-2);
      color: var(--ink);
      font-family: var(--mono);
      font-size: 0.8rem;
      padding: 12px;
      border-left: 3px solid var(--accent);
      overflow-x: auto;
    }
    @media print {
      body { background: white; }
      .report-container { padding: 20px; }
      .nav-toc { display: none; }
      .poc-block { page-break-after: always; }
      details { display: block; }
      summary { display: none; }
      details > * { display: block !important; }
      h2 { page-break-before: avoid; }
    }
  </style>
</head>
<body>
  <div class="report-container" style="counter-reset: poc-counter;">
    <div class="report-header">
      <h1>POC Report</h1>
      <div class="audit-meta">
        <strong>Audit:</strong> ${escapeHtml(auditName)} |
        <strong>POCs:</strong> ${pocs.length} |
        <strong>Generated:</strong> ${new Date().toLocaleString('de-DE')}
      </div>
    </div>

    <div class="nav-toc">
      <strong>POCs:</strong>
      ${pocs.map((p, i) => {
        const id = escapeHtml(p.pocId || `POC ${i + 1}`);
        const label = p.name ? `${id} — ${escapeHtml(p.name)}` : id;
        return `<a href="#poc-${i + 1}">${label}</a>`;
      }).join('')}
    </div>

${pocSections}

  </div>
</body>
</html>`;

  return { html, filename };
}

function generatePocSection(poc: any, pocNum: number): string {
  const assignedUCs = [poc.useCase, ...(poc.instances ?? [])].filter(Boolean);
  const process = typeof poc.processId === 'object' ? poc.processId : null;
  const roi = process && assignedUCs.length > 0 ? computePocRoi(assignedUCs, process) : null;

  const phaseLabel = ({
    design: 'Design',
    execution: 'Execution',
    evaluation: 'Evaluation',
    decision: 'Decision',
    closed: 'Closed'
  } as Record<string, string>)[poc.phase] || 'Unknown';

  const decisionBadgeColor = ({
    go: 'green',
    go_conditional: 'teal',
    no_go_redesign: 'amber',
    no_go_discard: 'red',
    paused: 'slate',
    pending: 'slate'
  } as Record<string, string>)[poc.decision?.decision] || 'slate';

  const decisionLabel = ({
    go: 'GO',
    go_conditional: 'GO Conditional',
    no_go_redesign: 'No-Go – Redesign',
    no_go_discard: 'No-Go – Discard',
    paused: 'Paused',
    pending: 'Pending'
  } as Record<string, string>)[poc.decision?.decision] || 'Pending';

  return `
    <div class="poc-block" id="poc-${pocNum}">
      <h2>${escapeHtml(poc.pocId || `POC ${pocNum}`)} — ${escapeHtml(poc.name || 'Untitled')}</h2>
      <div class="poc-header-badges">
        <span class="badge badge-phase">Phase: ${phaseLabel}</span>
        <span class="badge badge-decision-${decisionBadgeColor}">${decisionLabel}</span>
      </div>

      ${generateAssignedUcsSection(assignedUCs, poc.audit?.name)}
      ${generateRoiSection(roi, assignedUCs, process)}
      ${generateDesignSection(poc)}
      ${generateExecutionSection(poc)}
      ${generateEvaluationSection(poc)}
      ${generateDecisionSection(poc)}
    </div>
  `;
}

function generateAssignedUcsSection(assignedUCs: any[], pocAuditName?: string): string {
  if (!assignedUCs.length) return '';

  const hasAudit = assignedUCs.some(u => u.audit);
  const rows = assignedUCs.map((uc, idx) => `
    <tr>
      <td><code>${escapeHtml(uc.cuId || '—')}</code></td>
      <td>${escapeHtml(uc.description || '—')}</td>
      <td>
        ${idx === 0
          ? '<span class="badge badge-ref">Reference</span>'
          : '<span class="badge badge-inst">Instance</span>'
        }
      </td>
      ${hasAudit ? `<td>${idx === 0
        ? escapeHtml(pocAuditName ?? '—')
        : escapeHtml(uc.audit?.name ?? '—')}</td>` : ''}
    </tr>
  `).join('');

  return `
    <details open>
      <summary>Assigned Use Cases</summary>
      <table>
        <thead>
          <tr>
            <th>Use Case ID</th>
            <th>Description</th>
            <th>Type</th>
            ${hasAudit ? '<th>Audit</th>' : ''}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </details>
  `;
}

function generateRoiSection(roi: any, assignedUCs: any[], process: any): string {
  if (!process) {
    return `
      <details open>
        <summary>ROI Estimate</summary>
        <p style="color: #6b7280;">ROI data unavailable (process not populated).</p>
      </details>
    `;
  }

  if (!roi || !roi.hasData) {
    return `
      <details open>
        <summary>ROI Estimate</summary>
        <p style="color: #6b7280;">No ROI data available.</p>
      </details>
    `;
  }

  const cards = `
    <div class="roi-card green">
      <div class="roi-label">Gross Annual Saving</div>
      <div class="roi-value">${formatEur(roi.gross)}/yr</div>
    </div>
    ${roi.compute > 0 ? `
    <div class="roi-card amber">
      <div class="roi-label">Compute Cost/yr</div>
      <div class="roi-value">${formatEur(roi.compute)}/yr</div>
    </div>
    ` : ''}
    <div class="roi-card green">
      <div class="roi-label">Net Annual Saving</div>
      <div class="roi-value">${formatEur(roi.net)}/yr</div>
    </div>
    ${roi.dev > 0 ? `
    <div class="roi-card red">
      <div class="roi-label">Dev Cost (one-time)</div>
      <div class="roi-value">${formatEur(roi.dev)}</div>
    </div>
    ` : ''}
    ${roi.paybackMonths > 0 ? `
    <div class="roi-card slate">
      <div class="roi-label">Payback Period</div>
      <div class="roi-value">${roi.paybackMonths.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} months</div>
      <div class="roi-formula">${escapeHtml(roi.paybackFormula)}</div>
    </div>
    ` : ''}
  `;

  const breakdown = assignedUCs.length > 1 ? `
    <h3>Breakdown by Use Case</h3>
    <table>
      <thead>
        <tr>
          <th>Use Case</th>
          <th>Gross</th>
          <th>Compute</th>
          <th>Net</th>
          <th>Dev</th>
        </tr>
      </thead>
      <tbody>
        ${roi.breakdown.map((item: any) => `
        <tr>
          <td><code>${escapeHtml(item.cuId)}</code></td>
          <td>${formatEur(item.gross)}</td>
          <td>${formatEur(item.compute)}</td>
          <td>${formatEur(item.net)}</td>
          <td>${formatEur(item.dev)} <small>${escapeHtml(item.devLabel)}</small></td>
        </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '';

  return `
    <details open>
      <summary>ROI Estimate</summary>
      <div class="roi-grid">${cards}</div>
      ${breakdown}
    </details>
  `;
}

function generateDesignSection(poc: any): string {
  const design = poc.design || {};

  let devCostHtml = '';
  if (design.estimatedDevCostEur !== undefined) {
    devCostHtml = `
      <h3>Dev Cost Estimation</h3>
      <p><strong>€${(design.estimatedDevCostEur ?? 0).toLocaleString('de-DE')}</strong></p>
      <ul style="margin-left: 20px;">
        <li>Impl. Time: ${design.estimatedImplWeeks ?? 0} weeks</li>
        <li>Nº Developers: ${design.nDevs ?? 1}</li>
        <li>Developer Rate: €${design.devRateEur ?? 450}/day</li>
      </ul>
    `;
  }

  let computeCostHtml = '';
  const pocComputeBreakdown = poc.computeBreakdown || {};
  if (pocComputeBreakdown.computedAnnualEur) {
    let details = '';
    if (pocComputeBreakdown.mode?.includes('cloud') || pocComputeBreakdown.mode === 'hybrid') {
      details += `<li>Cloud API Model: ${escapeHtml(pocComputeBreakdown.modelNameSnapshot || '—')}</li>`;
    }
    if (pocComputeBreakdown.mode?.includes('on_premise') || pocComputeBreakdown.mode === 'hybrid') {
      details += `<li>On-premise GPU: ${escapeHtml(pocComputeBreakdown.gpuNameSnapshot || '—')}</li>`;
    }
    computeCostHtml = `
      <h3>Annual Recurring Compute Cost</h3>
      <p><strong>€${(pocComputeBreakdown.computedAnnualEur ?? 0).toLocaleString('de-DE')}/yr</strong></p>
      <ul style="margin-left: 20px;">${details}</ul>
    `;
  }

  let sovereigntyHtml = '';
  if (design.activeB2Restrictions) {
    const lines = design.activeB2Restrictions.split('\n').filter((l: string) => l.trim());
    let sovereigntyHeader = '';
    let matrices: any[] = [];

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

    if (sovereigntyHeader || matrices.length > 0) {
      sovereigntyHtml = `
        <h3>Sovereignty Matrix (B2)</h3>
        ${sovereigntyHeader ? `<p><strong>${escapeHtml(sovereigntyHeader)}</strong></p>` : ''}
        ${matrices.length > 0 ? `<div style="margin: 10px 0;">
          ${matrices.map((m: any) => `<div class="b2-row">
            <div class="b2-axis">${escapeHtml(m.axis)}</div>
            <div class="b2-status ${m.status}">${m.status.toUpperCase()}</div>
            <div>${escapeHtml(m.findings)}</div>
          </div>`).join('')}
        </div>` : ''}
      `;
    }
  }

  let criteriaHtml = '';
  if (design.successCriteria && design.successCriteria.length > 0) {
    criteriaHtml = `
      <h3>Success Criteria</h3>
      <table>
        <thead>
          <tr><th>Criterion</th><th>Threshold</th><th>Result</th><th>Passed</th></tr>
        </thead>
        <tbody>
          ${design.successCriteria.map((c: any) => `<tr>
            <td>${escapeHtml(c.criterion || '—')}</td>
            <td>${escapeHtml(c.successThreshold || '—')}</td>
            <td>${escapeHtml(c.actualResult || '—')}</td>
            <td>${c.passed !== undefined ? (c.passed ? '✅' : '❌') : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  return `
    <details open>
      <summary>Design</summary>
      ${design.scopeDescription ? `<h3>Scope</h3><p>${escapeHtml(design.scopeDescription)}</p>` : ''}
      ${design.measurableObjective ? `<h3>Measurable Objective</h3><p>${escapeHtml(design.measurableObjective)}</p>` : ''}
      ${design.startDate || design.deadlineDate ? `<h3>Timeline</h3><p><strong>Start:</strong> ${design.startDate ? new Date(design.startDate).toLocaleDateString('de-DE') : '—'} | <strong>Deadline:</strong> ${design.deadlineDate ? new Date(design.deadlineDate).toLocaleDateString('de-DE') : '—'}</p>` : ''}
      ${devCostHtml}
      ${computeCostHtml}
      ${design.requiredResources ? `<h3>Required Resources</h3><p>${escapeHtml(design.requiredResources)}</p>` : ''}
      ${sovereigntyHtml}
      ${criteriaHtml}
    </details>
  `;
}

function generateExecutionSection(poc: any): string {
  const execution = poc.execution || {};
  const milestones = execution.milestones || [];

  let milestonesHtml = '';
  if (milestones.length > 0) {
    const done = milestones.filter((m: any) => (m.progressPct ?? 0) >= 100).length;
    milestonesHtml = `
      <h3>Milestones (${done}/${milestones.length} done)</h3>
      ${milestones.map((m: any) => {
        const dueDate = m.dueDate ? new Date(m.dueDate).toLocaleDateString('de-DE') : '—';
        const pct = m.progressPct ?? 0;
        return `<div class="milestone-item">
          <strong>${escapeHtml(m.name || '—')}</strong>
          <div style="font-size: 0.85em; color: #6b7280; margin-top: 2px;">
            Due: ${dueDate} | Effort: ${m.effortHours || 0}h | Progress: ${pct}%
          </div>
          ${m.notes ? `<div style="font-size: 0.85em; margin-top: 4px; color: #475569;"><strong>Notes:</strong> ${escapeHtml(m.notes)}</div>` : ''}
          <div class="milestone-bar">
            <div class="milestone-progress" style="width: ${pct}%;"></div>
          </div>
        </div>`;
      }).join('')}
    `;
  }

  return `
    <details>
      <summary>Execution</summary>
      ${milestonesHtml || '<p style="color: #6b7280;">No milestones defined.</p>'}
      ${execution.incidents ? `<h3>Incidents</h3><p>${escapeHtml(execution.incidents)}</p>` : ''}
      ${execution.planDeviations ? `<h3>Plan Deviations</h3><p>${escapeHtml(execution.planDeviations)}</p>` : ''}
    </details>
  `;
}

function generateEvaluationSection(poc: any): string {
  const evaluation = poc.evaluation || {};
  return `
    <details>
      <summary>Evaluation</summary>
      ${evaluation.estimatedProductionImpact ? `<h3>Production Impact</h3><p>${escapeHtml(evaluation.estimatedProductionImpact)}</p>` : ''}
      ${evaluation.technicalLessons ? `<h3>Technical Lessons</h3><p>${escapeHtml(evaluation.technicalLessons)}</p>` : ''}
      ${evaluation.organisationalLessons ? `<h3>Organisational Lessons</h3><p>${escapeHtml(evaluation.organisationalLessons)}</p>` : ''}
      ${evaluation.actualCostEur !== undefined ? `<h3>Actual Cost</h3><p>€${(evaluation.actualCostEur ?? 0).toLocaleString('de-DE')}</p>` : ''}
      ${!evaluation.estimatedProductionImpact && !evaluation.technicalLessons && !evaluation.organisationalLessons ? '<p style="color: #6b7280;">No evaluation data.</p>' : ''}
    </details>
  `;
}

function generateDecisionSection(poc: any): string {
  const decision = poc.decision || {};
  return `
    <details>
      <summary>Decision</summary>
      ${decision.decision && decision.decision !== 'pending' ? `<h3>Decision</h3><p><strong>${escapeHtml(decision.decision.replace(/_/g, ' ').toUpperCase())}</strong></p>` : ''}
      ${decision.justification ? `<h3>Justification</h3><p>${escapeHtml(decision.justification)}</p>` : ''}
      ${decision.nextSteps ? `<h3>Next Steps</h3><p>${escapeHtml(decision.nextSteps)}</p>` : ''}
      ${decision.decidedAt ? `<p style="font-size: 0.85em; color: #6b7280;"><strong>Decided:</strong> ${new Date(decision.decidedAt).toLocaleDateString('de-DE')}</p>` : ''}
      ${!decision.decision || decision.decision === 'pending' ? '<p style="color: #6b7280;">No decision recorded.</p>' : ''}
    </details>
  `;
}
