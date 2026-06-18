'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, ArrowLeft, Download, FileText, ClipboardCopy, Globe, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { apiUrl } from '@/lib/utils';
import { PocListTable, type GlobalPOC } from '@/components/pocs/PocListTable';
import { downloadPocReport } from '@/lib/pocReport';


export default function POCsPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pocs, setPocs] = useState<GlobalPOC[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);
  const [auditName, setAuditName] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(
      apiUrl(`/api/pocs?auditId=${auditId}${showArchived ? '&archived=true' : ''}`),
      { credentials: 'include' },
    )
      .then(r => r.json())
      .then(data => {
        setPocs(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [auditId, showArchived]);

  useEffect(() => {
    fetch(apiUrl(`/api/audits/${auditId}`), { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setAuditName(data.name || data.clientName || auditId))
      .catch(() => {});
  }, [auditId]);

  const generatePocTrackerReport = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    let md = `# POC Tracker Report — ${auditName || auditId}\n\n`;
    md += `**Generated:** ${dateStr} ${timeStr}  \n`;
    md += `**Total POCs:** ${pocs.length}\n\n`;
    md += `---\n\n`;

    pocs.forEach((poc) => {
      md += `## ${poc.pocId}${poc.name ? ` — ${poc.name}` : ''}\n\n`;
      md += `**Phase:** ${poc.phase}\n`;
      const processName = (poc.processId as any)?.name || '—';
      const ucId = poc.useCase?.cuId ?? '—';
      const ucDesc = poc.useCase?.description ?? '—';
      md += `**Process:** ${processName}\n`;
      md += `**Use Case:** ${ucId} · ${ucDesc}\n\n`;

      // Design Phase
      md += `### 1. Design\n\n`;
      md += `**POC Name**  \n${poc.name || '—'}\n\n`;
      md += `**Measurable Objective**  \n${poc.design?.measurableObjective || '—'}\n\n`;
      md += `**Scope**  \n${poc.design?.scopeDescription || '—'}\n\n`;

      const startDate = poc.design?.startDate
        ? new Date(poc.design.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';
      const deadline = poc.design?.deadlineDate
        ? new Date(poc.design.deadlineDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';

      md += `**Start:** ${startDate} · **Deadline:** ${deadline}\n\n`;

      md += `**Dev Cost Estimation:** €${(poc.design?.estimatedDevCostEur ?? 0).toLocaleString('de-DE')}\n`;
      md += `- Impl. Time: ${poc.design?.estimatedImplWeeks ?? 0} weeks\n`;
      md += `- Nº Developers: ${poc.design?.nDevs ?? 1}\n`;
      md += `- Developer Rate: €${poc.design?.devRateEur ?? 450}/day\n\n`;

      if (poc.computeBreakdown?.computedAnnualEur) {
        md += `**Annual recurring compute cost:** €${poc.computeBreakdown.computedAnnualEur.toLocaleString('de-DE')}\n`;
        if (poc.computeBreakdown.mode?.includes('cloud') || poc.computeBreakdown.mode === 'hybrid') {
          md += `- Cloud API Model: ${poc.computeBreakdown.modelNameSnapshot || '—'}\n`;
        }
        if (poc.computeBreakdown.mode?.includes('on_premise') || poc.computeBreakdown.mode === 'hybrid') {
          md += `- On-premise GPU: ${poc.computeBreakdown.gpuNameSnapshot || '—'}\n`;
        }
        md += `\n`;
      }

      md += `**Required Resources**  \n${poc.design?.requiredResources || '—'}\n\n`;

      md += `**Sovereignty Matrix (B2)**  \n${poc.design?.activeB2Restrictions || '—'}\n\n`;

      // Success Criteria List
      if (poc.design?.successCriteria && poc.design.successCriteria.length > 0) {
        md += `**Success Criteria**\n\n`;
        poc.design.successCriteria.forEach((c, i) => {
          md += `${i + 1}. **${c.criterion || '—'}**\n`;
          md += `   - Threshold: ${c.successThreshold || '—'}\n`;
          md += `   - Result: ${c.actualResult || '—'}\n`;
          md += `   - Passed: ${c.passed !== undefined ? (c.passed ? '✅' : '❌') : '—'}\n\n`;
        });
      }

      // Execution Phase
      md += `### 2. Execution\n\n`;
      const milestones = poc.execution?.milestones ?? [];

      if (milestones.length > 0) {
        md += `**Milestones**\n\n`;
        milestones.forEach((m) => {
          const dueDate = m.dueDate ? new Date(m.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';
          md += `1. **${m.name || '—'}**\n`;
          md += `   - Due: ${dueDate}\n`;
          md += `   - Effort: ${m.effortHours || 0}h\n`;
          md += `   - Progress: ${m.progressPct ?? 0}%\n`;
          if (m.notes) md += `   - Notes: ${m.notes}\n`;
          md += `\n`;
        });
      }

      md += `**Incidents:** ${poc.execution?.incidents || '—'}  \n`;
      md += `**Plan Deviations:** ${poc.execution?.planDeviations || '—'}\n\n`;

      // Evaluation Phase
      if (poc.phase === 'evaluation' || poc.phase === 'decision' || poc.phase === 'closed') {
        md += `### 3. Evaluation\n\n`;
        md += `**Production Impact:** ${poc.evaluation?.estimatedProductionImpact || '—'}  \n`;
        md += `**Technical Lessons:** ${poc.evaluation?.technicalLessons || '—'}  \n`;
        md += `**Organisational Lessons:** ${poc.evaluation?.organisationalLessons || '—'}\n\n`;
      }

      // Decision Phase
      if (poc.phase === 'decision' || poc.phase === 'closed') {
        md += `### 4. Decision\n\n`;
        const decisionMap = {
          go: '✅ GO — Scale to implementation',
          go_conditional: '⚠️ GO Conditional',
          no_go_redesign: '🔄 No-Go — Redesign',
          no_go_discard: '❌ No-Go — Discard',
          paused: '⏸ Paused',
          pending: '⏳ Pending',
        };
        const decisionLabel = decisionMap[poc.decision?.decision as keyof typeof decisionMap] || poc.decision?.decision || 'Pending';
        md += `**Decision:** ${decisionLabel}\n\n`;
        md += `**Justification:** ${poc.decision?.justification || '—'}  \n`;
        md += `**Next Steps:** ${poc.decision?.nextSteps || '—'}\n\n`;
      }

      md += `---\n\n`;
    });

    md += `*Report generated by Aria · ATEXIS*`;
    setReportMarkdown(md);
    setReportOpen(true);
  };

  const mdToHtmlContent = (md: string): string => {
    const lines = md.split('\n');
    let html = '';
    let inUl = false;
    let inOl = false;
    let inTable = false;
    let tableHeader = true;

    const closeList = () => {
      if (inUl) {
        html += '</ul>';
        inUl = false;
      }
      if (inOl) {
        html += '</ol>';
        inOl = false;
      }
    };
    const closeTable = () => {
      if (inTable) {
        html += '</tbody></table>';
        inTable = false;
        tableHeader = true;
      }
    };

    const inline = (s: string) =>
      s
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>');

    for (const line of lines) {
      if (line.startsWith('# ')) {
        closeList();
        closeTable();
        html += `<h1>${inline(line.slice(2))}</h1>`;
      } else if (line.startsWith('## ')) {
        closeList();
        closeTable();
        html += `<h2>${inline(line.slice(3))}</h2>`;
      } else if (line.startsWith('### ')) {
        closeList();
        closeTable();
        html += `<h3>${inline(line.slice(4))}</h3>`;
      } else if (line.startsWith('#### ')) {
        closeList();
        closeTable();
        html += `<h4>${inline(line.slice(5))}</h4>`;
      } else if (line.startsWith('- ')) {
        if (!inUl) {
          closeList();
          html += '<ul>';
          inUl = true;
        }
        html += `<li>${inline(line.slice(2))}</li>`;
      } else if (line.match(/^\d+\. /)) {
        if (!inOl) {
          closeList();
          html += '<ol>';
          inOl = true;
        }
        html += `<li>${inline(line.replace(/^\d+\. /, ''))}</li>`;
      } else if (line.startsWith('| ')) {
        if (!inTable) {
          closeList();
          html += '<table><thead><tr>';
          inTable = true;
          tableHeader = true;
        }
        const cells = line.split('|').slice(1, -1);
        if (tableHeader && cells.every((c) => c.match(/^[-: ]+$/))) {
          html += '</tr></thead><tbody>';
          tableHeader = false;
        } else {
          const tag = tableHeader ? 'th' : 'td';
          html += cells.map((c) => `<${tag}>${inline(c.trim())}</${tag}>`).join('');
          html += `</tr>${tableHeader ? '' : '<tr>'}`;
        }
      } else if (line.startsWith('---')) {
        closeList();
        closeTable();
        html += '<hr>';
      } else if (line.trim()) {
        closeList();
        closeTable();
        html += `<p>${inline(line)}</p>`;
      }
    }
    closeList();
    closeTable();
    return html;
  };

  const downloadReport = () => {
    if (!reportMarkdown) return;
    const blob = new Blob([reportMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `poc-tracker-report-${auditId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyReport = async () => {
    if (!reportMarkdown) return;
    await navigator.clipboard.writeText(reportMarkdown);
    toast.success('Report copied to clipboard');
  };

  const exportHtml = () => {
    if (!reportMarkdown) return;
    const body = mdToHtmlContent(reportMarkdown);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>POC Tracker Report — ${auditId}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:860px;margin:2rem auto;padding:0 1.5rem;color:#1e293b;line-height:1.6}
  h1{font-size:1.75rem;margin-top:2rem;border-bottom:2px solid #6d28d9;padding-bottom:.5rem;color:#3730a3}
  h2{font-size:1.3rem;margin-top:1.5rem;color:#4c1d95}
  h3{font-size:1.1rem;margin-top:1.2rem;color:#5b21b6}
  h4{font-size:1rem;margin-top:1rem}
  p,li{color:#334155}
  code{background:#f3e8ff;color:#6d28d9;padding:2px 5px;border-radius:3px;font-size:.875em}
  table{border-collapse:collapse;width:100%;margin:1rem 0}
  th{background:#6d28d9;color:#fff;padding:.5rem .75rem;text-align:left;font-size:.85rem}
  td{border:1px solid #e2e8f0;padding:.5rem .75rem;font-size:.85rem}
  tr:nth-child(even) td{background:#f8fafc}
  blockquote{border-left:4px solid #a78bfa;margin:1rem 0;padding:.5rem 1rem;background:#faf5ff;color:#5b21b6}
  hr{border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0}
  @media print{body{margin:0}}
</style>
</head>
<body>
${body}
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `poc-tracker-report-${auditId}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    if (!reportMarkdown) return;
    const body = mdToHtmlContent(reportMarkdown);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>POC Tracker Report — ${auditId}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:860px;margin:2rem auto;padding:0 1.5rem;color:#1e293b;line-height:1.6}
  h1{font-size:1.5rem;margin-top:1.5rem;border-bottom:2px solid #6d28d9;padding-bottom:.4rem;color:#3730a3}
  h2{font-size:1.2rem;margin-top:1.2rem;color:#4c1d95}
  h3{font-size:1rem;margin-top:1rem;color:#5b21b6}
  p,li{color:#334155;font-size:.9rem}
  code{background:#f3e8ff;color:#6d28d9;padding:1px 4px;border-radius:3px;font-size:.85em}
  table{border-collapse:collapse;width:100%;margin:.75rem 0}
  th{background:#6d28d9;color:#fff;padding:.4rem .6rem;text-align:left;font-size:.8rem}
  td{border:1px solid #e2e8f0;padding:.4rem .6rem;font-size:.8rem}
  tr:nth-child(even) td{background:#f8fafc}
  blockquote{border-left:4px solid #a78bfa;margin:.75rem 0;padding:.4rem .75rem;background:#faf5ff}
  hr{border:none;border-top:1px solid #e2e8f0;margin:1rem 0}
  @media print{body{margin:0;padding:0 1cm}}
</style>
</head>
<body>
${body}
</body>
</html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 250);
  };

  const handleDownloadHtmlReport = async () => {
    try {
      await downloadPocReport(auditId, auditName, { archived: showArchived });
      toast.success('Report downloaded');
    } catch (err) {
      console.error('Failed to generate report:', err);
      toast.error('Failed to generate report');
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-muted hover:text-text"
          >
            <ArrowLeft size={18} />
          </button>
          <Badge variant="teal">B8</Badge>
          <h1 className="text-xl font-display font-bold text-text">
            POC Tracker
          </h1>
          <span className="text-muted text-sm">— {pocs.length} POCs</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-blue-aria"
            />
            Show archived
          </label>
          <button
            onClick={handleDownloadHtmlReport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-sm hover:bg-purple-700 transition-colors"
          >
            <FileText size={14} /> POC Report
          </button>
          <button
            onClick={() => router.push(`/audits/${auditId}/pocs/new`)}
            className="btn-primary flex items-center gap-1"
          >
            <Plus size={14} /> New POC
          </button>
        </div>
      </div>

      {pocs.length === 0 ? (
        <div className="card p-12 text-center text-muted text-sm">
          No POCs yet. Create a POC from an eligible use case.
        </div>
      ) : (
        <PocListTable
          pocs={pocs}
          showAuditColumn={true}
          highlightAuditId={auditId}
          onRowClick={poc => {
            if (!poc.audit?._id) return;
            router.push(`/audits/${poc.audit._id}/pocs/${poc._id}`);
          }}
        />
      )}

      {/* POC Tracker Report Modal */}
      <Modal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        title={`POC Tracker Report — ${auditId}`}
        size="xl"
      >
        {reportMarkdown ? (
          <div>
            <div className="flex flex-wrap justify-end gap-2 mb-4">
              <button
                onClick={copyReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-sm text-muted hover:text-text hover:border-text transition-colors"
              >
                <ClipboardCopy size={14} /> Copy MD
              </button>
              <button
                onClick={downloadReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-sm text-muted hover:text-text hover:border-text transition-colors"
              >
                <Download size={14} /> Download .md
              </button>
              <button
                onClick={exportHtml}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-sm text-muted hover:text-text hover:border-text transition-colors"
              >
                <Globe size={14} /> Export HTML
              </button>
              <button
                onClick={exportPdf}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-sm hover:bg-purple-700 transition-colors"
              >
                <Printer size={14} /> Export PDF
              </button>
            </div>
            <div className="prose prose-sm max-w-none prose-headings:text-text prose-headings:font-semibold prose-h2:text-base prose-h3:text-sm prose-p:text-muted prose-li:text-muted prose-strong:text-text prose-code:text-purple-700 prose-code:bg-purple-50 prose-code:px-1 prose-code:rounded">
              <ReactMarkdown>{reportMarkdown}</ReactMarkdown>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
