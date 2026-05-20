'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Plus, Trash2, ChevronDown, ChevronUp, ArrowUp, ArrowDown,
  Copy, CheckCircle2, ArrowLeft, Diamond, Paperclip, Save, X, Upload,
  FileText, Download, ClipboardCopy, Globe, Printer,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ProgressIndicator } from '@/components/ai/ProgressIndicator';
import { TagInput } from '@/components/ui/TagInput';
import { Modal } from '@/components/ui/Modal';
import { useBeforeUnload } from '@/hooks/useBeforeUnload';
import type { ProcessActivity, ProcessTask, ProfileHours, FileAttachment, ProfileEntry } from '@/lib/types';

// ── File list with real upload ─────────────────────────────────────────────────

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

function FileList({ files, onChange }: { files: FileAttachment[]; onChange: (f: FileAttachment[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;

    selected.forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
        alert(`File "${file.name}" exceeds 2 MB limit.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        onChange([...files, { id: uuidv4(), name: file.name, url: reader.result as string }]);
      };
      reader.readAsDataURL(file);
    });
    // Reset so same file can be re-selected
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-1 mt-1">
      {files.map(f => (
        <div key={f.id} className="flex items-center gap-2 text-xs bg-slate-50 rounded px-2 py-1">
          <Paperclip size={11} className="text-muted flex-shrink-0" />
          {f.url ? (
            <a href={f.url} download={f.name} className="flex-1 text-blue-aria truncate hover:underline">
              {f.name}
            </a>
          ) : (
            <span className="flex-1 text-text truncate">{f.name}</span>
          )}
          <button onClick={() => onChange(files.filter(x => x.id !== f.id))} className="text-muted hover:text-red-500">
            <X size={11} />
          </button>
        </div>
      ))}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1 text-xs text-blue-aria hover:underline mt-1"
      >
        <Upload size={11} /> Upload file (max 2 MB)
      </button>
    </div>
  );
}

// ── emptyActivity ──────────────────────────────────────────────────────────────

function emptyActivity(order: number): ProcessActivity {
  return {
    id: uuidv4(), order, name: '', tools: [], inputs: [], outputs: [],
    inputFiles: [], outputFiles: [], responsibleProfile: '',
    profileHours: [], estimatedTimeHours: 0,
    annualRepetitions: 1, stepRepetitions: 1,
    isDecisionPoint: false, linkedUseCaseIds: [], notes: '',
    tasks: [],
  };
}

// ── Flowchart node ─────────────────────────────────────────────────────────────

function FlowNode({ index, isDecision }: { index: number; isDecision: boolean }) {
  if (isDecision) {
    return (
      <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center">
        <div className="w-7 h-7 bg-amber-500 rotate-45 absolute" />
        <span className="relative text-white text-xs font-bold font-mono z-10">{index + 1}</span>
      </div>
    );
  }
  return (
    <div className="w-10 h-10 flex-shrink-0 rounded-full bg-purple-600 text-white text-xs font-bold font-mono flex items-center justify-center">
      {index + 1}
    </div>
  );
}

// ── B3 Page ───────────────────────────────────────────────────────────────────

export default function B3Page() {
  const { auditId, procId } = useParams<{ auditId: string; procId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [processName, setProcessName] = useState('');
  const [b1Profiles, setB1Profiles] = useState<ProfileEntry[]>([]);
  const [activities, setActivities] = useState<ProcessActivity[]>([]);
  const [notes, setNotes] = useState('');
  const [annualRepetitions, setAnnualRepetitions] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // ── AI Process Report ────────────────────────────────────────────────────────

  const PROCESS_REPORT_STEPS = [
    { text: "Analyzing process context...", startPercent: 0, endPercent: 20 },
    { text: "Evaluating sovereignty constraints...", startPercent: 20, endPercent: 40 },
    { text: "Analyzing process map and bottlenecks...", startPercent: 40, endPercent: 75 },
    { text: "Applying context...", startPercent: 75, endPercent: 90 },
    { text: "Finalizing report...", startPercent: 90, endPercent: 100 },
  ];

  // AI Report
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/audits/${auditId}/processes/${procId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setProcessName(data.name || '');
        setB1Profiles(data.b1?.profiles || []);
        setActivities((data.b3?.activities || []).sort((a: ProcessActivity, b: ProcessActivity) => a.order - b.order));
        setNotes(data.b3?.notes || '');
        setAnnualRepetitions(data.b3?.annualRepetitions || 1);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [auditId, procId]);

  const generateReport = async () => {
    setReportOpen(true);
    setReportMarkdown(null);
    setReportLoading(true);
    try {
      const res = await fetch(`/api/audits/${auditId}/processes/${procId}/ai/process-report`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Error generating report'); setReportOpen(false); return; }
      setReportMarkdown(data.markdown);
    } catch {
      toast.error('Could not connect to AI service');
      setReportOpen(false);
    } finally {
      setReportLoading(false);
    }
  };

  const downloadReport = () => {
    if (!reportMarkdown) return;
    const blob = new Blob([reportMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `process-report-${processName.replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyReport = async () => {
    if (!reportMarkdown) return;
    await navigator.clipboard.writeText(reportMarkdown);
    toast.success('Report copied to clipboard');
  };

  const mdToHtmlContent = (md: string): string => {
    const lines = md.split('\n');
    let html = '';
    let inUl = false;
    let inOl = false;
    let inTable = false;
    let tableHeader = true;

    const closeList = () => {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
    };
    const closeTable = () => {
      if (inTable) { html += '</tbody></table>'; inTable = false; tableHeader = true; }
    };

    const inline = (s: string) =>
      s
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>');

    for (const raw of lines) {
      const line = raw.trimEnd();

      // Table row
      if (/^\|.+\|/.test(line)) {
        if (!inTable) { closeList(); html += '<table>'; inTable = true; tableHeader = true; }
        if (/^\|[-| :]+\|$/.test(line)) { html += '<tbody>'; tableHeader = false; continue; }
        const cells = line.replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
        if (tableHeader) {
          html += `<thead><tr>${cells.map(c => `<th>${c}</th>`).join('')}</tr></thead>`;
        } else {
          html += `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
        }
        continue;
      }
      if (inTable) closeTable();

      // Headings
      const hm = line.match(/^(#{1,4})\s+(.+)/);
      if (hm) { closeList(); html += `<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`; continue; }

      // Unordered list
      const ulm = line.match(/^[-*+]\s+(.+)/);
      if (ulm) { if (!inUl) { closeList(); html += '<ul>'; inUl = true; } html += `<li>${inline(ulm[1])}</li>`; continue; }

      // Ordered list
      const olm = line.match(/^\d+\.\s+(.+)/);
      if (olm) { if (!inOl) { closeList(); html += '<ol>'; inOl = true; } html += `<li>${inline(olm[1])}</li>`; continue; }

      // Blockquote
      const bqm = line.match(/^>\s*(.*)/);
      if (bqm) { closeList(); html += `<blockquote>${inline(bqm[1])}</blockquote>`; continue; }

      // HR
      if (/^---+$/.test(line)) { closeList(); html += '<hr>'; continue; }

      // Empty line
      if (line === '') { closeList(); html += '<br>'; continue; }

      // Paragraph
      closeList();
      html += `<p>${inline(line)}</p>`;
    }
    closeList();
    closeTable();
    return html;
  };

  const exportHtml = () => {
    if (!reportMarkdown) return;
    const body = mdToHtmlContent(reportMarkdown);
    const slug = processName.replace(/\s+/g, '-').toLowerCase();
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Process Report — ${processName}</title>
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
    a.download = `process-report-${slug}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    if (!reportMarkdown) return;
    const body = mdToHtmlContent(reportMarkdown);
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>AI Process Report — ${processName}</title>
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
    if (!win) { toast.error('Allow pop-ups to export PDF'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/audits/${auditId}/processes/${procId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ b3: { activities, notes, annualRepetitions } }),
      });
      setSaved(true);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const markUnsaved = () => setSaved(false);

  useBeforeUnload(!saved);

  const recalcTime = (ph: ProfileHours[], stepReps: number): number =>
    Math.round(ph.reduce((s, p) => s + (p.hours ?? 0), 0) * stepReps * 10) / 10;

  const updateActivity = (id: string, field: string, value: unknown) => {
    setActivities(prev => prev.map(a => {
      if (a.id !== id) return a;
      const updated = { ...a, [field]: value };
      if (field === 'profileHours' || field === 'stepRepetitions') {
        const ph = field === 'profileHours' ? (value as ProfileHours[]) : (a.profileHours ?? []);
        const reps = field === 'stepRepetitions' ? Number(value) : a.stepRepetitions;
        if (ph.length > 0) updated.estimatedTimeHours = recalcTime(ph, reps);
      }
      return updated;
    }));
    markUnsaved();
  };

  const updateProfileHour = (actId: string, phIdx: number, field: string, value: string | number) => {
    setActivities(prev => prev.map(a => {
      if (a.id !== actId) return a;
      const ph = (a.profileHours ?? []).map((p, i) => i === phIdx ? { ...p, [field]: value } : p);
      const time = ph.length > 0 ? recalcTime(ph, a.stepRepetitions ?? 1) : a.estimatedTimeHours;
      return { ...a, profileHours: ph, estimatedTimeHours: time };
    }));
    markUnsaved();
  };

  const addProfileHour = (actId: string) => {
    const firstProfile = b1Profiles[0];
    setActivities(prev => prev.map(a => {
      if (a.id !== actId) return a;
      const ph = [...(a.profileHours ?? []), {
        profileId: firstProfile?.id ?? '',
        role: firstProfile?.role ?? '',
        hours: 0,
      }];
      return { ...a, profileHours: ph };
    }));
    markUnsaved();
  };

  const removeProfileHour = (actId: string, phIdx: number) => {
    setActivities(prev => prev.map(a => {
      if (a.id !== actId) return a;
      const ph = (a.profileHours ?? []).filter((_, i) => i !== phIdx);
      const time = ph.length > 0 ? recalcTime(ph, a.stepRepetitions ?? 1) : 0;
      return { ...a, profileHours: ph, estimatedTimeHours: time };
    }));
    markUnsaved();
  };

  const addTask = (actId: string) => {
    setActivities(prev => prev.map(a => {
      if (a.id !== actId) return a;
      return { ...a, tasks: [...(a.tasks ?? []), { id: uuidv4(), description: '' }] };
    }));
    markUnsaved();
  };

  const updateTask = (actId: string, taskId: string, description: string) => {
    setActivities(prev => prev.map(a => {
      if (a.id !== actId) return a;
      return { ...a, tasks: (a.tasks ?? []).map(t => t.id === taskId ? { ...t, description } : t) };
    }));
    markUnsaved();
  };

  const removeTask = (actId: string, taskId: string) => {
    setActivities(prev => prev.map(a => {
      if (a.id !== actId) return a;
      return { ...a, tasks: (a.tasks ?? []).filter(t => t.id !== taskId) };
    }));
    markUnsaved();
  };

  const addActivity = () => {
    const next = [...activities, emptyActivity(activities.length)];
    setActivities(next);
    setExpanded(e => ({ ...e, [next[next.length - 1].id]: true }));
    markUnsaved();
  };

  const duplicate = (id: string) => {
    const src = activities.find(a => a.id === id);
    if (!src) return;
    const copy = { ...src, id: uuidv4(), name: `${src.name} (copy)`, order: activities.length };
    setActivities(prev => [...prev, copy]);
    markUnsaved();
  };

  const remove = (id: string) => {
    setActivities(prev => prev.filter(a => a.id !== id).map((a, i) => ({ ...a, order: i })));
    markUnsaved();
  };

  const moveUp = (i: number) => {
    if (i === 0) return;
    setActivities(prev => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next.map((a, idx) => ({ ...a, order: idx }));
    });
    markUnsaved();
  };

  const moveDown = (i: number) => {
    if (i === activities.length - 1) return;
    setActivities(prev => {
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next.map((a, idx) => ({ ...a, order: idx }));
    });
    markUnsaved();
  };

  const totalTime = activities.reduce((s, a) => s + (Number(a.estimatedTimeHours) || 0), 0);
  const decisionCount = activities.filter(a => a.isDecisionPoint).length;
  const totalAnnualHours = Math.round(totalTime * annualRepetitions * 10) / 10;
  const isComplete = activities.length >= 3;

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-muted hover:text-text"><ArrowLeft size={18} /></button>
          <Badge variant="purple">B3</Badge>
          <h1 className="text-xl font-display font-bold text-text">Process Map</h1>
          <span className="text-muted text-sm">— {processName}</span>
          {isComplete && <Badge variant="green"><CheckCircle2 size={12} className="mr-1" />Complete</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generateReport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-sm hover:bg-purple-700 transition-colors"
          >
            <FileText size={14} /> AI Report
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-aria/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Spinner size="sm" /> : <Save size={14} />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </button>
          <button onClick={addActivity} className="btn-primary flex items-center gap-1 text-xs">
            <Plus size={14} /> Add Step
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="card p-3 mb-6 flex flex-wrap items-center gap-6 text-sm">
        <span className="text-muted">Steps: <strong className="text-text">{activities.length}</strong></span>
        <span className="text-muted">Time/run: <strong className="text-text">{totalTime}h</strong></span>
        <span className="text-muted flex items-center gap-1">
          Decision points: <strong className="text-text flex items-center gap-1"><Diamond size={12} />{decisionCount}</strong>
        </span>
        <div className="flex items-center gap-2">
          <span className="text-muted text-xs">Annual runs:</span>
          <input type="number" min={1} className="form-input text-xs w-16 py-0.5" value={annualRepetitions}
            onChange={e => { setAnnualRepetitions(parseInt(e.target.value) || 1); markUnsaved(); }} />
        </div>
        {totalAnnualHours > 0 && (
          <span className="text-muted">Annual total: <strong className="text-text">{totalAnnualHours}h</strong></span>
        )}
        {!isComplete && <span className="text-amber-600 text-xs">Add at least {3 - activities.length} more to complete B3</span>}
      </div>

      {/* Flowchart */}
      {activities.length === 0 ? (
        <div className="card p-10 text-center text-muted text-sm">
          No steps yet. Click &ldquo;Add Step&rdquo; to start mapping the process.
        </div>
      ) : (
        <div className="relative">
          {/* Vertical connector line */}
          <div className="absolute left-[19px] top-10 bottom-10 w-0.5 bg-slate-200 z-0" />

          <div className="space-y-0">
            {activities.map((act, i) => {
              const isOpen = expanded[act.id];
              const isLast = i === activities.length - 1;

              return (
                <div key={act.id} className="relative flex gap-4 pb-4">
                  {/* Left: node */}
                  <div className="flex flex-col items-center z-10 flex-shrink-0">
                    <FlowNode index={i} isDecision={act.isDecisionPoint} />
                    {!isLast && <div className="flex-1 w-0.5 bg-slate-200 mt-1 min-h-[16px]" />}
                  </div>

                  {/* Right: card */}
                  <div className={`flex-1 border rounded-sm shadow-sm mb-2 ${
                    act.isDecisionPoint
                      ? 'border-amber-300 bg-amber-50/40'
                      : 'border-border bg-white'
                  }`}>
                    {/* Card header — always visible */}
                    <div className="flex items-center gap-2 p-3">
                      {act.isDecisionPoint && (
                        <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded flex-shrink-0">
                          Decision
                        </span>
                      )}
                      <input
                        className="flex-1 text-sm font-medium bg-transparent border-none outline-none text-text placeholder:text-muted min-w-0"
                        placeholder="Step name…"
                        value={act.name}
                        onChange={e => updateActivity(act.id, 'name', e.target.value)}
                      />
                      {act.estimatedTimeHours > 0 && (
                        <span className="text-xs font-bold text-text flex-shrink-0">{act.estimatedTimeHours}h</span>
                      )}
                      {(act.linkedUseCaseIds?.length ?? 0) > 0 && (
                        <Badge variant="blue">{act.linkedUseCaseIds.length} UC</Badge>
                      )}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => moveUp(i)} disabled={i === 0} className="p-1 text-muted hover:text-text disabled:opacity-30"><ArrowUp size={13} /></button>
                        <button onClick={() => moveDown(i)} disabled={i === activities.length - 1} className="p-1 text-muted hover:text-text disabled:opacity-30"><ArrowDown size={13} /></button>
                        <button onClick={() => duplicate(act.id)} className="p-1 text-muted hover:text-blue-aria"><Copy size={13} /></button>
                        <button onClick={() => remove(act.id)} className="p-1 text-muted hover:text-red-500"><Trash2 size={13} /></button>
                        <button onClick={() => setExpanded(e => ({ ...e, [act.id]: !isOpen }))} className="p-1 text-muted hover:text-text">
                          {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded fields */}
                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="form-label">Tools / Systems</label>
                            <TagInput value={act.tools} onChange={v => updateActivity(act.id, 'tools', v)} placeholder="Add tool + Enter" />
                          </div>
                          <div>
                            <label className="form-label">Step Repetitions</label>
                            <input type="number" min={1} className="form-input" value={act.stepRepetitions ?? 1}
                              onChange={e => updateActivity(act.id, 'stepRepetitions', parseInt(e.target.value) || 1)} />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="form-label">Inputs</label>
                            <TagInput value={act.inputs} onChange={v => updateActivity(act.id, 'inputs', v)} placeholder="Add input + Enter" />
                            <p className="text-[10px] text-muted mt-1">Example files:</p>
                            <FileList files={act.inputFiles ?? []} onChange={v => updateActivity(act.id, 'inputFiles', v)} />
                          </div>
                          <div>
                            <label className="form-label">Outputs</label>
                            <TagInput value={act.outputs} onChange={v => updateActivity(act.id, 'outputs', v)} placeholder="Add output + Enter" />
                            <p className="text-[10px] text-muted mt-1">Example files:</p>
                            <FileList files={act.outputFiles ?? []} onChange={v => updateActivity(act.id, 'outputFiles', v)} />
                          </div>
                        </div>

                        {/* Profile hours */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="form-label mb-0">Profile Hours per Occurrence</label>
                            <button onClick={() => addProfileHour(act.id)} className="text-xs text-blue-aria hover:underline flex items-center gap-1">
                              <Plus size={12} />Add profile
                            </button>
                          </div>
                          {b1Profiles.length === 0 && (
                            <p className="text-xs text-amber-600">No profiles defined in B1 Context yet.</p>
                          )}
                          {(act.profileHours ?? []).map((ph, phIdx) => (
                            <div key={phIdx} className="flex items-center gap-2 mb-1">
                              {b1Profiles.length > 0 ? (
                                <select
                                  className="form-input text-xs flex-1"
                                  value={ph.profileId}
                                  onChange={e => {
                                    const prof = b1Profiles.find(p => p.id === e.target.value);
                                    updateProfileHour(act.id, phIdx, 'profileId', e.target.value);
                                    if (prof) updateProfileHour(act.id, phIdx, 'role', prof.role);
                                  }}
                                >
                                  <option value="">Select profile…</option>
                                  {b1Profiles.map(p => (
                                    <option key={p.id} value={p.id}>{p.role} ({p.count ?? 1} × €{p.hourlyRateEur}/h)</option>
                                  ))}
                                </select>
                              ) : (
                                <input className="form-input text-xs flex-1" placeholder="Profile / role…" value={ph.role}
                                  onChange={e => updateProfileHour(act.id, phIdx, 'role', e.target.value)} />
                              )}
                              <input type="number" min={0} step={0.5} className="form-input text-xs w-20" placeholder="h" value={ph.hours}
                                onChange={e => updateProfileHour(act.id, phIdx, 'hours', parseFloat(e.target.value) || 0)} />
                              <span className="text-xs text-muted">h</span>
                              <button onClick={() => removeProfileHour(act.id, phIdx)} className="text-muted hover:text-red-500"><Trash2 size={13} /></button>
                            </div>
                          ))}
                          {(act.profileHours ?? []).length > 0 && (
                            <p className="text-[10px] text-muted mt-1">
                              Estimated time: <strong>{act.estimatedTimeHours}h</strong> (sum of profile hours × step reps)
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <button
                            onClick={() => updateActivity(act.id, 'isDecisionPoint', !act.isDecisionPoint)}
                            className={`flex items-center gap-2 px-3 py-2 rounded text-xs border transition-colors ${
                              act.isDecisionPoint
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'border-border text-muted hover:border-amber-500'
                            }`}
                          >
                            <Diamond size={13} /> {act.isDecisionPoint ? 'Remove Decision Point' : 'Mark as Decision Point'}
                          </button>
                        </div>

                        {/* Tasks */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="form-label mb-0">Tareas</label>
                            <button onClick={() => addTask(act.id)} className="text-xs text-blue-aria hover:underline flex items-center gap-1">
                              <Plus size={12} />Añadir tarea
                            </button>
                          </div>
                          {(act.tasks ?? []).length === 0 && (
                            <p className="text-xs text-muted">Sin tareas definidas.</p>
                          )}
                          {(act.tasks ?? []).map((task) => (
                            <div key={task.id} className="flex items-start gap-2 mb-2">
                              <textarea
                                rows={2}
                                className="form-textarea flex-1 text-xs"
                                placeholder="Descripción de la tarea…"
                                value={task.description}
                                onChange={e => updateTask(act.id, task.id, e.target.value)}
                              />
                              <button onClick={() => removeTask(act.id, task.id)} className="text-muted hover:text-red-500 mt-1"><Trash2 size={13} /></button>
                            </div>
                          ))}
                        </div>

                        <div>
                          <label className="form-label">Notes</label>
                          <textarea rows={2} className="form-textarea" value={act.notes}
                            onChange={e => updateActivity(act.id, 'notes', e.target.value)} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Process notes */}
      <div className="card p-4 mt-4">
        <label className="form-label">Process Notes</label>
        <textarea rows={3} className="form-textarea" placeholder="General notes about the process flow…"
          value={notes} onChange={e => { setNotes(e.target.value); markUnsaved(); }} />
      </div>

      {/* Sticky save */}
      {!saved && (
        <div className="fixed bottom-6 right-6 z-40">
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-aria text-white font-medium rounded-sm shadow-lg hover:bg-blue-aria/90 disabled:opacity-60">
            {saving ? <Spinner size="sm" /> : <Save size={15} />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}

      {/* AI Report modal */}
      <Modal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        title={`AI Process Report — ${processName}`}
        size="xl"
      >
        {reportLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <ProgressIndicator steps={PROCESS_REPORT_STEPS} completionTimeMs={45000} showBar={true} />
          </div>
        ) : reportMarkdown ? (
          <div>
            <div className="flex flex-wrap justify-end gap-2 mb-4">
              <button
                onClick={copyReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-sm text-muted hover:text-text hover:border-text transition-colors"
              >
                <ClipboardCopy size={14} /> Copiar MD
              </button>
              <button
                onClick={downloadReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-sm text-muted hover:text-text hover:border-text transition-colors"
              >
                <Download size={14} /> Descargar .md
              </button>
              <button
                onClick={exportHtml}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-sm text-muted hover:text-text hover:border-text transition-colors"
              >
                <Globe size={14} /> Exportar HTML
              </button>
              <button
                onClick={exportPdf}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-sm hover:bg-purple-700 transition-colors"
              >
                <Printer size={14} /> Exportar PDF
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
