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
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: #f9fafb;
      padding: 20px;
    }
    .report-container { max-width: 1000px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .report-header { border-bottom: 2px solid #0ea5e9; padding-bottom: 20px; margin-bottom: 30px; }
    h1 { font-size: 2.2em; margin-bottom: 8px; color: #111; }
    .audit-meta { color: #6b7280; font-size: 0.95em; }
    .nav-toc { background: #f3f4f6; padding: 15px; border-radius: 6px; margin-bottom: 30px; }
    .nav-toc strong { display: block; margin-bottom: 10px; color: #374151; }
    .nav-toc a { display: inline-block; margin-right: 12px; color: #0ea5e9; text-decoration: none; font-size: 0.9em; }
    .nav-toc a:hover { text-decoration: underline; }

    .poc-block { page-break-after: always; margin-bottom: 40px; padding-bottom: 30px; border-bottom: 1px solid #e5e7eb; }
    .poc-block:last-child { border-bottom: none; }

    h2 { font-size: 1.6em; margin: 25px 0 15px 0; color: #111; border-left: 4px solid #0ea5e9; padding-left: 12px; }
    h3 { font-size: 1.1em; margin: 18px 0 10px 0; color: #374151; }

    .poc-header-badges { margin-bottom: 15px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

    details { margin: 15px 0; padding: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; }
    summary { cursor: pointer; font-weight: 600; color: #1f2937; padding: 8px; user-select: none; }
    summary:hover { color: #0ea5e9; }
    details[open] { background: #f0fdfa; border-color: #0ea5e9; }

    .roi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 15px 0; }
    .roi-card { padding: 12px; border-radius: 6px; border: 1px solid #e5e7eb; }
    .roi-card.green { background: #f0fdf4; border-color: #dcfce7; }
    .roi-card.amber { background: #fffbeb; border-color: #fef3c7; }
    .roi-card.red { background: #fef2f2; border-color: #fee2e2; }
    .roi-card.slate { background: #f8fafc; border-color: #e2e8f0; }
    .roi-label { font-size: 0.75em; text-transform: uppercase; color: #6b7280; font-weight: 600; margin-bottom: 4px; }
    .roi-value { font-size: 1.4em; font-weight: 700; }
    .roi-card.green .roi-value { color: #16a34a; }
    .roi-card.amber .roi-value { color: #d97706; }
    .roi-card.red .roi-value { color: #dc2626; }
    .roi-card.slate .roi-value { color: #475569; }
    .roi-formula { font-size: 0.75em; color: #6b7280; margin-top: 6px; font-family: monospace; }

    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.95em; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f3f4f6; font-weight: 600; color: #374151; }
    tr:hover { background: #fafafa; }

    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; font-weight: 600; }
    .badge-ref { background: #dbeafe; color: #0369a1; }
    .badge-inst { background: #f1f5f9; color: #475569; }

    .b2-row { display: grid; grid-template-columns: 150px 80px 1fr; gap: 10px; padding: 8px; border-bottom: 1px solid #e5e7eb; align-items: start; }
    .b2-axis { font-weight: 600; }
    .b2-status { padding: 2px 6px; border-radius: 3px; text-align: center; font-size: 0.85em; font-weight: 600; }
    .b2-status.green { background: #dcfce7; color: #166534; }
    .b2-status.amber { background: #fef3c7; color: #a16207; }
    .b2-status.red { background: #fee2e2; color: #991b1b; }

    .criteria-list { list-style: none; margin: 10px 0; }
    .criteria-list li { padding: 6px 0; }
    .criteria-done::before { content: '✓ '; color: #16a34a; font-weight: bold; margin-right: 6px; }
    .criteria-pending::before { content: '○ '; color: #d97706; font-weight: bold; margin-right: 6px; }

    .milestone-item { margin: 10px 0; padding: 8px; background: #fafafa; border-radius: 4px; }
    .milestone-bar { height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; margin: 4px 0; }
    .milestone-progress { height: 100%; background: #0ea5e9; }

    p { margin: 10px 0; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 0.9em; }
    pre { background: #f9fafb; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 0.85em; }

    @media print {
      body { background: white; padding: 0; }
      .report-container { box-shadow: none; padding: 20px; }
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
  <div class="report-container">
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
      ${pocs.map((p, i) => `<a href="#poc-${i + 1}">${escapeHtml(p.pocId || `POC ${i + 1}`)}</a>`).join('')}
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
        <span class="badge" style="background: #dbeafe; color: #0369a1;">Phase: ${phaseLabel}</span>
        <span class="badge" style="background: ${getDecisionBgColor(decisionBadgeColor)}; color: ${getDecisionTextColor(decisionBadgeColor)};">${decisionLabel}</span>
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
