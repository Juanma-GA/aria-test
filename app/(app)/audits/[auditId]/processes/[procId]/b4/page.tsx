'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Trash2, Info, CheckCircle2, ArrowLeft } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { SaveIndicator } from '@/components/ui/SaveIndicator';
import type { PainPoint, BaseMetrics, FrictionType, ProcessActivity } from '@/lib/types';

const FRICTION_COLORS: Record<FrictionType, 'amber' | 'red' | 'purple' | 'blue' | 'teal'> = {
  time: 'amber', quality: 'red', knowledge: 'purple', integration: 'blue', scale: 'teal',
};

const METRICS: { key: keyof BaseMetrics; label: string; tooltip: string; unit: string }[] = [
  { key: 'avgOutputTimeHours', label: 'Avg output time', tooltip: 'Average time to produce one complete output (e.g., one DM, one report)', unit: 'h' },
  { key: 'reworkRatePercent', label: 'Rework rate', tooltip: 'Percentage of deliverables requiring rework after first delivery', unit: '%' },
  { key: 'avgReviewCycles', label: 'Avg review cycles', tooltip: 'Number of review/correction cycles per deliverable', unit: 'cycles' },
  { key: 'hourlyRateEur', label: 'Hourly rate', tooltip: 'Blended hourly cost of resources involved in this process', unit: '€/h' },
  { key: 'queueWasteHoursPerWeek', label: 'Queue waste', tooltip: 'Hours lost to waiting (approvals, data, system access) per week', unit: 'h/week' },
  { key: 'contentReusePercent', label: 'Content reuse', tooltip: 'Percentage of output built from existing content vs. created from scratch', unit: '%' },
];

function emptyPainPoint(): PainPoint {
  return { id: uuidv4(), description: '', frictionType: 'time', processStage: '', currentMetric: '', estimatedImpact: 3, rootCause: '', notes: '' };
}

function emptyMetrics(): BaseMetrics {
  return { avgOutputTimeHours: 0, reworkRatePercent: 0, avgReviewCycles: 0, hourlyRateEur: 0, queueWasteHoursPerWeek: 0, contentReusePercent: 0, metricNotes: '' };
}

export default function B4Page() {
  const { auditId, procId } = useParams<{ auditId: string; procId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [processName, setProcessName] = useState('');
  const [activities, setActivities] = useState<ProcessActivity[]>([]);
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [metrics, setMetrics] = useState<BaseMetrics>(emptyMetrics());
  const [tooltip, setTooltip] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    fetch(`/api/audits/${auditId}/processes/${procId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setProcessName(data.name || '');
        setActivities(data.b3?.activities || []);
        setPainPoints(data.b4?.painPoints || []);
        setMetrics(data.b4?.baseMetrics || emptyMetrics());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [auditId, procId]);

  const save = useCallback(async (pp: PainPoint[], m: BaseMetrics) => {
    setSaveStatus('saving');
    try {
      await fetch(`/api/audits/${auditId}/processes/${procId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ b4: { painPoints: pp, baseMetrics: m } }),
      });
      setSaveStatus('saved');
    } catch { setSaveStatus('unsaved'); }
  }, [auditId, procId]);

  const trigger = (pp: PainPoint[], m: BaseMetrics) => {
    setSaveStatus('unsaved');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(pp, m), 2000);
  };

  const updatePP = (id: string, field: string, value: unknown) => {
    const next = painPoints.map(p => p.id === id ? { ...p, [field]: value } : p);
    setPainPoints(next);
    trigger(next, metrics);
  };

  const addPP = () => {
    const next = [...painPoints, emptyPainPoint()];
    setPainPoints(next);
    trigger(next, metrics);
  };

  const removePP = (id: string) => {
    const next = painPoints.filter(p => p.id !== id);
    setPainPoints(next);
    trigger(next, metrics);
  };

  const updateMetric = (field: keyof BaseMetrics, value: number | string) => {
    const next = { ...metrics, [field]: value };
    setMetrics(next);
    trigger(painPoints, next);
  };

  const sortedPP = [...painPoints].sort((a, b) => b.estimatedImpact - a.estimatedImpact);
  const annualWasteHours = (metrics.queueWasteHoursPerWeek || 0) * 52;
  const metricsComplete = METRICS.filter(m => m.key !== 'contentReusePercent').every(m => (metrics[m.key] as number) > 0);
  const isComplete = painPoints.length > 0 && metricsComplete;

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-muted hover:text-text"><ArrowLeft size={18} /></button>
          <Badge variant="purple">B4</Badge>
          <h1 className="text-xl font-display font-bold text-text">Friction Diagnosis</h1>
          <span className="text-muted text-sm">— {processName}</span>
          {isComplete && <Badge variant="green"><CheckCircle2 size={12} className="mr-1" />Complete</Badge>}
        </div>
        <SaveIndicator status={saveStatus} />
      </div>

      <div className="flex gap-6 items-start">
        {/* Left: Pain Points */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Pain Points <span className="text-muted font-normal">({painPoints.length})</span></h2>
            <button onClick={addPP} className="btn-primary flex items-center gap-1 text-xs"><Plus size={14} /> Add Pain Point</button>
          </div>

          {painPoints.length === 0 ? (
            <div className="card p-10 text-center text-muted text-sm">No pain points yet. Add at least one to complete B4.</div>
          ) : (
            <div className="space-y-3">
              {sortedPP.map(pp => (
                <div key={pp.id} className="card p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    {/* Impact selector */}
                    <div className="flex-shrink-0">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(n => {
                          const colors = ['bg-slate-200', 'bg-blue-200', 'bg-amber-300', 'bg-orange-400', 'bg-red-500'];
                          return (
                            <button key={n} onClick={() => updatePP(pp.id, 'estimatedImpact', n)}
                              className={`w-5 h-5 rounded-sm transition-opacity ${n <= pp.estimatedImpact ? colors[pp.estimatedImpact - 1] : 'bg-slate-100'}`}
                              title={`Impact ${n}/5`} />
                          );
                        })}
                      </div>
                      <div className="text-xs text-muted text-center mt-0.5">{pp.estimatedImpact}/5</div>
                    </div>
                    <textarea rows={2} className="form-textarea flex-1 text-sm" placeholder="Pain point description…"
                      value={pp.description} onChange={e => updatePP(pp.id, 'description', e.target.value)} />
                    <button onClick={() => removePP(pp.id)} className="text-muted hover:text-red-sov flex-shrink-0 mt-1"><Trash2 size={14} /></button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="form-label">Friction Type</label>
                      <select className="form-input text-xs" value={pp.frictionType} onChange={e => updatePP(pp.id, 'frictionType', e.target.value)}>
                        {(['time', 'quality', 'knowledge', 'integration', 'scale'] as FrictionType[]).map(t => (
                          <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Process Stage</label>
                      <select className="form-input text-xs" value={pp.processStage} onChange={e => updatePP(pp.id, 'processStage', e.target.value)}>
                        <option value="">Not linked</option>
                        {activities.map(a => <option key={a.id} value={a.id}>{a.name || `Activity ${a.order + 1}`}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Current Metric</label>
                      <input className="form-input text-xs" placeholder="e.g. 2h per DM" value={pp.currentMetric} onChange={e => updatePP(pp.id, 'currentMetric', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label">Root Cause</label>
                      <input className="form-input text-xs" value={pp.rootCause} onChange={e => updatePP(pp.id, 'rootCause', e.target.value)} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={FRICTION_COLORS[pp.frictionType]}>{pp.frictionType}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Base Metrics */}
        <div className="w-80 flex-shrink-0">
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-sm">Base Metrics</h2>
            {METRICS.map(({ key, label, tooltip: tip, unit }) => (
              <div key={key}>
                <label className="form-label flex items-center gap-1">
                  {label} <span className="text-muted">({unit})</span>
                  <button onMouseEnter={() => setTooltip(tip)} onMouseLeave={() => setTooltip(null)} className="text-muted hover:text-blue-aria">
                    <Info size={12} />
                  </button>
                </label>
                {tooltip === tip && (
                  <div className="mb-1 text-xs text-muted bg-slate-50 border border-border rounded p-2">{tip}</div>
                )}
                <input type="number" min={0} className="form-input" value={(metrics[key] as number) || ''}
                  onChange={e => updateMetric(key, Number(e.target.value))} />
              </div>
            ))}

            <div>
              <label className="form-label">Metric Notes</label>
              <textarea rows={2} className="form-textarea text-xs" value={metrics.metricNotes}
                onChange={e => updateMetric('metricNotes', e.target.value)} />
            </div>

            {/* Annual waste estimate */}
            {annualWasteHours > 0 && (
              <div className="bg-amber-sov-light rounded p-3 text-xs space-y-1">
                <div className="font-medium text-amber-sov">Annual Waste Estimate</div>
                <div className="text-muted">Queue waste: <strong className="text-text">{annualWasteHours}h/year</strong></div>
                {metrics.avgOutputTimeHours > 0 && metrics.reworkRatePercent > 0 && metrics.hourlyRateEur > 0 && (
                  <div className="text-muted">Rework cost formula: <strong className="text-text">Time × Rate × Rework%</strong></div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
