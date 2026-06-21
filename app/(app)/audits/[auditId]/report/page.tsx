'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { ProgressIndicator } from '@/components/ai/ProgressIndicator';
import { apiUrl } from '@/lib/utils';
import { mdToHtml } from '@/lib/mdToHtml';
import { downloadFullReport } from '@/lib/auditReport';
import { Bot, RefreshCw, FileText, AlertTriangle, Download } from 'lucide-react';

interface ReportMeta {
  generatedAt: string;
  model: string;
}

interface SectionDef {
  key: string;
  title: string;
}

const AUDIT_REPORT_STEPS = [
  { text: "Collecting audit data...", startPercent: 0, endPercent: 15 },
  { text: "Analyzing processes...", startPercent: 15, endPercent: 40 },
  { text: "Generating executive report...", startPercent: 40, endPercent: 80 },
  { text: "Applying context...", startPercent: 80, endPercent: 95 },
  { text: "Finalizing report...", startPercent: 95, endPercent: 100 },
];

// ─── Section definitions ──────────────────────────────────────────────────────

const SECTION_DEFS: SectionDef[] = [
  { key: 'executiveSummary', title: 'Executive Summary' },
  { key: 'sovInterpretation', title: 'Sovereignty Interpretation' },
  { key: 'roiInterpretation', title: 'ROI Interpretation' },
  { key: 'risks', title: 'Risks & Constraints' },
  { key: 'conclusion', title: 'Conclusion' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditReportPage() {
  const params = useParams();
  const auditId = params?.auditId as string;

  const [sections, setSections] = useState<Record<string, string> | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeterministic, setShowDeterministic] = useState(false);
  const [deterministicHtml, setDeterministicHtml] = useState<string | null>(null);
  const [loadingDet, setLoadingDet] = useState(false);

  const hasSections = !!(sections && SECTION_DEFS.some(s => sections[s.key]?.trim()));

  useEffect(() => {
    fetch(apiUrl(`/api/audits/${auditId}/report`), { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.exists && data.report?.sections) {
          setSections(data.report.sections);
          setMeta({
            generatedAt: data.report.generatedAt,
            model: data.report.model,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [auditId]);

  async function generate() {
    if (sections && !window.confirm('Regenerating will overwrite all 5 sections, including your manual edits. Continue?')) {
      return;
    }

    setError('');
    setSections(null);
    setMeta(null);
    setEditing(null);
    setGenerating(true);

    try {
      const res = await fetch(apiUrl(`/api/audits/${auditId}/report`), {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

      setSections(data.sections);
      setMeta({
        generatedAt: new Date().toISOString(),
        model: data.model || 'mistral-medium-latest',
      });
      toast.success('Report generated successfully');
    } catch (e: any) {
      const msg = e.message || 'Error generating report';
      setError(msg);
      toast.error('Error generating report', { description: msg });
    } finally {
      setGenerating(false);
    }
  }

  async function saveSection(key: string) {
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/audits/${auditId}/report`), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: key, content: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setSections((prev: Record<string, string> | null) => ({ ...(prev ?? {}), [key]: draft }));
      setEditing(null);
      toast.success('Section saved');
    } catch (e: any) {
      toast.error('Error saving', { description: e.message });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(key: string) {
    setDraft(sections?.[key] ?? '');
    setEditing(key);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft('');
  }

  async function toggleDeterministic() {
    const next = !showDeterministic;
    setShowDeterministic(next);
    if (next && deterministicHtml === null && !loadingDet) {
      setLoadingDet(true);
      try {
        const res = await fetch(apiUrl(`/api/audits/${auditId}/report-data`), {
          credentials: 'include',
        });
        const data = await res.json();
        if (res.ok && data.html) setDeterministicHtml(data.html);
        else setDeterministicHtml('<p style="padding:16px">Could not load report data.</p>');
      } catch {
        setDeterministicHtml('<p style="padding:16px">Error loading report data.</p>');
      } finally {
        setLoadingDet(false);
      }
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" className="text-blue-aria" />
      </div>
    );
  }

  const formattedDate = meta?.generatedAt
    ? new Date(meta.generatedAt).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <>
      <style>{`
        .rpt h1{font-family:'Syne',system-ui,sans-serif;font-size:1.5rem;font-weight:700;color:#0F172A;border-bottom:2px solid #CBD5E1;padding-bottom:.75rem;margin:0 0 1.5rem}
        .rpt h2{font-family:'Syne',system-ui,sans-serif;font-size:1.05rem;font-weight:700;color:#1B6CA8;border-bottom:1px solid #e2e8f0;padding-bottom:.2rem;margin:2rem 0 .75rem}
        .rpt h3{font-size:.95rem;font-weight:600;color:#0F172A;margin:1.25rem 0 .4rem}
        .rpt h4{font-size:.75rem;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.05em;margin:1rem 0 .3rem}
        .rpt p{font-size:.875rem;line-height:1.75;color:#0F172A;margin:.5rem 0}
        .rpt ul,.rpt ol{padding-left:1.5rem;margin:.5rem 0}
        .rpt li{font-size:.875rem;line-height:1.7;color:#0F172A;margin:.2rem 0}
        .rpt strong{font-weight:600;color:#0F172A}
        .rpt em{color:#475569;font-style:italic}
        .rpt hr{border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0}
        .rpt blockquote{border-left:3px solid #1B6CA8;padding:.5rem 1rem;color:#475569;font-style:italic;margin:1rem 0;background:#f8fafc;border-radius:0 4px 4px 0}
        .rpt code{background:#f1f5f9;padding:.1rem .35rem;border-radius:4px;font-family:'DM Mono',monospace;font-size:.78rem;color:#1B6CA8}
        .rpt table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.8rem}
        .rpt th{background:#1B6CA8;color:#fff;text-align:left;padding:.5rem .75rem;font-weight:600;font-size:.75rem;border:1px solid #1B6CA8}
        .rpt td{padding:.45rem .75rem;border:1px solid #e2e8f0;vertical-align:top;color:#0F172A}
        .rpt tr:nth-child(even) td{background:#f8fafc}
        .rpt tr:hover td{background:#f1f5f9}
      `}</style>

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text flex items-center gap-2">
              <Bot size={22} className="text-blue-aria" />
              AI Report
            </h1>
            <p className="text-sm text-muted mt-0.5">
              Automated executive report generated from audit data
            </p>
          </div>
          {hasSections && !generating && (
            <div className="flex items-center gap-2">
              <button
                onClick={generate}
                className="flex items-center gap-2 px-4 py-2 rounded-sm border border-border text-sm text-muted hover:text-text hover:border-blue-aria transition-colors"
              >
                <RefreshCw size={14} />
                Regenerate
              </button>
              <button
                onClick={async () => {
                  try {
                    await downloadFullReport(auditId);
                    toast.success('Full report downloaded');
                  } catch (e: any) {
                    toast.error('Download error', { description: e.message });
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-sm border border-border text-sm text-muted hover:text-text hover:border-blue-aria transition-colors"
              >
                <Download size={14} />
                Download full report
              </button>
            </div>
          )}
        </div>

        {/* Meta bar */}
        {meta && !generating && (
          <div className="flex items-center gap-3 text-xs text-muted bg-slate-50 border border-border rounded-sm px-4 py-2">
            <span>
              Generated on <strong className="text-text">{formattedDate}</strong>
            </span>
            <span className="text-border">·</span>
            <span>
              Model: <strong className="text-text">{meta.model}</strong>
            </span>
          </div>
        )}

        {/* Generating indicator */}
        {generating && (
          <div className="bg-blue-50 border border-blue-200 rounded-sm px-4 py-4 text-sm text-blue-700">
            <ProgressIndicator steps={AUDIT_REPORT_STEPS} completionTimeMs={60000} showBar={true} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-sm px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Report Sections */}
        {hasSections ? (
          <div className="space-y-6">
            <div className="bg-white border border-border rounded-sm overflow-hidden">
              <button
                onClick={toggleDeterministic}
                className="w-full flex items-center justify-between px-8 py-4 text-left hover:bg-slate-50 transition-colors"
              >
                <span className="font-display text-lg font-semibold text-text">
                  Report data (Audit Report)
                </span>
                <span className="text-muted text-sm">
                  {showDeterministic ? '▲ Hide' : '▼ Show'}
                </span>
              </button>
              {showDeterministic && (
                <div className="border-t border-border">
                  {loadingDet ? (
                    <div className="flex justify-center py-10">
                      <Spinner size="lg" className="text-blue-aria" />
                    </div>
                  ) : deterministicHtml ? (
                    <iframe
                      srcDoc={deterministicHtml}
                      title="Audit Report data"
                      className="w-full"
                      style={{ height: '600px', border: 'none' }}
                    />
                  ) : null}
                </div>
              )}
            </div>
            {SECTION_DEFS.map(({ key, title }) => (
              <div key={key} className="bg-white border border-border rounded-sm p-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-lg font-semibold text-text">{title}</h2>
                  {editing !== key && (
                    <button
                      onClick={() => startEdit(key)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-border text-xs text-muted hover:text-text hover:border-blue-aria transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {editing === key ? (
                  <div>
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <textarea
                        value={draft}
                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
                        className="w-full h-80 border border-border rounded-sm p-3 font-mono text-xs text-text resize-y"
                        spellCheck={false}
                      />
                      <div
                        className="rpt border border-border rounded-sm p-3 overflow-auto h-80 bg-slate-50"
                        dangerouslySetInnerHTML={{ __html: mdToHtml(draft) }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveSection(key)}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={saving}
                        className="px-4 py-2 rounded-sm border border-border text-sm text-muted hover:text-text transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="rpt"
                    dangerouslySetInnerHTML={{ __html: mdToHtml(sections?.[key] ?? '') }}
                  />
                )}
              </div>
            ))}
          </div>
        ) : !generating && !error ? (
          <div className="bg-white border border-border rounded-sm p-16 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                <FileText size={32} className="text-blue-aria" />
              </div>
            </div>
            <h2 className="font-display text-lg font-semibold text-text mb-2">
              No report generated yet
            </h2>
            <p className="text-sm text-muted max-w-md mx-auto mb-8">
              Generate a complete executive report by analyzing all processes, use cases, sovereignty assessments, and POCs recorded in this audit.
            </p>
            <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto mb-8 text-left">
              {[
                'Executive summary',
                'Sovereignty assessment',
                'Use case ranking',
                'ROI analysis',
                'Risks & constraints',
                'Recommendations',
              ].map((s) => (
                <div
                  key={s}
                  className="flex items-center gap-2 text-xs text-muted"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-aria flex-shrink-0" />
                  {s}
                </div>
              ))}
            </div>
            <button
              onClick={generate}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-700 transition-colors"
            >
              <Bot size={16} />
              Generate AI Report
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
