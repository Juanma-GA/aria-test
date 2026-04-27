'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Plus,
  X,
  Pencil,
  Trash2,
  CheckCircle2,
  ArrowLeft,
  AlertTriangle,
  FlaskConical,
  TrendingUp,
  Bot,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import type {
  UseCase,
  AIType,
  ProcessActivity,
  TimeSavedEntry,
  ScoreValue,
  ProfileEntry,
} from '@/lib/types';
import { AI_TYPE_LABELS } from '@/lib/types';
import { apiUrl } from '@/lib/utils';
import { calculateSovereigntyIndex, calculateScore } from '@/lib/calculations';

const AI_TYPE_COLORS: Record<
  AIType,
  'purple' | 'blue' | 'teal' | 'amber' | 'green' | 'slate'
> = {
  generative_llm: 'purple',
  extraction_nlp: 'blue',
  classification_ml: 'teal',
  rag: 'blue',
  validation: 'amber',
  prediction: 'green',
  intelligent_automation: 'teal',
  agentic_ai: 'purple',
  other: 'slate',
};

const STATUS_VARIANTS: Record<string, 'green' | 'red' | 'amber' | 'slate'> = {
  eligible: 'green',
  blocked: 'red',
  pending_review: 'amber',
};

const GPU_PRESETS: Record<
  string,
  { name: string; tdpW: number; priceEur: number; vramGb: number }
> = {
  rtx_4090: { name: 'RTX 4090', tdpW: 450, priceEur: 2000, vramGb: 24 },
  a100_40gb: { name: 'A100 40GB', tdpW: 300, priceEur: 10000, vramGb: 40 },
  a100_80gb: { name: 'A100 80GB', tdpW: 400, priceEur: 15000, vramGb: 80 },
  h100: { name: 'H100 80GB', tdpW: 700, priceEur: 30000, vramGb: 80 },
};

// Executions distributed over 215 working days × 8h = 1,720 working hours/year
const WORKING_HOURS_PER_YEAR = 215 * 8;

function autoRecommendGpu(
  annualReps: number,
  concurrentUsers: number,
  avgSec: number,
) {
  const cu = Math.max(1, concurrentUsers);
  const sec = Math.max(avgSec, 0.1);
  // Average throughput during working hours
  const avgRps = annualReps / (WORKING_HOURS_PER_YEAR * 3600);
  // GPUs needed to sustain average throughput
  const gpusForThroughput = Math.ceil(avgRps * sec);
  // GPU class selected by throughput tier only (concurrency handled via batch capacity below)
  const gpuModel =
    annualReps < 10_000
      ? 'rtx_4090'
      : annualReps < 100_000
        ? 'a100_40gb'
        : annualReps < 500_000
          ? 'a100_80gb'
          : 'h100';
  // Realistic continuous-batching capacity per GPU (vLLM/TGI, medium-size model ~7–13B)
  // Larger VRAM → bigger KV-cache → more sequences in flight simultaneously
  const concPerGpu: Record<string, number> = {
    rtx_4090: 8,
    a100_40gb: 16,
    a100_80gb: 32,
    h100: 64,
  };
  const gpusForConcurrency = Math.ceil(cu / concPerGpu[gpuModel]);
  const nGpus = Math.max(gpusForThroughput, gpusForConcurrency, 1);
  // GPU utilisation: fraction of working time the GPU is actively processing
  const utilizationPct = Math.min(
    (annualReps * sec) / (WORKING_HOURS_PER_YEAR * 3600),
    1,
  );
  const peakRps = (cu / sec).toFixed(1);
  const batchCap = concPerGpu[gpuModel];
  const rationale =
    `${annualReps.toLocaleString()} exec/yr ÷ ${WORKING_HOURS_PER_YEAR}h = ${avgRps.toFixed(4)} req/s avg · ` +
    `${cu} concurrent users (${batchCap} batch cap/GPU → ${gpusForConcurrency} GPU${gpusForConcurrency !== 1 ? 's' : ''}) · ` +
    `GPU load ${(utilizationPct * 100).toFixed(1)}% · ${nGpus}× ${GPU_PRESETS[gpuModel].name}`;
  return { gpuModel, nGpus, utilizationPct, rationale };
}

const DIMENSIONS: {
  key: string;
  label: string;
  hint: string;
  scale: string;
}[] = [
  {
    key: 'd1_efficiencyImpact',
    label: 'D1 Efficiency',
    hint: 'How much does AI improve speed or reduce manual effort?',
    scale: '1 = <10% saving · 3 = 20–35% · 5 = >50%',
  },
  {
    key: 'd2_qualityImpact',
    label: 'D2 Quality',
    hint: 'Does AI reduce errors or improve output quality?',
    scale:
      '1 = Marginal · 3 = Reduces rework significantly · 5 = Full consistency guaranteed',
  },
  {
    key: 'd3_techMaturity',
    label: 'D3 Tech Maturity',
    hint: 'How mature is the AI technology for this use case?',
    scale: '1 = Experimental · 3 = Pilot · 5 = Market standard',
  },
  {
    key: 'd4_dataReadiness',
    label: 'D4 Data Readiness',
    hint: 'Is the data available, clean, and accessible?',
    scale:
      "1 = Doesn't exist · 3 = Available with effort · 5 = Structured & clean",
  },
  {
    key: 'd5_sovereigntyIndex',
    label: 'D5 Sovereignty',
    hint: 'Compliance with sovereignty constraints (auto-filled from B2)',
    scale:
      '1 = Critical · 2 = Restricted · 3 = Conditioned · 4 = Managed · 5 = Full Autonomy',
  },
];

function emptyScore() {
  const dim = { value: 3 as ScoreValue, justification: '' };
  return {
    d1_efficiencyImpact: { ...dim },
    d2_qualityImpact: { ...dim },
    d3_techMaturity: { ...dim },
    d4_dataReadiness: { ...dim },
    d5_sovereigntyIndex: { ...dim },
  };
}

function sovereigntyLevelToD5(level: string): ScoreValue {
  const map: Record<string, ScoreValue> = {
    full_autonomy: 5,
    managed: 4,
    conditioned: 3,
    restricted: 2,
    critical: 1,
  };
  return map[level] ?? 3;
}

function scoreTotal(dims: ReturnType<typeof emptyScore>): number {
  return Object.entries(dims)
    .filter(([k]) => k !== 'd6_governanceComplexity')
    .reduce((s, [, d]) => s + d.value, 0);
}

function scoreCategory(total: number): string {
  if (total >= 18) return 'Quick Win';
  if (total >= 11) return 'Mid-term';
  return 'Strategic';
}

function d1FromPct(pct: number): ScoreValue {
  if (pct < 10) return 1;
  if (pct < 20) return 2;
  if (pct < 35) return 3;
  if (pct < 50) return 4;
  return 5;
}

function emptyForm(processId: string): Partial<UseCase> & {
  aiTypes: AIType[];
  timeSavedPerProfile: TimeSavedEntry[];
  targetActivities: string[];
} {
  return {
    description: '',
    aiTypes: ['generative_llm'],
    targetActivities: [],
    requiresClientIT: false,
    timeSavedPerProfile: [],
    estimatedDevCostEur: 0,
    devCostExplanation: '',
    estimatedImplWeeks: 0,
    notes: '',
    computeCost: {
      deploymentModel: 'cloud_api',
      annualReps: 0,
      concurrentUsers: 1,
      avgResponseTimeSec: 2,
      inputTokensPerExec: 1000,
      outputTokensPerExec: 500,
      pricePerMInputTokens: 2,
      pricePerMOutputTokens: 6,
      gpuModel: 'a100_40gb',
      nGpus: 1,
      amortizationYears: 4,
      electricityRateEur: 0.15,
      onPremPct: 70,
      subscriptions: [],
    },
    processId,
  };
}

function computeAnnualCost(cc: Record<string, any>): number {
  const reps = cc.annualReps ?? 0;
  if (reps === 0) return 0;
  const cu = cc.concurrentUsers ?? 1;
  const avgSec = cc.avgResponseTimeSec ?? 2;
  const model = cc.deploymentModel ?? 'cloud_api';
  const cloudCost =
    (((cc.inputTokensPerExec ?? 1000) * reps) / 1_000_000) *
      (cc.pricePerMInputTokens ?? 2) +
    (((cc.outputTokensPerExec ?? 500) * reps) / 1_000_000) *
      (cc.pricePerMOutputTokens ?? 6);
  const autoRec = autoRecommendGpu(reps, cu, avgSec);
  const gpu = GPU_PRESETS[autoRec.gpuModel];
  const totalGpuCost = gpu.priceEur * autoRec.nGpus;
  const amortization = totalGpuCost / (cc.amortizationYears ?? 4);
  // GPU runs all working hours; power scales from 30 % (idle) to 100 % (full load) with utilisation
  const powerFactor = 0.3 + 0.7 * autoRec.utilizationPct;
  const electricity =
    (gpu.tdpW / 1000) *
    autoRec.nGpus *
    WORKING_HOURS_PER_YEAR *
    powerFactor *
    (cc.electricityRateEur ?? 0.15);
  const onPremCost = amortization + electricity + 0.08 * totalGpuCost;
  const subscriptionsCost = (
    (cc.subscriptions ?? []) as { users: number; monthlyPerUser: number }[]
  ).reduce(
    (s, sub) => s + (sub.users ?? 0) * (sub.monthlyPerUser ?? 0) * 12,
    0,
  );
  const pct = (cc.onPremPct ?? 70) / 100;
  const infraCost =
    model === 'on_premise'
      ? onPremCost
      : model === 'hybrid'
        ? onPremCost * pct + cloudCost * (1 - pct)
        : cloudCost;
  return infraCost + subscriptionsCost;
}

function computeRoi(
  timeSaved: TimeSavedEntry[],
  b1Profiles: ProfileEntry[],
  devCost: number,
  annualReps: number,
  targetHours: number,
  computeCostPerYear: number = 0,
): {
  totalHours: number;
  annualSaving: number;
  computeCostPerYear: number;
  netAnnualSaving: number;
  paybackMonths: number;
  savingPct: number | null;
} | null {
  const totalHours = timeSaved.reduce(
    (s, e) => s + (e.hoursPerExecution ?? 0),
    0,
  );
  if (totalHours === 0 || annualReps === 0) return null;
  const rates = b1Profiles.map((p) => p.hourlyRateEur).filter((r) => r > 0);
  const avgRate =
    rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : 0;
  if (avgRate === 0) return null;
  const annualSaving = totalHours * avgRate * annualReps;
  const netAnnualSaving = Math.max(annualSaving - computeCostPerYear, 0);
  const paybackMonths =
    devCost > 0 && netAnnualSaving > 0 ? (devCost / netAnnualSaving) * 12 : 0;
  const savingPct =
    targetHours > 0 ? Math.round((totalHours / targetHours) * 100) : null;
  return {
    totalHours,
    annualSaving,
    computeCostPerYear,
    netAnnualSaving,
    paybackMonths,
    savingPct,
  };
}

function SlideOver({
  open,
  onClose,
  processId,
  auditId,
  activities,
  b1Profiles,
  annualReps,
  editUC,
  onSaved,
  initialDesc,
  b2Axes,
}: {
  open: boolean;
  onClose: () => void;
  processId: string;
  auditId: string;
  activities: ProcessActivity[];
  b1Profiles: ProfileEntry[];
  annualReps: number;
  editUC?: UseCase | null;
  onSaved: (uc: UseCase, blocked: boolean) => void;
  initialDesc?: string;
  b2Axes?: Record<string, any>;
}) {
  type FormType = Partial<UseCase> & {
    aiTypes: AIType[];
    timeSavedPerProfile: TimeSavedEntry[];
    targetActivities: string[];
    sovereigntyAnalysis?: string;
  };
  const [form, setForm] = useState<FormType>(emptyForm(processId));
  const [dims, setDims] = useState(emptyScore());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [analyzingSOV, setAnalyzingSOV] = useState(false);
  const [refreshingCompute, setRefreshingCompute] = useState(false);
  const [computeRationale, setComputeRationale] = useState('');
  const d1ManualRef = useRef(false);
  const d5ManualRef = useRef(false);

  useEffect(() => {
    // Compute D5 autofill from B2 axes
    let d5AutoValue: ScoreValue = 3;
    let d5AutoJustification = '';
    let requiresClientITAuto = false;
    if (b2Axes && Object.keys(b2Axes).length > 0) {
      try {
        const sovResult = calculateSovereigntyIndex(b2Axes as any);
        d5AutoValue = sovereigntyLevelToD5(sovResult.level);
        const LEVEL_LABELS: Record<string, string> = {
          full_autonomy: 'Full Autonomy',
          managed: 'Managed',
          conditioned: 'Conditioned',
          restricted: 'Restricted',
          critical: 'Critical',
        };
        d5AutoJustification = `Auto from B2: ${LEVEL_LABELS[sovResult.level] ?? sovResult.level} (index ${sovResult.index.toFixed(2)}/5)`;
        requiresClientITAuto =
          sovResult.level === 'restricted' || sovResult.level === 'critical';
      } catch {}
    }

    if (editUC) {
      const defaultCC = emptyForm(processId).computeCost as Record<
        string,
        unknown
      >;
      setForm({
        ...editUC,
        aiTypes: editUC.aiTypes?.length
          ? editUC.aiTypes
          : [(editUC as any).aiType ?? 'generative_llm'],
        timeSavedPerProfile: editUC.timeSavedPerProfile ?? [],
        targetActivities: editUC.targetActivities?.length
          ? editUC.targetActivities
          : (editUC as any).targetActivity
            ? [(editUC as any).targetActivity]
            : [],
        computeCost: { ...defaultCC, ...((editUC as any).computeCost ?? {}) },
        requiresClientIT: requiresClientITAuto,
        sovereigntyAnalysis: (editUC as any).sovereigntyAnalysis ?? '',
      });
      if (editUC.score?.dimensions) {
        const existingDims = editUC.score.dimensions as any;
        // Re-autofill D5 unless manually edited
        if (!d5ManualRef.current) {
          setDims({
            ...existingDims,
            d5_sovereigntyIndex: {
              value: d5AutoValue,
              justification: d5AutoJustification,
              autoFilled: true,
            },
          });
        } else {
          setDims(existingDims);
        }
      } else {
        setDims({
          ...emptyScore(),
          d5_sovereigntyIndex: {
            value: d5AutoValue,
            justification: d5AutoJustification,
          },
        });
      }
    } else {
      const base = emptyForm(processId);
      if (initialDesc) base.description = initialDesc;
      (base as any).requiresClientIT = requiresClientITAuto;
      (base as any).sovereigntyAnalysis = '';
      setForm(base as any);
      setDims({
        ...emptyScore(),
        d5_sovereigntyIndex: {
          value: d5AutoValue,
          justification: d5AutoJustification,
        },
      });
    }
    d1ManualRef.current = false;
    d5ManualRef.current = false;
    setError('');
    setComputeRationale('');
  }, [editUC, processId, open, initialDesc, b2Axes]);

  const set = (field: string, value: unknown) =>
    setForm((f) => ({ ...f, [field]: value }));

  const toggleAiType = (t: AIType) => {
    const current = form.aiTypes ?? [];
    const next = current.includes(t)
      ? current.filter((x) => x !== t)
      : [...current, t];
    if (next.length > 0) set('aiTypes', next);
  };

  const toggleActivity = (id: string) => {
    const current = form.targetActivities ?? [];
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    set('targetActivities', next);
  };

  const addTimeSaved = () => {
    const firstProfile = b1Profiles[0];
    set('timeSavedPerProfile', [
      ...(form.timeSavedPerProfile ?? []),
      {
        profileId: firstProfile?.id ?? crypto.randomUUID(),
        role: firstProfile?.role ?? '',
        hoursPerExecution: 0,
      },
    ]);
  };

  const updateTimeSaved = (
    i: number,
    field: string,
    value: string | number,
  ) => {
    const next = (form.timeSavedPerProfile ?? []).map((e, idx) => {
      if (idx !== i) return e;
      if (field === 'profileId') {
        const prof = b1Profiles.find((p) => p.id === value);
        return { ...e, profileId: value as string, role: prof?.role ?? e.role };
      }
      return { ...e, [field]: value };
    });
    set('timeSavedPerProfile', next);
  };

  const removeTimeSaved = (i: number) =>
    set(
      'timeSavedPerProfile',
      (form.timeSavedPerProfile ?? []).filter((_, idx) => idx !== i),
    );

  const updateDim = (
    key: string,
    field: 'value' | 'justification',
    value: string | number,
  ) => {
    if (key === 'd1_efficiencyImpact' && field === 'value')
      d1ManualRef.current = true;
    if (key === 'd5_sovereigntyIndex' && field === 'value')
      d5ManualRef.current = true;
    setDims((d) => ({
      ...d,
      [key]: { ...d[key as keyof typeof d], [field]: value, autoFilled: false },
    }));
  };

  const total = scoreTotal(dims);
  const cat = scoreCategory(total);

  const targetActivityHours = activities
    .filter((a) => (form.targetActivities ?? []).includes(a.id))
    .reduce((s, a) => s + (a.estimatedTimeHours ?? 0), 0);

  const roi = computeRoi(
    form.timeSavedPerProfile ?? [],
    b1Profiles,
    form.estimatedDevCostEur ?? 0,
    annualReps,
    targetActivityHours,
    computeAnnualCost((form as any).computeCost ?? {}),
  );

  // Auto-fill D1 from efficiency saving % whenever it changes, unless manually overridden
  useEffect(() => {
    if (d1ManualRef.current) return;
    if (roi?.savingPct === null || roi?.savingPct === undefined) return;
    const autoVal = d1FromPct(roi.savingPct);
    const autoJustification = `Auto: ${roi.savingPct}% of targeted activity time saved (${roi.totalHours}h/run × ${annualReps} runs/yr)`;
    setDims((d) => ({
      ...d,
      d1_efficiencyImpact: {
        value: autoVal,
        justification: autoJustification,
        autoFilled: true,
      },
    }));
  }, [roi?.savingPct, roi?.totalHours, annualReps]);

  const handleSave = async () => {
    if (!form.description?.trim()) {
      setError('Description is required.');
      return;
    }
    if (!form.aiTypes?.length) {
      setError('Select at least one AI type.');
      return;
    }
    setSaving(true);
    try {
      const url = editUC
        ? `/api/audits/${auditId}/usecases/${editUC._id}`
        : `/api/audits/${auditId}/usecases`;
      const method = editUC ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          processId,
          targetActivities: form.targetActivities ?? [],
          score: {
            dimensions: dims,
            scoringNotes: '',
            scoredBy: 'consultant',
            scoredAt: new Date().toISOString(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      if (!data || !data._id) throw new Error('Invalid response from server');
      onSaved(data, data.status === 'blocked' && !editUC);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-white shadow-xl flex flex-col max-h-[90vh] rounded-sm">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold text-base">
            {editUC ? 'Edit Use Case' : 'Add Use Case'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 p-5 space-y-5 overflow-y-auto">
          {error && (
            <div className="text-xs text-red-sov bg-red-sov-light rounded p-2">
              {error}
            </div>
          )}

          {/* Description */}
          <div>
            <label className="form-label">
              Description <span className="text-red-sov">*</span>
            </label>
            <textarea
              rows={3}
              className="form-textarea"
              placeholder="Describe the AI opportunity…"
              value={form.description || ''}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          {/* AI Types — multi-select chips */}
          <div>
            <label className="form-label">
              AI Types <span className="text-red-sov">*</span>
            </label>
            <div className="flex flex-wrap gap-2 mt-1">
              {(Object.keys(AI_TYPE_LABELS) as AIType[]).map((t) => {
                const active = (form.aiTypes ?? []).includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleAiType(t)}
                    title={AI_TYPE_LABELS[t].description}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                      active
                        ? 'bg-blue-aria text-white border-blue-aria'
                        : 'border-border text-muted hover:border-blue-aria'
                    }`}
                  >
                    {AI_TYPE_LABELS[t].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target Activities — checklist */}
          <div>
            <label className="form-label">Target Activities (B3)</label>
            {activities.length === 0 ? (
              <p className="text-xs text-muted italic mt-1">
                No activities defined in B3 yet.
              </p>
            ) : (
              <div className="mt-1 space-y-1 max-h-40 overflow-y-auto border border-border rounded p-2">
                {activities.map((a) => {
                  const checked = (form.targetActivities ?? []).includes(a.id);
                  return (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleActivity(a.id)}
                        className="accent-blue-aria"
                      />
                      <span className="text-xs text-text">
                        {a.name || `Activity ${a.order + 1}`}
                      </span>
                      {a.estimatedTimeHours > 0 && (
                        <span className="text-xs text-muted ml-auto">
                          {a.estimatedTimeHours}h/run
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Client IT — read-only, auto-calculated from B2 */}
          <div className="flex items-center justify-between py-1 bg-slate-50 rounded px-2">
            <div>
              <span className="text-sm text-text">
                Requires Client IT approval
              </span>
              <p className="text-[10px] text-muted">
                Auto-calculated from B2 sovereignty level
              </p>
            </div>
            <div
              className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded ${form.requiresClientIT ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}
            >
              {form.requiresClientIT ? '⚠ Yes' : '✓ No'}
            </div>
          </div>

          {/* Time saved per profile */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="form-label mb-0">Time Saved per Profile</label>
              <button
                onClick={addTimeSaved}
                className="text-xs text-blue-aria hover:underline flex items-center gap-1"
              >
                <Plus size={12} />
                Add profile
              </button>
            </div>
            {b1Profiles.length === 0 && (
              <p className="text-xs text-muted italic mb-2">
                No profiles defined in B1 Context yet.
              </p>
            )}
            {(form.timeSavedPerProfile ?? []).map((e, i) => (
              <div key={i} className="flex items-center gap-2 mb-1">
                {b1Profiles.length > 0 ? (
                  <select
                    className="form-input text-xs flex-1"
                    value={e.profileId}
                    onChange={(ev) =>
                      updateTimeSaved(i, 'profileId', ev.target.value)
                    }
                  >
                    {b1Profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.role} ({p.count}× · €{p.hourlyRateEur}/h)
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="form-input text-xs flex-1"
                    placeholder="Role / profile…"
                    value={e.role}
                    onChange={(ev) =>
                      updateTimeSaved(i, 'role', ev.target.value)
                    }
                  />
                )}
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="form-input text-xs w-20"
                  placeholder="h"
                  value={e.hoursPerExecution}
                  onChange={(ev) =>
                    updateTimeSaved(
                      i,
                      'hoursPerExecution',
                      parseFloat(ev.target.value) || 0,
                    )
                  }
                />
                <span className="text-xs text-muted">h/run</span>
                <button
                  onClick={() => removeTimeSaved(i)}
                  className="text-muted hover:text-red-sov"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {/* Dev cost + impl weeks */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Dev Cost — Man-Hours (€)</label>
              <input
                type="number"
                min={0}
                className="form-input"
                value={form.estimatedDevCostEur ?? 0}
                onChange={(e) =>
                  set('estimatedDevCostEur', parseFloat(e.target.value) || 0)
                }
              />
            </div>
            <div>
              <label className="form-label">Impl. Time (weeks)</label>
              <input
                type="number"
                min={0}
                className="form-input"
                value={form.estimatedImplWeeks ?? 0}
                onChange={(e) =>
                  set('estimatedImplWeeks', parseInt(e.target.value) || 0)
                }
              />
            </div>
          </div>
          <div>
            <label className="form-label">Dev Cost Explanation</label>
            <textarea
              rows={2}
              className="form-textarea"
              placeholder="Briefly explain the cost estimate…"
              value={form.devCostExplanation || ''}
              onChange={(e) => set('devCostExplanation', e.target.value)}
            />
          </div>

          {/* Compute Cost Simulator */}
          {(() => {
            const cc = (form as any).computeCost ?? {};
            const setCC = (field: string, value: unknown) =>
              setForm((f) => ({
                ...f,
                computeCost: {
                  ...((f as any).computeCost ?? {}),
                  [field]: value,
                },
              }));
            const model = cc.deploymentModel ?? 'cloud_api';
            const reps = cc.annualReps ?? 0;
            const cu = cc.concurrentUsers ?? 1;
            const avgSec = cc.avgResponseTimeSec ?? 2;
            const autoRec = autoRecommendGpu(reps, cu, avgSec);

            const cloudCost =
              reps > 0
                ? (((cc.inputTokensPerExec ?? 1000) * reps) / 1_000_000) *
                    (cc.pricePerMInputTokens ?? 2) +
                  (((cc.outputTokensPerExec ?? 500) * reps) / 1_000_000) *
                    (cc.pricePerMOutputTokens ?? 6)
                : 0;

            const gpu = GPU_PRESETS[autoRec.gpuModel];
            const nGpus = autoRec.nGpus;
            const totalGpuCost = gpu.priceEur * nGpus;
            const amortization = totalGpuCost / (cc.amortizationYears ?? 4);
            // GPU runs all working hours; power = 30 % idle + 70 % × utilisation (response time drives utilisation)
            const powerFactor = 0.3 + 0.7 * autoRec.utilizationPct;
            const electricity =
              (gpu.tdpW / 1000) *
              nGpus *
              WORKING_HOURS_PER_YEAR *
              powerFactor *
              (cc.electricityRateEur ?? 0.15);
            const maintenance = 0.08 * totalGpuCost;
            const onPremCost = amortization + electricity + maintenance;

            const pct = (cc.onPremPct ?? 70) / 100;
            const hybridCost = onPremCost * pct + cloudCost * (1 - pct);

            const subs: {
              tool: string;
              users: number;
              monthlyPerUser: number;
            }[] = cc.subscriptions ?? [];
            const subscriptionsCost = subs.reduce(
              (s, sub) => s + (sub.users ?? 0) * (sub.monthlyPerUser ?? 0) * 12,
              0,
            );
            const setSubs = (next: typeof subs) => setCC('subscriptions', next);
            const addSub = () =>
              setSubs([...subs, { tool: '', users: 1, monthlyPerUser: 0 }]);
            const removeSub = (i: number) =>
              setSubs(subs.filter((_, idx) => idx !== i));
            const updateSub = (
              i: number,
              field: string,
              value: string | number,
            ) =>
              setSubs(
                subs.map((s, idx) =>
                  idx === i ? { ...s, [field]: value } : s,
                ),
              );

            const infraCost =
              model === 'on_premise'
                ? onPremCost
                : model === 'hybrid'
                  ? hybridCost
                  : cloudCost;
            const activeCost = infraCost + subscriptionsCost;
            const costPerExec = reps > 0 ? activeCost / reps : 0;
            const savingOverCloud =
              model === 'on_premise' && cloudCost > 0
                ? cloudCost - onPremCost
                : null;
            const breakevenMonths =
              cloudCost > electricity + maintenance && cloudCost !== 0
                ? Math.round(
                    totalGpuCost /
                      ((cloudCost - electricity - maintenance) / 12),
                  )
                : null;

            const fmt = (n: number) =>
              n >= 10000
                ? `€${Math.round(n / 1000)}k`
                : `€${Math.round(n).toLocaleString()}`;

            const handleComputeRefresh = async () => {
              setRefreshingCompute(true);
              try {
                const res = await fetch(
                  apiUrl('/api/ai/refresh-compute-estimates'),
                  {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      computeCost: cc,
                      useCaseDescription: form.description,
                      aiTypes: form.aiTypes,
                    }),
                  },
                );
                const data = await res.json();
                if (data.estimates) {
                  const e = data.estimates;
                  if (e.pricePerMInputTokens != null)
                    setCC('pricePerMInputTokens', e.pricePerMInputTokens);
                  if (e.pricePerMOutputTokens != null)
                    setCC('pricePerMOutputTokens', e.pricePerMOutputTokens);
                  if (e.inputTokensPerExec != null)
                    setCC('inputTokensPerExec', e.inputTokensPerExec);
                  if (e.outputTokensPerExec != null)
                    setCC('outputTokensPerExec', e.outputTokensPerExec);
                  if (e.avgResponseTimeSec != null)
                    setCC('avgResponseTimeSec', e.avgResponseTimeSec);
                  if (e.rationale) setComputeRationale(e.rationale);
                }
              } catch {}
              setRefreshingCompute(false);
            };

            return (
              <div className="border border-border rounded p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-text">
                    <span>🖥️</span> Compute Cost Simulator
                  </div>
                  <button
                    onClick={handleComputeRefresh}
                    disabled={refreshingCompute}
                    className="flex items-center gap-1 text-xs text-blue-aria border border-blue-aria rounded px-2 py-1 hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    {refreshingCompute ? (
                      <Spinner size="sm" />
                    ) : (
                      <RefreshCw size={11} />
                    )}
                    {refreshingCompute ? 'Updating…' : 'Update with AI'}
                  </button>
                </div>
                {computeRationale && (
                  <div className="flex items-start gap-1.5 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
                    <Bot size={11} className="mt-0.5 flex-shrink-0" />
                    <span>{computeRationale}</span>
                  </div>
                )}

                {/* Deployment tabs */}
                <div className="flex gap-1 bg-slate-100 rounded p-1">
                  {(['cloud_api', 'on_premise', 'hybrid'] as const).map(
                    (key) => {
                      const label =
                        key === 'cloud_api'
                          ? '☁️ Cloud API'
                          : key === 'on_premise'
                            ? '🖥️ On-Premise'
                            : '⚡ Hybrid';
                      return (
                        <button
                          key={key}
                          onClick={() => setCC('deploymentModel', key)}
                          className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${model === key ? 'bg-white shadow text-text' : 'text-muted hover:text-text'}`}
                        >
                          {label}
                        </button>
                      );
                    },
                  )}
                </div>

                {/* Common: annual reps + response time + concurrency */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="form-label">Annual Executions</label>
                    <input
                      type="number"
                      min={0}
                      className="form-input text-xs"
                      value={cc.annualReps ?? 0}
                      onChange={(e) =>
                        setCC('annualReps', parseInt(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div>
                    <label className="form-label">Avg Response (sec)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className="form-input text-xs"
                      value={cc.avgResponseTimeSec ?? 2}
                      onChange={(e) =>
                        setCC(
                          'avgResponseTimeSec',
                          parseFloat(e.target.value) || 0,
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="form-label">Concurrent Users</label>
                    <input
                      type="number"
                      min={1}
                      className="form-input text-xs"
                      value={cc.concurrentUsers ?? 1}
                      onChange={(e) =>
                        setCC('concurrentUsers', parseInt(e.target.value) || 1)
                      }
                    />
                  </div>
                </div>

                {/* Cloud inputs */}
                {model === 'cloud_api' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="form-label">Input tokens/exec</label>
                        <input
                          type="number"
                          min={0}
                          className="form-input text-xs"
                          value={cc.inputTokensPerExec ?? 1000}
                          onChange={(e) =>
                            setCC(
                              'inputTokensPerExec',
                              parseInt(e.target.value) || 0,
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="form-label">Output tokens/exec</label>
                        <input
                          type="number"
                          min={0}
                          className="form-input text-xs"
                          value={cc.outputTokensPerExec ?? 500}
                          onChange={(e) =>
                            setCC(
                              'outputTokensPerExec',
                              parseInt(e.target.value) || 0,
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="form-label">€/M input tokens</label>
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          className="form-input text-xs"
                          value={cc.pricePerMInputTokens ?? 2}
                          onChange={(e) =>
                            setCC(
                              'pricePerMInputTokens',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="form-label">€/M output tokens</label>
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          className="form-input text-xs"
                          value={cc.pricePerMOutputTokens ?? 6}
                          onChange={(e) =>
                            setCC(
                              'pricePerMOutputTokens',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      <span className="text-[10px] text-muted">Presets:</span>
                      {(
                        [
                          ['Mistral Med.', 2, 6],
                          ['GPT-4o', 5, 15],
                          ['Claude S.', 3, 15],
                        ] as [string, number, number][]
                      ).map(([name, inp, out]) => (
                        <button
                          key={name}
                          onClick={() => {
                            setCC('pricePerMInputTokens', inp);
                            setCC('pricePerMOutputTokens', out);
                          }}
                          className="text-[10px] px-2 py-0.5 border border-border rounded hover:border-blue-aria hover:text-blue-aria transition-colors"
                        >
                          {name} ({inp}/{out})
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* On-premise inputs */}
                {model === 'on_premise' && (
                  <div className="space-y-2">
                    {/* Auto GPU recommendation */}
                    <div className="bg-blue-50 border border-blue-200 rounded p-2.5 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">
                          Auto GPU Sizing
                        </span>
                        <span className="text-xs font-bold text-text">
                          {nGpus}× {gpu.name}
                        </span>
                        <span className="text-[10px] text-muted">
                          {gpu.vramGb}GB VRAM · {gpu.tdpW}W · €
                          {gpu.priceEur.toLocaleString()}/unit
                        </span>
                      </div>
                      <p className="text-[10px] text-muted leading-relaxed">
                        {autoRec.rationale}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="form-label">Amortization (yrs)</label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          className="form-input text-xs"
                          value={cc.amortizationYears ?? 4}
                          onChange={(e) =>
                            setCC(
                              'amortizationYears',
                              parseInt(e.target.value) || 4,
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="form-label">Electricity €/kWh</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="form-input text-xs"
                          value={cc.electricityRateEur ?? 0.15}
                          onChange={(e) =>
                            setCC(
                              'electricityRateEur',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded p-2 text-[10px] text-muted space-y-1">
                      <div className="flex gap-4 flex-wrap">
                        <span>Amortization: {fmt(amortization)}/yr</span>
                        <span>Electricity: {fmt(electricity)}/yr</span>
                        <span>Maintenance: {fmt(maintenance)}/yr</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>GPU load:</span>
                        <div className="flex-1 bg-slate-200 rounded-full h-1.5 max-w-[120px]">
                          <div
                            className="h-1.5 rounded-full bg-blue-aria transition-all"
                            style={{
                              width: `${Math.min(autoRec.utilizationPct * 100, 100).toFixed(1)}%`,
                            }}
                          />
                        </div>
                        <span className="font-medium text-text">
                          {(autoRec.utilizationPct * 100).toFixed(1)}%
                        </span>
                        <span className="text-[9px]">
                          (power factor {(powerFactor * 100).toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Hybrid inputs */}
                {model === 'hybrid' && (
                  <div className="space-y-2">
                    <label className="form-label">
                      On-premise base load: {cc.onPremPct ?? 70}%
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      className="w-full accent-blue-aria"
                      value={cc.onPremPct ?? 70}
                      onChange={(e) =>
                        setCC('onPremPct', parseInt(e.target.value))
                      }
                    />
                    <div className="flex justify-between text-[10px] text-muted">
                      <span>0% (all cloud)</span>
                      <span>100% (all on-prem)</span>
                    </div>
                  </div>
                )}

                {/* Commercial licences / subscriptions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-text uppercase tracking-wide">
                      Commercial Licences / Subscriptions
                    </span>
                    <button
                      onClick={addSub}
                      className="text-[10px] text-blue-aria border border-blue-aria rounded px-2 py-0.5 hover:bg-blue-50 transition-colors flex items-center gap-1"
                    >
                      <Plus size={10} /> Add
                    </button>
                  </div>
                  {subs.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[1fr_64px_72px_64px_20px] gap-1 text-[9px] text-muted uppercase tracking-wide px-1">
                        <span>Tool / Licence</span>
                        <span className="text-right">Users</span>
                        <span className="text-right">€/user/mo</span>
                        <span className="text-right">Annual</span>
                        <span />
                      </div>
                      {subs.map((sub, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-[1fr_64px_72px_64px_20px] gap-1 items-center"
                        >
                          <input
                            className="form-input text-xs py-1"
                            placeholder="e.g. Microsoft Copilot"
                            value={sub.tool}
                            onChange={(e) =>
                              updateSub(i, 'tool', e.target.value)
                            }
                          />
                          <input
                            type="number"
                            min={1}
                            className="form-input text-xs py-1 text-right"
                            value={sub.users}
                            onChange={(e) =>
                              updateSub(
                                i,
                                'users',
                                parseInt(e.target.value) || 1,
                              )
                            }
                          />
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            className="form-input text-xs py-1 text-right"
                            value={sub.monthlyPerUser}
                            onChange={(e) =>
                              updateSub(
                                i,
                                'monthlyPerUser',
                                parseFloat(e.target.value) || 0,
                              )
                            }
                          />
                          <span className="text-[10px] text-muted text-right font-medium">
                            {fmt(sub.users * sub.monthlyPerUser * 12)}
                          </span>
                          <button
                            onClick={() => removeSub(i)}
                            className="text-muted hover:text-red-500 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      <div className="flex justify-end text-xs font-semibold text-text pt-1 border-t border-border/50">
                        Total licences: {fmt(subscriptionsCost)}/yr
                      </div>
                    </div>
                  )}
                </div>

                {/* Results */}
                {(reps > 0 || subscriptionsCost > 0) && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
                    <div className="text-xs font-semibold text-blue-aria">
                      Estimated Annual Costs
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div
                        className={`rounded p-2 ${model === 'cloud_api' ? 'bg-blue-aria text-white' : 'bg-white border border-border'}`}
                      >
                        <div className="text-[10px] opacity-70 uppercase">
                          Cloud API/yr
                        </div>
                        <div className="font-bold">{fmt(cloudCost)}</div>
                      </div>
                      <div
                        className={`rounded p-2 ${model === 'on_premise' ? 'bg-blue-aria text-white' : 'bg-white border border-border'}`}
                      >
                        <div className="text-[10px] opacity-70 uppercase">
                          On-Premise/yr
                        </div>
                        <div className="font-bold">{fmt(onPremCost)}</div>
                      </div>
                    </div>
                    {subscriptionsCost > 0 && (
                      <div className="flex justify-between text-xs border-t border-blue-200 pt-2">
                        <span className="text-muted">+ Licences/yr</span>
                        <span className="font-semibold">
                          {fmt(subscriptionsCost)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs font-bold border-t border-blue-200 pt-1">
                      <span>Total/yr</span>
                      <span className="text-blue-aria">{fmt(activeCost)}</span>
                    </div>
                    <div className="text-xs text-blue-aria font-medium">
                      {fmt(costPerExec)} / execution
                      {breakevenMonths &&
                        model !== 'cloud_api' &&
                        breakevenMonths > 0 && (
                          <span className="ml-2 text-muted font-normal">
                            · On-prem break-even: {breakevenMonths} months
                          </span>
                        )}
                    </div>
                    {savingOverCloud !== null && savingOverCloud > 0 && (
                      <div className="text-[10px] text-green-700">
                        On-prem saves {fmt(savingOverCloud)}/yr vs. cloud
                      </div>
                    )}
                    {savingOverCloud !== null && savingOverCloud < 0 && (
                      <div className="text-[10px] text-amber-700">
                        Cloud is cheaper by {fmt(-savingOverCloud)}/yr at this
                        volume
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ROI estimate */}
          {roi && (
            <div className="bg-slate-50 border border-border rounded p-3 text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-text">
                <TrendingUp size={13} className="text-green-600" />
                ROI Estimate
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-green-50 border border-green-200 rounded p-2">
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">
                    Gross Annual Saving
                  </div>
                  <div className="font-bold text-green-700 text-sm">
                    €{Math.round(roi.annualSaving).toLocaleString()}
                  </div>
                  <div className="text-green-600">
                    {roi.totalHours}h/run × {annualReps} runs/yr
                  </div>
                  {roi.savingPct !== null && (
                    <div className="mt-1 font-semibold text-green-700">
                      {roi.savingPct}% of targeted activities
                    </div>
                  )}
                </div>
                <div
                  className={`rounded p-2 ${roi.computeCostPerYear > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-slate-100 border border-border'}`}
                >
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">
                    Compute Cost/yr
                  </div>
                  <div
                    className={`font-bold text-sm ${roi.computeCostPerYear > 0 ? 'text-amber-700' : 'text-muted'}`}
                  >
                    {roi.computeCostPerYear > 0
                      ? `€${Math.round(roi.computeCostPerYear).toLocaleString()}`
                      : '—'}
                  </div>
                  {roi.computeCostPerYear > 0 && (
                    <div className="text-amber-600">
                      €
                      {(
                        roi.computeCostPerYear / Math.max(annualReps, 1)
                      ).toFixed(3)}
                      /exec
                    </div>
                  )}
                </div>
                <div
                  className={`col-span-2 rounded p-2 ${roi.netAnnualSaving > 0 ? 'bg-teal-50 border border-teal-200' : 'bg-red-50 border border-red-200'}`}
                >
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">
                    Net Annual Saving
                  </div>
                  <div
                    className={`font-bold text-base ${roi.netAnnualSaving > 0 ? 'text-teal-700' : 'text-red-600'}`}
                  >
                    €{Math.round(roi.netAnnualSaving).toLocaleString()}
                  </div>
                  {roi.computeCostPerYear > 0 && (
                    <div className="text-[10px] text-muted">
                      Gross €{Math.round(roi.annualSaving).toLocaleString()} −
                      Compute €
                      {Math.round(roi.computeCostPerYear).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-red-50 border border-red-200 rounded p-2">
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">
                    Dev Cost (one-time)
                  </div>
                  <div className="font-bold text-red-700 text-sm">
                    €{(form.estimatedDevCostEur ?? 0).toLocaleString()}
                  </div>
                  {(form.estimatedImplWeeks ?? 0) > 0 && (
                    <div className="text-red-600">
                      {form.estimatedImplWeeks} weeks impl.
                    </div>
                  )}
                </div>
                {roi.paybackMonths > 0 && (
                  <div className="bg-slate-100 border border-border rounded p-2">
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">
                      Payback Period
                    </div>
                    <div className="font-bold text-text text-sm">
                      {roi.paybackMonths.toFixed(1)} months
                    </div>
                    <div className="text-muted">on net saving</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Inline scoring */}
          <div className="border border-border rounded p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Scoring (B6)</h3>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-lg text-text">
                  {total}/25
                </span>
                <Badge
                  variant={
                    cat === 'Quick Win'
                      ? 'green'
                      : cat === 'Mid-term'
                        ? 'amber'
                        : 'blue'
                  }
                >
                  {cat}
                </Badge>
              </div>
            </div>
            {DIMENSIONS.map(({ key, label, hint, scale }) => {
              const dim = dims[key as keyof typeof dims];
              const isAutoFilled =
                key === 'd1_efficiencyImpact' &&
                (dim as any).autoFilled === true;
              return (
                <div
                  key={key}
                  className={
                    isAutoFilled
                      ? 'bg-green-50 border border-green-200 rounded p-2 -mx-2'
                      : ''
                  }
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-xs font-medium text-text"
                        title={`${hint}\n\n${scale}`}
                      >
                        {label}
                      </span>
                      {isAutoFilled && (
                        <span className="text-[9px] font-semibold text-green-700 bg-green-100 border border-green-300 px-1.5 py-0.5 rounded uppercase tracking-wide">
                          Auto
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((v) => (
                        <button
                          key={v}
                          onClick={() =>
                            updateDim(key, 'value', v as ScoreValue)
                          }
                          title={`${v} — ${scale.split(' · ')[v === 1 ? 0 : v === 3 ? 1 : v === 5 ? 2 : -1] ?? ''}`}
                          className={`w-6 h-6 rounded text-xs font-bold border transition-colors ${
                            dim.value === v
                              ? isAutoFilled
                                ? 'bg-green-600 text-white border-green-600'
                                : 'bg-blue-aria text-white border-blue-aria'
                              : 'border-border text-muted hover:border-blue-aria'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    className="form-input text-xs"
                    placeholder="Justification…"
                    value={dim.justification}
                    onChange={(e) =>
                      updateDim(key, 'justification', e.target.value)
                    }
                  />
                </div>
              );
            })}
          </div>

          <div>
            <label className="form-label">Notes</label>
            <textarea
              rows={6}
              className="form-textarea"
              value={form.notes || ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>

          {/* Sovereignty Analysis */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="form-label mb-0">Sovereignty Analysis</label>
              <button
                onClick={async () => {
                  setAnalyzingSOV(true);
                  try {
                    const res = await fetch(
                      `/api/audits/${auditId}/processes/${processId}/ai/sovereignty-analysis`,
                      {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          useCaseDescription: form.description,
                          aiTypes: form.aiTypes,
                        }),
                      },
                    );
                    const data = await res.json();
                    if (data.analysis)
                      set('sovereigntyAnalysis', data.analysis);
                  } catch {}
                  setAnalyzingSOV(false);
                }}
                disabled={analyzingSOV}
                className="flex items-center gap-1 text-xs text-blue-aria border border-blue-aria rounded px-2 py-1 hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                {analyzingSOV ? <Spinner size="sm" /> : <Sparkles size={11} />}
                {analyzingSOV ? 'Analyzing…' : 'Analyze with AI'}
              </button>
            </div>
            <div className="space-y-1">
              <textarea
                rows={9}
                className="form-textarea"
                placeholder="Describe sovereignty conditions, constraints, and compliance requirements for this use case…"
                value={(form as any).sovereigntyAnalysis || ''}
                onChange={(e) => set('sovereigntyAnalysis', e.target.value)}
              />
              {(form as any).sovereigntyAnalysis && (
                <div className="flex items-center gap-1 text-[10px] text-blue-600">
                  <Bot size={10} />
                  <span>AI-generated — review and edit as needed</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-border flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function UCScore({ uc }: { uc: UseCase }) {
  if (!uc.score?.dimensions)
    return <span className="text-xs text-muted">—</span>;
  const { total, category } = calculateScore(
    uc.score.dimensions as Parameters<typeof calculateScore>[0],
  );
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="font-mono font-bold text-text">{total}/30</span>
      <Badge
        variant={
          category === 'quick_win'
            ? 'green'
            : category === 'mid_term'
              ? 'amber'
              : 'blue'
        }
        className="text-[10px]"
      >
        {category === 'quick_win'
          ? 'Quick Win'
          : category === 'mid_term'
            ? 'Mid-term'
            : 'Strategic'}
      </Badge>
    </div>
  );
}

function UCRoi({
  uc,
  b1Profiles,
  annualReps,
  activities,
}: {
  uc: UseCase;
  b1Profiles: ProfileEntry[];
  annualReps: number;
  activities: ProcessActivity[];
}) {
  const targetHours = activities
    .filter((a) => (uc.targetActivities ?? []).includes(a.id))
    .reduce((s, a) => s + (a.estimatedTimeHours ?? 0), 0);
  const ccPerYear = computeAnnualCost((uc as any).computeCost ?? {});
  const roi = computeRoi(
    uc.timeSavedPerProfile ?? [],
    b1Profiles,
    uc.estimatedDevCostEur ?? 0,
    annualReps,
    targetHours,
    ccPerYear,
  );
  if (!roi) return <span className="text-xs text-muted">—</span>;
  return (
    <div className="text-xs space-y-0.5">
      <div className="flex items-center gap-1 text-green-600">
        <TrendingUp size={10} />
        <span className="font-medium">
          Net: €{Math.round(roi.netAnnualSaving).toLocaleString()}/yr
        </span>
      </div>
      {roi.computeCostPerYear > 0 && (
        <div className="text-amber-600">
          Compute: −€{Math.round(roi.computeCostPerYear).toLocaleString()}/yr
        </div>
      )}
      {roi.savingPct !== null && (
        <div className="text-muted">
          {roi.savingPct}% of targeted activities
        </div>
      )}
      {roi.paybackMonths > 0 && (
        <div className="text-muted">
          Payback: {roi.paybackMonths.toFixed(1)} mo
        </div>
      )}
    </div>
  );
}

export default function B5Page() {
  const { auditId, procId } = useParams<{ auditId: string; procId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [activities, setActivities] = useState<ProcessActivity[]>([]);
  const [b1Profiles, setB1Profiles] = useState<ProfileEntry[]>([]);
  const [annualReps, setAnnualReps] = useState(0);
  const [processName, setProcessName] = useState('');
  const [b2Axes, setB2Axes] = useState<Record<string, any>>({});
  const [filter, setFilter] = useState<
    'all' | 'eligible' | 'blocked' | 'pending_review'
  >('all');
  const [slideOver, setSlideOver] = useState(false);
  const [editUC, setEditUC] = useState<UseCase | null>(null);
  const [initialDesc, setInitialDesc] = useState('');
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    uc: UseCase | null;
  }>({ open: false, uc: null });
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);
  const [generateModal, setGenerateModal] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(
    new Set(),
  );
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    const [procRes, ucRes] = await Promise.all([
      fetch(apiUrl(`/api/audits/${auditId}/processes/${procId}`), {
        credentials: 'include',
      }),
      fetch(apiUrl(`/api/audits/${auditId}/usecases?processId=${procId}`), {
        credentials: 'include',
      }),
    ]);
    const proc = await procRes.json();
    const ucs = await ucRes.json();
    setProcessName(proc.name || '');
    const acts: ProcessActivity[] = proc.b3?.activities || [];
    setActivities(acts);
    setB1Profiles(proc.b1?.profiles || []);
    setAnnualReps(proc.b3?.annualRepetitions ?? 0);
    setB2Axes(proc.b2?.axes ?? {});
    setUseCases(Array.isArray(ucs) ? ucs : []);
    setLoading(false);
  }, [auditId, procId]);

  useEffect(() => {
    load();
  }, [load]);

  // Handle ?newUC=1&desc=... from B3 "Create UC" button
  useEffect(() => {
    if (searchParams?.get('newUC') === '1') {
      const desc = searchParams.get('desc')
        ? decodeURIComponent(searchParams.get('desc')!)
        : '';
      setInitialDesc(desc);
      setEditUC(null);
      setSlideOver(true);
    }
  }, [searchParams]);

  // Handle ?edit={ucId} — only open once per editId to avoid reopening after useCases state update
  const openedEditIdRef = useRef<string | null>(null);
  useEffect(() => {
    const editId = searchParams?.get('edit');
    if (editId && editId !== openedEditIdRef.current && useCases.length > 0) {
      const uc = useCases.find((u) => u._id === editId);
      if (uc) {
        openedEditIdRef.current = editId;
        setEditUC(uc);
        setInitialDesc('');
        setSlideOver(true);
      }
    }
    if (!editId) openedEditIdRef.current = null;
  }, [searchParams, useCases]);

  const handleSaved = (uc: UseCase, blocked: boolean) => {
    setUseCases((prev) => {
      const idx = prev.findIndex((u) => u._id === uc._id);
      return idx >= 0
        ? prev.map((u) => (u._id === uc._id ? uc : u))
        : [...prev, uc];
    });
    if (blocked) {
      setBlockedNotice(
        'This use case has been automatically moved to Blocked due to B2 restrictions.',
      );
      setTimeout(() => setBlockedNotice(null), 5000);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.uc) return;
    await fetch(
      apiUrl(`/api/audits/${auditId}/usecases/${deleteModal.uc._id}`),
      {
        method: 'DELETE',
        credentials: 'include',
      },
    );
    setUseCases((prev) => prev.filter((u) => u._id !== deleteModal.uc!._id));
    setDeleteModal({ open: false, uc: null });
  };

  const createPOC = (uc: UseCase) => {
    router.push(
      `/audits/${auditId}/pocs/new?useCaseId=${uc._id}&processId=${procId}`,
    );
  };

  const filtered =
    filter === 'all' ? useCases : useCases.filter((u) => u.status === filter);
  const counts = {
    all: useCases.length,
    eligible: useCases.filter((u) => u.status === 'eligible').length,
    blocked: useCases.filter((u) => u.status === 'blocked').length,
    pending_review: useCases.filter((u) => u.status === 'pending_review')
      .length,
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-muted hover:text-text"
          >
            <ArrowLeft size={18} />
          </button>
          <Badge variant="blue">B4</Badge>
          <h1 className="text-xl font-display font-bold text-text">
            AI Opportunities
          </h1>
          <span className="text-muted text-sm">— {processName}</span>
          {useCases.length > 0 && (
            <Badge variant="green">
              <CheckCircle2 size={12} className="mr-1" />
              Complete
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSuggestions([]);
              setSelectedSuggestions(new Set());
              setGenerateModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-aria border border-blue-aria rounded-sm hover:bg-blue-50 transition-colors"
          >
            <Sparkles size={13} /> Generate with AI
          </button>
          <button
            onClick={() => {
              setEditUC(null);
              setInitialDesc('');
              setSlideOver(true);
            }}
            className="btn-primary flex items-center gap-1"
          >
            <Plus size={14} /> Add Use Case
          </button>
        </div>
      </div>

      {blockedNotice && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-red-sov-light text-red-sov rounded text-sm">
          <AlertTriangle size={16} />
          {blockedNotice}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-white rounded-md border border-border p-1 w-fit">
        {(['all', 'eligible', 'blocked', 'pending_review'] as const).map(
          (f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors capitalize ${filter === f ? 'bg-blue-aria text-white' : 'text-muted hover:text-text'}`}
            >
              {f === 'pending_review' ? 'Pending' : f} ({counts[f]})
            </button>
          ),
        )}
      </div>

      {/* Use case table */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-muted text-sm">
          {filter === 'all'
            ? 'No use cases yet. Click "Add Use Case" to identify AI opportunities.'
            : `No ${filter} use cases.`}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50 text-left text-xs text-muted">
                <th className="px-3 py-2.5 font-medium w-20">ID</th>
                <th className="px-3 py-2.5 font-medium">Description</th>
                <th className="px-3 py-2.5 font-medium w-36">AI Types</th>
                <th className="px-3 py-2.5 font-medium w-20 text-center">
                  People
                </th>
                <th className="px-3 py-2.5 font-medium w-28">Score</th>
                <th className="px-3 py-2.5 font-medium w-28">ROI</th>
                <th className="px-3 py-2.5 font-medium w-28">Status</th>
                <th className="px-3 py-2.5 font-medium w-24 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((uc) => {
                const aiTypes: AIType[] = uc.aiTypes?.length
                  ? uc.aiTypes
                  : [(uc as any).aiType].filter(Boolean);
                return (
                  <tr
                    key={uc._id}
                    className={`hover:bg-slate-50 transition-colors ${uc.status === 'blocked' ? 'opacity-70' : ''}`}
                  >
                    <td className="px-3 py-3">
                      <button
                        onClick={() => {
                          setEditUC(uc);
                          setInitialDesc('');
                          setSlideOver(true);
                        }}
                        className="font-mono text-xs text-blue-aria font-medium hover:underline cursor-pointer"
                      >
                        {uc.cuId}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-text line-clamp-2">
                        {uc.description}
                      </p>
                      {uc.status === 'blocked' && uc.blockedReason && (
                        <div className="mt-1 flex items-start gap-1 text-xs text-red-sov">
                          <AlertTriangle
                            size={10}
                            className="mt-0.5 flex-shrink-0"
                          />
                          {uc.blockedReason}
                        </div>
                      )}
                      {uc.requiresClientIT && (
                        <div className="mt-1 text-xs text-amber-sov">
                          Client IT required
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {aiTypes.map((t) => (
                          <Badge
                            key={t}
                            variant={AI_TYPE_COLORS[t] ?? 'slate'}
                            className="text-[10px]"
                          >
                            {AI_TYPE_LABELS[t]?.label ?? t}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {(() => {
                        const total = (uc.timeSavedPerProfile ?? []).reduce(
                          (sum, e) => {
                            const p = b1Profiles.find(
                              (p) => p.id === e.profileId,
                            );
                            return sum + (p?.count ?? 0);
                          },
                          0,
                        );
                        return total > 0 ? (
                          <span className="font-bold text-text text-sm">
                            {total}
                          </span>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-3">
                      <UCScore uc={uc} />
                    </td>
                    <td className="px-3 py-3">
                      <UCRoi
                        uc={uc}
                        b1Profiles={b1Profiles}
                        annualReps={annualReps}
                        activities={activities}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={STATUS_VARIANTS[uc.status]}>
                        {uc.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {uc.status === 'eligible' && (
                          <button
                            onClick={() => createPOC(uc)}
                            title="Create POC"
                            className="text-muted hover:text-blue-aria p-1"
                          >
                            <FlaskConical size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditUC(uc);
                            setInitialDesc('');
                            setSlideOver(true);
                          }}
                          className="text-muted hover:text-blue-aria p-1"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => setDeleteModal({ open: true, uc })}
                          className="text-muted hover:text-red-sov p-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SlideOver
        open={slideOver}
        onClose={() => {
          setSlideOver(false);
          setEditUC(null);
          setInitialDesc('');
          openedEditIdRef.current = null;
          const hasParam =
            searchParams?.get('edit') || searchParams?.get('newUC');
          if (hasParam)
            router.replace(`/audits/${auditId}/processes/${procId}/b5`);
        }}
        processId={procId}
        auditId={auditId}
        activities={activities}
        b1Profiles={b1Profiles}
        annualReps={annualReps}
        editUC={editUC}
        onSaved={handleSaved}
        initialDesc={initialDesc}
        b2Axes={b2Axes}
      />

      {/* Generate UCs with AI modal */}
      {generateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setGenerateModal(false)}
          />
          <div className="relative w-full max-w-2xl bg-white shadow-xl flex flex-col max-h-[85vh] rounded-sm">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-blue-aria" />
                <h2 className="font-semibold text-base">
                  Generate Use Cases with AI
                </h2>
              </div>
              <button
                onClick={() => setGenerateModal(false)}
                className="text-muted hover:text-text"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <p className="text-sm text-muted">
                AI will analyze the process context (B1 profiles, B2
                sovereignty, B3 activities) and suggest AI use cases.
              </p>
              <button
                onClick={async () => {
                  setGenerating(true);
                  setSuggestions([]);
                  setSelectedSuggestions(new Set());
                  try {
                    const res = await fetch(
                      `/api/audits/${auditId}/ai/suggest-usecases`,
                      {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ processId: procId }),
                      },
                    );
                    const data = await res.json();
                    if (data.suggestions) setSuggestions(data.suggestions);
                  } catch {}
                  setGenerating(false);
                }}
                disabled={generating}
                className="btn-primary flex items-center gap-2"
              >
                {generating ? <Spinner size="sm" /> : <Bot size={14} />}
                {generating ? 'Analyzing process…' : 'Analyze & Suggest'}
              </button>

              {suggestions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text">
                      {suggestions.length} suggestions
                    </span>
                    <button
                      onClick={() =>
                        setSelectedSuggestions(
                          selectedSuggestions.size === suggestions.length
                            ? new Set()
                            : new Set(suggestions.map((_, i) => i)),
                        )
                      }
                      className="text-xs text-blue-aria hover:underline"
                    >
                      {selectedSuggestions.size === suggestions.length
                        ? 'Deselect all'
                        : 'Select all'}
                    </button>
                  </div>
                  {suggestions.map((s, i) => {
                    const selected = selectedSuggestions.has(i);
                    const total = s.score
                      ? Object.entries(s.score)
                          .filter(([k]) => k !== 'd6_governanceComplexity')
                          .reduce((sum: number, [, d]: any) => sum + d.value, 0)
                      : null;
                    return (
                      <div
                        key={i}
                        onClick={() => {
                          const next = new Set(selectedSuggestions);
                          if (selected) next.delete(i);
                          else next.add(i);
                          setSelectedSuggestions(next);
                        }}
                        className={`border rounded p-3 cursor-pointer transition-colors ${selected ? 'border-blue-aria bg-blue-50' : 'border-border hover:border-blue-aria/50'}`}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            readOnly
                            className="mt-0.5 accent-blue-aria"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text">{s.description}</p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {(s.aiTypes ?? []).map((t: string) => (
                                <Badge
                                  key={t}
                                  variant={
                                    (AI_TYPE_COLORS as any)[t] ?? 'slate'
                                  }
                                  className="text-[10px]"
                                >
                                  {AI_TYPE_LABELS[t as AIType]?.label ?? t}
                                </Badge>
                              ))}
                              {total !== null && (
                                <span className="text-[10px] font-mono font-bold text-muted ml-auto">
                                  {total}/25
                                </span>
                              )}
                            </div>
                            {s.notes && (
                              <p className="text-[10px] text-muted mt-1 italic">
                                {s.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {suggestions.length > 0 && (
              <div className="p-5 border-t border-border flex items-center justify-between gap-3">
                <span className="text-sm text-muted">
                  {selectedSuggestions.size} selected
                </span>
                <button
                  onClick={async () => {
                    if (selectedSuggestions.size === 0) return;
                    setImporting(true);
                    try {
                      const toImport = Array.from(selectedSuggestions).map(
                        (i) => suggestions[i],
                      );
                      for (const s of toImport) {
                        const score = s.score
                          ? {
                              dimensions: s.score,
                              scoringNotes: '',
                              scoredBy: 'ai',
                              scoredAt: new Date().toISOString(),
                            }
                          : undefined;
                        await fetch(apiUrl(`/api/audits/${auditId}/usecases`), {
                          method: 'POST',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            description: s.description,
                            aiTypes: s.aiTypes ?? [],
                            targetActivities: [],
                            timeSavedPerProfile: s.timeSavedPerProfile ?? [],
                            estimatedDevCostEur: s.estimatedDevCostEur ?? 0,
                            estimatedImplWeeks: s.estimatedImplWeeks ?? 0,
                            notes: s.notes ?? '',
                            processId: procId,
                            score,
                          }),
                        });
                      }
                      await load();
                      setGenerateModal(false);
                    } catch {}
                    setImporting(false);
                  }}
                  disabled={importing || selectedSuggestions.size === 0}
                  className="btn-primary flex items-center gap-2"
                >
                  {importing ? <Spinner size="sm" /> : <Plus size={14} />}
                  {importing
                    ? 'Importing…'
                    : `Import ${selectedSuggestions.size} selected`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModal.open}
        title="Delete use case?"
        message={`Are you sure you want to delete "${deleteModal.uc?.cuId}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onClose={() => setDeleteModal({ open: false, uc: null })}
      />
    </div>
  );
}
