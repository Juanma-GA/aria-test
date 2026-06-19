import { REPORT_STYLES, escapeHtml, formatEur, slugify } from './reportShared';
import { computeUCRoiTableData } from './pocRoi';
import { computeAuditReportData } from './auditReportData';
import { apiUrl } from './utils';

const AXIS_LABELS: Record<string, string> = {
  axis1_InfoClassification: 'Info Classification',
  axis2_ProcessSovereignty: 'Process Sovereignty',
  axis3_ToolSovereignty: 'Tool Sovereignty',
  axis4_DataSovereignty: 'Data Sovereignty',
  axis5_Infrastructure: 'Infrastructure',
};

function renderUCRoiTable(ucs: any[], process: any): string {
  if (!ucs.length) return '<p style="color: var(--muted);">No use cases.</p>';

  const ucsWithProcess = ucs.map((uc: any) => ({ ...uc, process }));
  const ucData = computeUCRoiTableData(ucsWithProcess, '', process);
  const ucTables = ucData
    .map((d) => {
      if (d.status === 'no_process') {
        return `
    <div class="uc-roi-block uc-roi-block--${d.isRef ? 'ref' : 'inst'}">
      <h4 class="uc-roi-title"><span class="uc-type-${d.isRef ? 'ref' : 'inst'}">${d.type}</span>: ${escapeHtml(d.cuId)} – ${escapeHtml(d.description)}</h4>
      <p style="color: var(--muted); margin-top: 8px;">Process not available.</p>
    </div>
      `;
      }
      if (d.status === 'no_steps') {
        return `
    <div class="uc-roi-block uc-roi-block--${d.isRef ? 'ref' : 'inst'}">
      <h4 class="uc-roi-title"><span class="uc-type-${d.isRef ? 'ref' : 'inst'}">${d.type}</span>: ${escapeHtml(d.cuId)} – ${escapeHtml(d.description)}</h4>
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
      <h4 class="uc-roi-title"><span class="uc-type-${d.isRef ? 'ref' : 'inst'}">${d.type}</span>: ${escapeHtml(d.cuId)} – ${escapeHtml(d.description)}</h4>
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

  return ucTables;
}

export function generateAuditReportHtml(
  audit: any,
  data: ReturnType<typeof computeAuditReportData>,
  processes: any[],
  useCases: any[],
  enrichedPocs: any[],
  pocRois: any[],
): { html: string; filename: string } {
  const filename = `audit-report-${slugify(audit.name)}-${new Date().toISOString().slice(0, 10)}.html`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Audit Report — ${escapeHtml(audit.name)}</title>
  <style>${REPORT_STYLES}</style>
</head>
<body>
  <div class="report-container">
    <div class="report-header">
      <h1>Audit Report</h1>
      <div class="audit-meta">
        <strong>Audit:</strong> ${escapeHtml(audit.name)} |
        Deterministic data report |
        <strong>Generated:</strong> ${new Date().toLocaleString('de-DE')}
      </div>
    </div>

    <h2 class="section-title">1 - Project Fact Sheet</h2>
    <div class="fact-grid">
      <div class="fact-card"><span class="fact-label">Client</span><span class="fact-value">${escapeHtml(audit.client || '—')}</span></div>
      <div class="fact-card"><span class="fact-label">Sector</span><span class="fact-value">${escapeHtml(audit.sector || '—')}</span></div>
      <div class="fact-card"><span class="fact-label">Project</span><span class="fact-value">${escapeHtml(audit.project || '—')}</span></div>
      <div class="fact-card"><span class="fact-label">Audit period</span><span class="fact-value">${audit.startDate ? new Date(audit.startDate).toLocaleDateString('en-GB') : '—'} → ${audit.targetEndDate ? new Date(audit.targetEndDate).toLocaleDateString('en-GB') : '—'}</span></div>
      <div class="fact-card"><span class="fact-label">Processes audited</span><span class="fact-value">${data.processCount}</span></div>
      <div class="fact-card"><span class="fact-label">People impacted</span><span class="fact-value">${data.totalPeople}</span></div>
      <div class="fact-card"><span class="fact-label">Total annual hours in scope</span><span class="fact-value">${Math.round(data.totalAnnualHours).toLocaleString('de-DE')}h</span></div>
      <div class="fact-card"><span class="fact-label">Annual labour cost</span><span class="fact-value">${formatEur(data.totalAnnualCostEur)}</span></div>
      <div class="fact-card"><span class="fact-label">Use cases by status</span><span class="fact-value">${data.eligibleUCs.length} eligible · ${data.inPocUCs.length} in-poc · ${data.discardedUCs.length} discarded</span></div>
      <div class="fact-card"><span class="fact-label">POCs</span><span class="fact-value">${enrichedPocs.length}</span></div>
    </div>
    <p class="fact-note">Total annual hours in scope = Σ, per process and activity, of estimatedTimeHours × stepRepetitions × annual repetitions.<br>Annual labour cost = Σ, per profile, of profile hours × stepRepetitions × annual repetitions × hourly rate.</p>

    <h2 class="section-title">2 - Sovereignty Assessment</h2>
    <p><strong>Average index:</strong> ${data.avgSovIndex.toFixed(1)}/5 — Level: ${escapeHtml(data.sovLevelLabel)}</p>
    <p><strong>Use cases requiring Client IT approval:</strong> ${data.ucRequiresClientIT}</p>
    ${(() => {
      const axes = Object.keys(AXIS_LABELS).map((key: string) => {
        const label = AXIS_LABELS[key];
        let g = 0, a = 0, r = 0;
        const amberF: string[] = [];
        const redF: string[] = [];
        for (const p of processes) {
          const ax = p?.b2?.axes?.[key as keyof typeof AXIS_LABELS];
          if (!ax) continue;
          if (ax.status === 'green') g++;
          else if (ax.status === 'amber') { a++; if (ax.findings) amberF.push(ax.findings); }
          else if (ax.status === 'red') { r++; if (ax.findings) redF.push(ax.findings); }
        }
        return { label, g, a, r, amberF, redF };
      });

      const chip = (n: number, cls: string) =>
        `<span class="sov-chip ${n > 0 ? cls : 'zero'}">${n}</span>`;

      const rows = axes.map(ax =>
        `<tr>
          <td class="axis-name">${ax.label}</td>
          <td class="num">${chip(ax.g, 'green')}</td>
          <td class="num">${chip(ax.a, 'amber')}</td>
          <td class="num">${chip(ax.r, 'red')}</td>
        </tr>`).join('');

      const findingsBlocks = axes
        .filter(ax => ax.amberF.length || ax.redF.length)
        .map(ax => {
          const items = [
            ...ax.redF.map(f => `<div class="sov-finding red">${escapeHtml(f)}</div>`),
            ...ax.amberF.map(f => `<div class="sov-finding amber">${escapeHtml(f)}</div>`),
          ].join('');
          return `<div class="sov-findings-axis">${ax.label}</div>${items}`;
        }).join('');

      return `
    <table class="sov-table">
      <thead><tr>
        <th>Axis</th><th class="num">✅ Green</th><th class="num">🟡 Amber</th><th class="num">🔴 Red</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${findingsBlocks ? `<div class="sov-findings"><div class="sov-findings-axis" style="border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:4px">Findings</div>${findingsBlocks}</div>` : ''}`;
    })()}

    <h2 class="section-title">3 - Process Detail</h2>
    ${processes.map((p: any) => {
      const profiles = p?.b1?.profiles ?? [];
      const profilesHtml = profiles.length
        ? profiles.map((pr: any) => `${escapeHtml(pr.role)} (×${pr.count ?? 0}, €${pr.hourlyRateEur ?? 0}/h)`).join('<br>')
        : '—';
      const norms = (p?.applicableNorms ?? []).filter(Boolean);
      const activities = p?.b3?.activities ?? [];
      const annualReps = p?.b3?.annualRepetitions ?? 0;
      const hoursPerRun = activities.reduce((s: number, a: any) => s + (a.estimatedTimeHours ?? 0) * (a.stepRepetitions ?? 1), 0);
      const totalHrsYear = hoursPerRun * annualReps;

      // Activity Map: per activity, one row per profileHour (rowspan in Target Steps and Tools)
      const activityRows = activities.map((a: any) => {
        const phs = a.profileHours ?? [];
        const tools = (a.tools ?? []).filter(Boolean).join(', ') || '—';
        if (!phs.length) return `<tr><td>${escapeHtml(a.name)}</td><td>—</td><td>0</td><td>${escapeHtml(tools)}</td></tr>`;
        return phs.map((ph: any, idx: number) => {
          let row = '<tr>';
          if (idx === 0) row += `<td rowspan="${phs.length}">${escapeHtml(a.name)}</td>`;
          row += `<td>${escapeHtml(ph.role)}</td><td>${ph.hours ?? 0}</td>`;
          if (idx === 0) row += `<td rowspan="${phs.length}">${escapeHtml(tools)}</td>`;
          return row + '</tr>';
        }).join('');
      }).join('');

      // UCs for this process (by processId)
      const procUCs = useCases.filter((uc: any) => String(uc.processId) === String(p._id));
      const roiTablesHtml = procUCs.length ? renderUCRoiTable(procUCs, p) : '<p style="color:var(--muted)">No use cases.</p>';

      return `
      <div class="poc-block">
        <h3>${escapeHtml(p.procId)} — ${escapeHtml(p.name)}</h3>
        <p><strong>Context</strong><br>
        Responsibles: ${escapeHtml(p?.b1?.clientResponsible || '—')} (Client), ${escapeHtml(p?.b1?.technicalDirectorResponsible || '—')} (Tech Director)<br>
        Department: ${escapeHtml(p?.b1?.clientDepartment || p?.department || '—')}<br>
        Profiles:<br>${profilesHtml}<br>
        Applicable Norms: ${norms.length ? escapeHtml(norms.join(', ')) : '—'}</p>
        <p><strong>Process Map</strong><br>
        Repetitions/year: ${annualReps}<br>
        Hours/run: ${Math.round(hoursPerRun)}<br>
        Total hours/year: ${Math.round(totalHrsYear).toLocaleString('de-DE')}</p>
        <table class="roi-table">
          <thead><tr><th>Target Steps</th><th>Profiles</th><th>Current Hours/run</th><th>Tools</th></tr></thead>
          <tbody>${activityRows || '<tr><td colspan="4">—</td></tr>'}</tbody>
        </table>
        <h4 style="font-family:var(--serif);margin-top:16px">Use cases</h4>
        ${roiTablesHtml}
      </div>`;
    }).join('')}

    <h2 class="section-title">4 - ROI & POCs</h2>
    <table class="exec-summary-table">
      <thead><tr>
        <th>POC Name</th><th>Net Annual Saving (€)</th><th>Dev Cost (€)</th><th>Payback Period (months)</th>
      </tr></thead>
      <tbody>
        ${enrichedPocs.map((poc: any, i: number) => {
          const roi = pocRois[i];
          return `<tr><td>${escapeHtml(poc.name || poc.pocId || '—')}</td><td>${roi ? formatEur(roi.net) : '—'}</td><td>${roi ? formatEur(roi.dev) : '—'}</td><td>${roi && roi.net > 0 ? roi.paybackMonths.toFixed(1) + ' months' : '—'}</td></tr>`;
        }).join('')}
        ${(() => {
          const tn = pocRois.reduce((s: number, r: any) => s + (r?.net ?? 0), 0);
          const td = pocRois.reduce((s: number, r: any) => s + (r?.dev ?? 0), 0);
          return enrichedPocs.length > 1 ? `<tr class="total-row"><td>TOTAL</td><td>${formatEur(tn)}</td><td>${formatEur(td)}</td><td>${tn > 0 ? (td / (tn / 12)).toFixed(1) + ' months' : '—'}</td></tr>` : '';
        })()}
      </tbody>
    </table>
    ${(() => {
      const tn = pocRois.reduce((s: number, r: any) => s + (r?.net ?? 0), 0);
      return tn > 0 ? `<p style="font-size:0.8rem;color:var(--muted);margin-top:8px"><em>Note: Payback period calculated as Total Dev Cost ÷ (Total Net Annual Saving ÷ 12).</em></p>` : '';
    })()}

  </div>
</body>
</html>`;

  return { html, filename };
}

export async function downloadAuditReport(auditId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/audits/${auditId}/report-data`), {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch audit report');
  const { html, filename } = await res.json();
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'audit-report.html';
  link.click();
  URL.revokeObjectURL(url);
}
