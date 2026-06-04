'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Plus, X, Pencil, Trash2, CheckCircle2, ArrowLeft, AlertTriangle, FlaskConical, TrendingUp, Bot, RefreshCw, Sparkles, Archive, ArchiveRestore } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useBeforeUnload } from '@/hooks/useBeforeUnload';
import type { UseCase, AIType, ProcessActivity, TimeSavedEntry, ScoreValue, ProfileEntry, ComputeBreakdown } from '@/lib/types';
import { AI_TYPE_LABELS } from '@/lib/types';
import { calculateSovereigntyIndex, calculateScore, computeAnnualCompute } from '@/lib/calculations';
import { ComputeCalculator, DEFAULT_COMPUTE_BREAKDOWN } from '@/components/cost/ComputeCalculator';
import { ProgressIndicator } from '@/components/ai/ProgressIndicator';

const AI_TYPE_COLORS: Record<AIType, 'purple' | 'blue' | 'teal' | 'amber' | 'green' | 'slate'> = {
  generative_llm: 'purple', extraction_nlp: 'blue', classification_ml: 'teal',
  rag_semantic: 'blue', rag_lexical: 'blue', knowledge_graph: 'purple',
  validation: 'amber', prediction_ml: 'green', intelligent_automation: 'teal',
  agentic_ai_workflow: 'purple', mcp_client: 'teal', mcp_server: 'teal',
  function_tool: 'slate', chatbot: 'blue', multimodal_vlm: 'purple', other: 'slate',
};
const STATUS_VARIANTS: Record<string, 'green' | 'red' | 'amber' | 'slate'> = {
  eligible: 'green', blocked: 'red', pending_review: 'amber',
};

const DIMENSIONS: { key: string; label: string; hint: string; scale: string }[] = [
  { key: 'd1_efficiencyImpact', label: 'D1 Efficiency', hint: 'How much does AI improve speed or reduce manual effort?', scale: '1 = <10% saving · 3 = 20–35% · 5 = >50%' },
  { key: 'd2_qualityImpact', label: 'D2 Quality', hint: 'Does AI reduce errors or improve output quality?', scale: '1 = Marginal · 3 = Reduces rework significantly · 5 = Full consistency guaranteed' },
  { key: 'd3_techMaturity', label: 'D3 Tech Maturity', hint: 'How mature is the AI technology for this use case?', scale: '1 = Experimental · 3 = Pilot · 5 = Market standard' },
  { key: 'd4_dataReadiness', label: 'D4 Data Readiness', hint: 'Is the data available, clean, and accessible?', scale: "1 = Doesn't exist · 3 = Available with effort · 5 = Structured & clean" },
  { key: 'd5_sovereigntyIndex', label: 'D5 Sovereignty', hint: 'Compliance with sovereignty constraints (auto-filled from B2)', scale: '1 = Critical · 2 = Restricted · 3 = Conditioned · 4 = Managed · 5 = Full Autonomy' },
];

const SUGGEST_USECASES_STEPS = [
  { text: 'Analyzing process context...', startPercent: 0, endPercent: 20 },
  { text: 'Loading knowledge base...', startPercent: 20, endPercent: 40 },
  { text: 'Generating use case proposals...', startPercent: 40, endPercent: 90 },
  { text: 'Finalizing suggestions...', startPercent: 90, endPercent: 100 },
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
    full_autonomy: 5, managed: 4, conditioned: 3, restricted: 2, critical: 1,
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

function emptyForm(processId: string): Partial<UseCase> & { aiTypes: AIType[]; timeSavedPerProfile: TimeSavedEntry[]; targetActivities: string[] } {
  return {
    description: '',
    aiTypes: ['generative_llm'],
    targetActivities: [],
    requiresClientIT: false,
    timeSavedPerProfile: [],
    estimatedDevCostEur: 0,
    devCostExplanation: '',
    devRateEur: 450,
    nDevs: 1,
    estimatedImplWeeks: 0,
    requiredPreconditions: { requiresClientIT: false, text: '' },
    computeBreakdown: { ...DEFAULT_COMPUTE_BREAKDOWN, mode: '' },
    processId,
  };
}

function computeRoi(
  timeSaved: TimeSavedEntry[],
  b1Profiles: ProfileEntry[],
  devCost: number,
  annualReps: number,
  targetHours: number,
  computeCostPerYear: number = 0,
): { totalHours: number; annualSaving: number; computeCostPerYear: number; netAnnualSaving: number; paybackMonths: number; savingPct: number | null; avgRate: number; targetHours: number } | null {
  const totalHours = timeSaved.reduce((s, e) => s + (e.hoursPerExecution ?? 0), 0);
  if (totalHours === 0 || annualReps === 0) return null;
  const weightedSum = timeSaved.reduce((sum, e) => {
    const profile = b1Profiles.find(p => p.id === e.profileId);
    if (!profile || !profile.hourlyRateEur) return sum;
    return sum + (profile.count ?? 1) * profile.hourlyRateEur;
  }, 0);
  const totalCount = timeSaved.reduce((sum, e) => {
    const profile = b1Profiles.find(p => p.id === e.profileId);
    return sum + (profile?.count ?? 1);
  }, 0);
  const avgRate = totalCount > 0 ? weightedSum / totalCount : 0;
  if (avgRate === 0) return null;
  const annualSaving = totalHours * avgRate * annualReps;
  const netAnnualSaving = Math.max(annualSaving - computeCostPerYear, 0);
  const paybackMonths = devCost > 0 && netAnnualSaving > 0 ? (devCost / netAnnualSaving) * 12 : 0;
  const savingPct = targetHours > 0 ? Math.round((totalHours / targetHours) * 100) : null;
  return { totalHours, annualSaving, computeCostPerYear, netAnnualSaving, paybackMonths, savingPct, avgRate, targetHours };
}

function SlideOver({
  open, onClose, processId, auditId, activities, b1Profiles, annualReps, editUC, onSaved, initialDesc, b2Axes,
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
  type FormType = Partial<UseCase> & { aiTypes: AIType[]; timeSavedPerProfile: TimeSavedEntry[]; targetActivities: string[]; sovereigntyAnalysis?: string };
  const [form, setForm] = useState<FormType>(emptyForm(processId));
  const [originalForm, setOriginalForm] = useState<FormType>(emptyForm(processId));
  const [dims, setDims] = useState(emptyScore());
  const [originalDims, setOriginalDims] = useState(emptyScore());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [analyzingSOV, setAnalyzingSOV] = useState(false);
  const [refreshingCompute, setRefreshingCompute] = useState(false);
  const [computeRationale, setComputeRationale] = useState('');
  const [devCostRationale, setDevCostRationale] = useState('');
  const [isPhase2Visible, setIsPhase2Visible] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [phase1ChangeDetected, setPhase1ChangeDetected] = useState(false);
  const d1ManualRef = useRef(false);
  const d5ManualRef = useRef(false);

  useEffect(() => {
    // Compute D5 autofill from B2 axes
    let d5AutoValue: ScoreValue = 3;
    let d5AutoJustification = '';
    let requiresClientITAuto = false;
    if (b2Axes && Object.keys(b2Axes).length > 0) {
      try {
        const sovResult = calculateSovereigntyIndex(b2Axes);
        d5AutoValue = sovereigntyLevelToD5(sovResult.level);
        const LEVEL_LABELS: Record<string, string> = {
          full_autonomy: 'Full Autonomy', managed: 'Managed', conditioned: 'Conditioned',
          restricted: 'Restricted', critical: 'Critical',
        };
        d5AutoJustification = `Auto from B2: ${LEVEL_LABELS[sovResult.level] ?? sovResult.level} (index ${sovResult.index.toFixed(2)}/5)`;
        requiresClientITAuto = sovResult.level === 'restricted' || sovResult.level === 'critical';
      } catch {}
    }

    if (editUC) {
      const defaultCB = emptyForm(processId).computeBreakdown as ComputeBreakdown;
      // Backwards compatibility: requiredPreconditions.text from notes or sovereigntyAnalysis
      const preconditionsText = (editUC as any).requiredPreconditions?.text || (editUC as any).notes || (editUC as any).sovereigntyAnalysis || '';
      const newForm = {
        ...editUC,
        aiTypes: editUC.aiTypes?.length ? editUC.aiTypes : [(editUC as any).aiType ?? 'generative_llm'],
        timeSavedPerProfile: editUC.timeSavedPerProfile ?? [],
        targetActivities: editUC.targetActivities?.length
          ? editUC.targetActivities
          : (editUC as any).targetActivity
          ? [(editUC as any).targetActivity]
          : [],
        computeBreakdown: {
          ...defaultCB,
          ...((editUC as any).computeBreakdown ?? {}),
          annualReps: (editUC as any).computeBreakdown?.annualReps ?? annualReps,
          annualRepsManuallyEdited: ((editUC as any).computeBreakdown?.annualReps ?? annualReps) !== annualReps,
        },
        requiresClientIT: requiresClientITAuto,
        requiredPreconditions: {
          requiresClientIT: (editUC as any).requiredPreconditions?.requiresClientIT ?? requiresClientITAuto,
          text: preconditionsText,
        },
        sovereigntyAnalysis: (editUC as any).sovereigntyAnalysis ?? '',
      };
      setForm(newForm);
      setOriginalForm(newForm);
      if (editUC.score?.dimensions) {
        const existingDims = editUC.score.dimensions as any;
        // Re-autofill D5 unless manually edited
        if (!d5ManualRef.current) {
          const newDims = { ...existingDims, d5_sovereigntyIndex: { value: d5AutoValue, justification: d5AutoJustification, autoFilled: true } };
          setDims(newDims);
          setOriginalDims(newDims);
        } else {
          setDims(existingDims);
          setOriginalDims(existingDims);
        }
      } else {
        const newDims = { ...emptyScore(), d5_sovereigntyIndex: { value: d5AutoValue, justification: d5AutoJustification, autoFilled: true } };
        setDims(newDims);
        setOriginalDims(newDims);
      }
    } else {
      const base = emptyForm(processId);
      if (initialDesc) base.description = initialDesc;
      (base as any).requiresClientIT = requiresClientITAuto;
      (base as any).requiredPreconditions = { requiresClientIT: requiresClientITAuto, text: '' };
      (base as any).sovereigntyAnalysis = '';
      (base as any).computeBreakdown = { ...DEFAULT_COMPUTE_BREAKDOWN, mode: '', annualReps };
      setForm(base as any);
      setOriginalForm(base as any);
      const newDims = { ...emptyScore(), d5_sovereigntyIndex: { value: d5AutoValue, justification: d5AutoJustification, autoFilled: true } };
      setDims(newDims);
      setOriginalDims(newDims);
    }
    d1ManualRef.current = false;
    d5ManualRef.current = false;
    setError('');
    setComputeRationale('');
    setIsPhase2Visible(false);
  }, [editUC, processId, open, initialDesc, b2Axes]);

  // Auto-derive timeSavedPerProfile from targetActivities changes
  useEffect(() => {
    if (!form.targetActivities?.length) {
      set('timeSavedPerProfile', []);
      return;
    }

    // Extract profiles from B3 activities matching targetActivities
    const derivedProfiles = (form.targetActivities ?? [])
      .flatMap(actId => {
        const activity = activities.find(a => a.id === actId);
        return (activity?.profileHours ?? []).map(ph => ({
          profileId: ph.profileId,
          role: ph.role,
          hoursPerExecution: 0,
        }));
      })
      // Merge duplicates by profileId
      .reduce((acc, entry) => {
        const existing = acc.find(e => e.profileId === entry.profileId);
        if (!existing) acc.push(entry);
        return acc;
      }, [] as typeof form.timeSavedPerProfile);

    // Preserve existing hoursPerExecution for profiles that remain
    const merged = derivedProfiles.map(derived => {
      const existing = form.timeSavedPerProfile?.find(
        e => e.profileId === derived.profileId
      );
      return existing ?? derived;
    });

    // Only update if profiles actually changed (prevent infinite loop)
    const currentIds = (form.timeSavedPerProfile ?? []).map(e => e.profileId).sort().join(',');
    const mergedIds = merged.map(e => e.profileId).sort().join(',');
    if (currentIds !== mergedIds) {
      set('timeSavedPerProfile', merged);
    }
  }, [form.targetActivities, activities]);

  const set = (field: string, value: unknown) => setForm(f => ({ ...f, [field]: value }));

  const toggleAiType = (t: AIType) => {
    const current = form.aiTypes ?? [];
    const next = current.includes(t) ? current.filter(x => x !== t) : [...current, t];
    if (next.length > 0) set('aiTypes', next);
  };

  const toggleActivity = (id: string) => {
    const current = form.targetActivities ?? [];
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    set('targetActivities', next);
  };

  const addTimeSaved = () => {
    const firstProfile = b1Profiles[0];
    set('timeSavedPerProfile', [...(form.timeSavedPerProfile ?? []), {
      profileId: firstProfile?.id ?? crypto.randomUUID(),
      role: firstProfile?.role ?? '',
      hoursPerExecution: 0,
    }]);
  };

  const updateTimeSaved = (i: number, field: string, value: string | number) => {
    const next = (form.timeSavedPerProfile ?? []).map((e, idx) => {
      if (idx !== i) return e;
      if (field === 'profileId') {
        const prof = b1Profiles.find(p => p.id === value);
        return { ...e, profileId: value as string, role: prof?.role ?? e.role };
      }
      return { ...e, [field]: value };
    });
    set('timeSavedPerProfile', next);
  };

  const removeTimeSaved = (i: number) =>
    set('timeSavedPerProfile', (form.timeSavedPerProfile ?? []).filter((_, idx) => idx !== i));

  const updateDim = (key: string, field: 'value' | 'justification', value: string | number) => {
    if (key === 'd1_efficiencyImpact' && field === 'value') d1ManualRef.current = true;
    if (key === 'd5_sovereigntyIndex' && field === 'value') d5ManualRef.current = true;
    setDims(d => ({ ...d, [key]: { ...d[key as keyof typeof d], [field]: value, autoFilled: false } }));
  };

  const total = scoreTotal(dims);
  const cat = scoreCategory(total);

  const targetActivityHours = activities
    .filter(a => (form.targetActivities ?? []).includes(a.id))
    .reduce((s, a) => s + (a.estimatedTimeHours ?? 0), 0);

  const roi = computeRoi(
    form.timeSavedPerProfile ?? [],
    b1Profiles,
    form.estimatedDevCostEur ?? 0,
    annualReps,
    targetActivityHours,
    computeAnnualCompute((form as any).computeBreakdown ?? null).totalEur,
  );

  // Auto-fill D1 from efficiency saving % whenever it changes, unless manually overridden
  useEffect(() => {
    if (d1ManualRef.current) return;
    if (roi?.savingPct === null || roi?.savingPct === undefined) return;
    const autoVal = d1FromPct(roi.savingPct);
    const autoJustification = `Auto: ${roi.savingPct}% of targeted activity time saved (${roi.totalHours}h/run × ${annualReps} runs/yr)`;
    setDims(d => ({
      ...d,
      d1_efficiencyImpact: { value: autoVal, justification: autoJustification, autoFilled: true },
    }));
  }, [roi?.savingPct, roi?.totalHours, annualReps]);

  // Detect Phase 1 changes
  useEffect(() => {
    try {
      const hasPhase1Changes =
        form.description !== originalForm.description ||
        JSON.stringify(form.aiTypes ?? []) !== JSON.stringify(originalForm.aiTypes ?? []) ||
        JSON.stringify(form.targetActivities ?? []) !== JSON.stringify(originalForm.targetActivities ?? []) ||
        form.requiredPreconditions?.requiresClientIT !== originalForm.requiredPreconditions?.requiresClientIT ||
        form.requiredPreconditions?.text !== originalForm.requiredPreconditions?.text ||
        JSON.stringify(dims ?? {}) !== JSON.stringify(originalDims ?? {});

      setPhase1ChangeDetected(hasPhase1Changes);
    } catch (err) {
      console.error('[Phase1ChangeDetection]', err);
      setPhase1ChangeDetected(false);
    }
  }, [form, originalForm, dims, originalDims]);

  const handleSave_Phase1 = async () => {
    if (!form.description?.trim()) { setError('Description is required.'); return; }
    if (!form.aiTypes?.length) { setError('Select at least one AI type.'); return; }
    setSaving(true);
    try {
      const url = editUC ? `/api/audits/${auditId}/usecases/${editUC._id}` : `/api/audits/${auditId}/usecases`;
      const method = editUC ? 'PATCH' : 'POST';
      const bodyData = {
        ...form,
        processId,
        targetActivities: form.targetActivities ?? [],
        score: {
          dimensions: dims ?? {},
          scoringNotes: '',
          scoredBy: 'consultant',
          scoredAt: new Date().toISOString(),
        },
      };

      let bodyStr = '';
      try {
        bodyStr = JSON.stringify(bodyData);
        if (!bodyStr) throw new Error('Failed to serialize form data');
      } catch (jsonErr) {
        throw new Error(`Form serialization failed: ${jsonErr instanceof Error ? jsonErr.message : 'Unknown error'}`);
      }

      const res = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
      });

      let data;
      try {
        const text = await res.text();
        if (!text) throw new Error('Empty response from server');
        data = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(`Server response parse failed: ${parseErr instanceof Error ? parseErr.message : 'Invalid JSON'}`);
      }

      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      if (!data || !data._id) throw new Error('Invalid response from server');

      // Update form with saved data in case it was a new UC
      setForm(data);
      setOriginalForm(data);
      setError('');
      setPhase1ChangeDetected(false);

      // Recalculate Phase 2 with LLM
      setIsRecalculating(true);
      try {
        const recalcRes = await fetch(
          `/api/audits/${auditId}/usecases/${data._id}/ai/recalculate`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              description: data.description,
              aiTypes: data.aiTypes,
              targetActivities: data.targetActivities,
              requiredPreconditions: data.requiredPreconditions,
              devRateEur: form.devRateEur ?? data.devRateEur ?? 450,
              estimatedImplWeeks: form.estimatedImplWeeks ?? data.estimatedImplWeeks ?? 0,
              nDevs: form.nDevs ?? data.nDevs ?? 1,
              score: { dimensions: dims },
            }),
          }
        );

        if (!recalcRes.ok) {
          throw new Error((await recalcRes.json())?.error ?? 'Recalculation failed');
        }

        const result = await recalcRes.json();

        // Map roles to profileIds and consolidate duplicates (same logic as import handler)
        const mapped = (result.timeSavedPerProfile ?? []).map((entry: any) => {
          const matched = b1Profiles.find(
            p => p.role.toLowerCase().trim() === entry.role?.toLowerCase().trim()
          );
          return {
            profileId: matched?.id ?? crypto.randomUUID(),
            role: matched?.role ?? entry.role ?? '',
            hoursPerExecution: entry.hoursPerExecution ?? 0,
          };
        });

        const consolidated = mapped.reduce((acc: typeof mapped, entry) => {
          const existing = acc.find(e => e.profileId === entry.profileId);
          if (existing) {
            existing.hoursPerExecution += entry.hoursPerExecution;
          } else {
            acc.push({ ...entry });
          }
          return acc;
        }, [] as typeof mapped);

        // Update form with recalculated Phase 2 values
        setForm(f => ({
          ...f,
          timeSavedPerProfile: consolidated,
          estimatedDevCostEur: result.estimatedDevCostEur ?? 0,
          estimatedImplWeeks: result.estimatedImplWeeks ?? 0,
          devCostExplanation: result.devCostExplanation ?? '',
        }));

        setIsPhase2Visible(true);
      } catch (recalcErr) {
        setError((recalcErr instanceof Error ? recalcErr.message : 'Phase 2 recalculation failed. You can fill it manually.'));
        setIsPhase2Visible(true);
      } finally {
        setIsRecalculating(false);
      }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleRecalculateOnly = async () => {
    if (!editUC?._id) return;
    setIsRecalculating(true);
    try {
      const recalcRes = await fetch(
        `/api/audits/${auditId}/usecases/${editUC._id}/ai/recalculate`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: form.description,
            targetActivities: form.targetActivities,
            requiredPreconditions: form.requiredPreconditions,
            devRateEur: form.devRateEur ?? 450,
            estimatedImplWeeks: form.estimatedImplWeeks ?? 0,
            nDevs: form.nDevs ?? 1,
            score: { dimensions: dims },
          }),
        }
      );
      if (!recalcRes.ok) throw new Error('Recalculation failed');
      const result = await recalcRes.json();

      setForm(f => ({
        ...f,
        estimatedDevCostEur: result.estimatedDevCostEur ?? f.estimatedDevCostEur,
        estimatedImplWeeks: result.estimatedImplWeeks ?? f.estimatedImplWeeks,
        devCostExplanation: result.devCostExplanation ?? f.devCostExplanation,
      }));
      setDevCostRationale(result.devCostExplanation ?? '');
    } catch {
      // silent fail — user can retry
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleSave_Phase2 = async () => {
    setSaving(true);
    try {
      const ucId = editUC?._id ?? form._id;
      const url = ucId
        ? `/api/audits/${auditId}/usecases/${ucId}`
        : `/api/audits/${auditId}/usecases`;
      const method = ucId ? 'PATCH' : 'POST';
      const bodyData = {
        ...form,
        processId,
        targetActivities: form.targetActivities ?? [],
        score: {
          dimensions: dims ?? {},
          scoringNotes: '',
          scoredBy: 'consultant',
          scoredAt: new Date().toISOString(),
        },
      };

      let bodyStr = '';
      try {
        bodyStr = JSON.stringify(bodyData);
        if (!bodyStr) throw new Error('Failed to serialize form data');
      } catch (jsonErr) {
        throw new Error(`Form serialization failed: ${jsonErr instanceof Error ? jsonErr.message : 'Unknown error'}`);
      }

      const res = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
      });

      let data;
      try {
        const text = await res.text();
        if (!text) throw new Error('Empty response from server');
        data = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(`Server response parse failed: ${parseErr instanceof Error ? parseErr.message : 'Invalid JSON'}`);
      }

      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      if (!data || !data._id) throw new Error('Invalid response from server');
      onSaved(data, data.status === 'blocked' && !editUC);
      onClose();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-white shadow-xl flex flex-col max-h-[90vh] rounded-sm">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold text-base">{editUC ? 'Edit Use Case' : 'Add Use Case'}</h2>
          <button onClick={onClose} className="text-muted hover:text-text"><X size={18} /></button>
        </div>

        <div className="flex-1 p-5 space-y-5 overflow-y-auto">
          {error && <div className="text-xs text-red-sov bg-red-sov-light rounded p-2">{error}</div>}

          {/* === PHASE 1: AI Strategy & Sovereignty === */}

          {/* Description */}
          <div>
            <label className="form-label">Description <span className="text-red-sov">*</span></label>
            <textarea rows={3} className="form-textarea" placeholder="Describe the AI opportunity…"
              value={form.description || ''} onChange={e => set('description', e.target.value)} />
          </div>

          {/* AI Types — multi-select chips */}
          <div>
            <label className="form-label">AI Types <span className="text-red-sov">*</span></label>
            <div className="flex flex-wrap gap-2 mt-1">
              {(Object.keys(AI_TYPE_LABELS) as AIType[]).map(t => {
                const active = (form.aiTypes ?? []).includes(t);
                return (
                  <button key={t} onClick={() => toggleAiType(t)}
                    title={AI_TYPE_LABELS[t].description}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                      active ? 'bg-blue-aria text-white border-blue-aria' : 'border-border text-muted hover:border-blue-aria'
                    }`}>
                    {AI_TYPE_LABELS[t].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target Steps — renamed from Target Activities (B3) */}
          <div>
            <label className="form-label">Target Steps</label>
            {activities.length === 0 ? (
              <p className="text-xs text-muted italic mt-1">No activities defined in B3 yet.</p>
            ) : (
              <div className="mt-1 space-y-1 max-h-40 overflow-y-auto border border-border rounded p-2">
                {activities.map(a => {
                  const checked = (form.targetActivities ?? []).includes(a.id);
                  return (
                    <label key={a.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded">
                      <input type="checkbox" checked={checked} onChange={() => toggleActivity(a.id)}
                        className="accent-blue-aria" />
                      <span className="text-xs text-text">{a.name || `Activity ${a.order + 1}`}</span>
                      {a.estimatedTimeHours > 0 && (
                        <span className="text-xs text-muted ml-auto">{a.estimatedTimeHours}h/run</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Required Preconditions — NEW combined section */}
          <div className="border-t pt-4 mt-4 space-y-3">
            <h3 className="text-sm font-semibold text-text">Required Preconditions</h3>

            {/* Requires Client IT toggle switch (Yes/No) */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-sm text-text">
                  Requires Client IT approval
                </label>
                <p className="text-[10px] text-muted">Auto-calculated from B2. You can override.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => set('requiredPreconditions', {
                    ...form.requiredPreconditions,
                    requiresClientIT: !(form.requiredPreconditions?.requiresClientIT),
                  })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.requiredPreconditions?.requiresClientIT ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                  role="switch"
                  aria-checked={form.requiredPreconditions?.requiresClientIT}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.requiredPreconditions?.requiresClientIT ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
                <span className="text-sm font-medium text-text w-8">
                  {form.requiredPreconditions?.requiresClientIT ? 'Yes' : 'No'}
                </span>
              </div>
            </div>

            {/* Preconditions text textarea */}
            <div>
              <label className="form-label text-sm">Preconditions, blockers and actions needed before POC</label>
              <textarea
                rows={8}
                className="form-textarea whitespace-pre-wrap"
                placeholder="List any preconditions, data dependencies, infrastructure requirements, or blockers…"
                value={form.requiredPreconditions?.text ?? ''}
                onChange={(e) => set('requiredPreconditions', {
                  ...form.requiredPreconditions,
                  text: e.target.value,
                })}
              />
            </div>
          </div>

          {/* Scoring B6 (moved to end of Phase 1) */}
          <div className="border border-border rounded p-4 space-y-3 mt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Scoring (B6)</h3>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-lg text-text">{total}/25</span>
                <Badge variant={cat === 'Quick Win' ? 'green' : cat === 'Mid-term' ? 'amber' : 'blue'}>{cat}</Badge>
              </div>
            </div>
            {DIMENSIONS.map(({ key, label, hint, scale }) => {
              const dim = dims[key as keyof typeof dims];
              const isAutoFilled = key === 'd1_efficiencyImpact' && (dim as any).autoFilled === true;
              return (
                <div key={key} className={isAutoFilled ? 'bg-green-50 border border-green-200 rounded p-2 -mx-2' : ''}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-text" title={`${hint}\n\n${scale}`}>{label}</span>
                      {isAutoFilled && (
                        <span className="text-[9px] font-semibold text-green-700 bg-green-100 border border-green-300 px-1.5 py-0.5 rounded uppercase tracking-wide">
                          Auto
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(v => (
                        <button key={v} onClick={() => updateDim(key, 'value', v as ScoreValue)}
                          title={`${v} — ${scale.split(' · ')[v === 1 ? 0 : v === 3 ? 1 : v === 5 ? 2 : -1] ?? ''}`}
                          className={`w-6 h-6 rounded text-xs font-bold border transition-colors ${
                            dim.value === v
                              ? isAutoFilled ? 'bg-green-600 text-white border-green-600' : 'bg-blue-aria text-white border-blue-aria'
                              : 'border-border text-muted hover:border-blue-aria'
                          }`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input className="form-input text-xs" placeholder="Justification…"
                    value={dim.justification} onChange={e => updateDim(key, 'justification', e.target.value)} />
                </div>
              );
            })}
          </div>

          {/* Save & Calculate button (Phase 1 action button) */}
          <div className="flex gap-3">
            <button onClick={handleSave_Phase1} disabled={isRecalculating} className="btn-primary flex-1">
              {isRecalculating ? 'Calculating...' : 'Save & Calculate'}
            </button>
          </div>

          {/* === PHASE 2: Implementation Economics & Technical (Greyed out initially) === */}
          <div className={`transition-opacity duration-300 space-y-5 ${isPhase2Visible ? 'opacity-100 pointer-events-auto' : 'opacity-50 pointer-events-none'}`}>
            {!isPhase2Visible && (
              <div className="text-sm text-gray-500 p-3 bg-blue-50 rounded border border-blue-200">
                💡 Phase 2 will be available after Phase 1 is saved and recalculated.
              </div>
            )}

            {/* Time saved per profile */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">Time Saved per Profile</label>
                <button onClick={addTimeSaved} disabled={!isPhase2Visible} className="text-xs text-blue-aria hover:underline flex items-center gap-1 disabled:opacity-50"><Plus size={12} />Add profile</button>
              </div>
              {b1Profiles.length === 0 && (
                <p className="text-xs text-muted italic mb-2">No profiles defined in B1 Context yet.</p>
              )}
              {(form.timeSavedPerProfile ?? []).map((e, i) => (
                <div key={e.profileId || i} className="flex items-center gap-2 mb-1">
                  {b1Profiles.length > 0 ? (
                    <select className="form-input text-xs flex-1" value={e.profileId} disabled={!isPhase2Visible}
                      onChange={ev => updateTimeSaved(i, 'profileId', ev.target.value)}>
                      {b1Profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.role} ({p.count}× · €{p.hourlyRateEur}/h)</option>
                      ))}
                    </select>
                  ) : (
                    <input className="form-input text-xs flex-1" placeholder="Role / profile…" value={e.role} disabled={!isPhase2Visible}
                      onChange={ev => updateTimeSaved(i, 'role', ev.target.value)} />
                  )}
                  <input type="number" min={0} step={0.5} className="form-input text-xs w-20" placeholder="h" value={e.hoursPerExecution} disabled={!isPhase2Visible}
                    onChange={ev => updateTimeSaved(i, 'hoursPerExecution', parseFloat(ev.target.value) || 0)} />
                  <span className="text-xs text-muted">h/run</span>
                  <button onClick={() => removeTimeSaved(i)} disabled={!isPhase2Visible} className="text-muted hover:text-red-sov disabled:opacity-50"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>

            {/* Dev Cost Calculator Box */}
            <div className="border border-orange-200 bg-orange-50 rounded p-4 space-y-3">

              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-text">
                  <span>🔧</span> Dev Cost (man-hour) calculator
                </div>
                <button
                  onClick={handleRecalculateOnly}
                  disabled={isRecalculating || !isPhase2Visible}
                  className="flex items-center gap-1 text-xs text-blue-aria border border-blue-aria rounded px-2 py-1 hover:bg-blue-50 transition-colors disabled:opacity-50"
                >
                  {isRecalculating ? <Spinner size="sm" /> : <RefreshCw size={11} />}
                  {isRecalculating ? 'Recalculating…' : 'Recalculate (AI)'}
                </button>
              </div>

              {/* Rationale message */}
              {devCostRationale && (
                <div className="flex items-start gap-1.5 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
                  <Bot size={11} className="mt-0.5 flex-shrink-0" />
                  <span>{devCostRationale}</span>
                </div>
              )}

              {/* Fields row (3 columns) */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="form-label">Impl. Time (weeks)</label>
                  <input type="number" min={0} className="form-input"
                    disabled={!isPhase2Visible}
                    value={form.estimatedImplWeeks ?? 0}
                    onChange={e => {
                      const newValue = parseInt(e.target.value) || 0;
                      set('estimatedImplWeeks', newValue);
                      set('estimatedDevCostEur', newValue * 5 * (form.devRateEur ?? 450) * (form.nDevs ?? 1));
                    }} />
                </div>
                <div>
                  <label className="form-label">Nº Developers</label>
                  <input type="number" min={0.1} step={0.1} className="form-input"
                    disabled={!isPhase2Visible}
                    value={form.nDevs ?? 1}
                    onChange={e => {
                      const newValue = parseFloat(e.target.value) || 1;
                      set('nDevs', newValue);
                      set('estimatedDevCostEur', (form.estimatedImplWeeks ?? 0) * 5 * (form.devRateEur ?? 450) * newValue);
                    }} />
                </div>
                <div>
                  <label className="form-label">Dev Rate Reference (€/day)</label>
                  <input type="number" min={0} className="form-input"
                    disabled={!isPhase2Visible}
                    value={form.devRateEur ?? 450}
                    onChange={e => {
                      const newValue = parseFloat(e.target.value) || 450;
                      set('devRateEur', newValue);
                      set('estimatedDevCostEur', (form.estimatedImplWeeks ?? 0) * 5 * newValue * (form.nDevs ?? 1));
                    }} />
                  <span className="text-xs text-muted mt-1 block">
                    Default: €450/day (AI-assisted dev, Spain 2025). Override if needed.
                  </span>
                </div>
              </div>

              {/* Dev Cost Explanation */}
              <div>
                <label className="form-label">Dev Cost Explanation</label>
                <textarea rows={2} className="form-textarea" disabled={!isPhase2Visible}
                  placeholder="Briefly explain the cost estimate…"
                  value={form.devCostExplanation || ''}
                  onChange={e => set('devCostExplanation', e.target.value)} />
              </div>

              {/* Footer — Dev Cost estimate (computed from weeks × 5 × rate × devs) */}
              {(() => {
                const devCostComputed = (form.estimatedImplWeeks ?? 0) * 5 * (form.devRateEur ?? 450) * (form.nDevs ?? 1);
                return (
                  <div className="flex justify-end items-center pt-1 border-t border-border">
                    <span className="text-xs text-muted mr-2">Dev Cost estimate</span>
                    <span className="text-sm font-bold text-text">
                      €{devCostComputed.toLocaleString('de-DE')}
                    </span>
                  </div>
                );
              })()}

            </div>

            {/* Compute Cost Simulator */}
            <div className="border border-orange-200 bg-orange-50 rounded p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-text">
                  <span>🖥️</span> Compute cost calculator
                </div>
                <button
                  onClick={async () => {
                    setRefreshingCompute(true);
                    try {
                      const bodyData = {
                        computeBreakdown: (form as any).computeBreakdown ?? {},
                        useCaseDescription: form.description ?? '',
                        aiTypes: form.aiTypes ?? [],
                      };
                      const bodyStr = JSON.stringify(bodyData) || '{}';

                      const res = await fetch('/api/ai/refresh-compute-estimates', {
                        method: 'POST', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: bodyStr,
                      });
                      const text = await res.text();
                      const data = text ? JSON.parse(text) : {};
                      if (data.estimates) {
                        const e = data.estimates;
                        const cb = ((form as any).computeBreakdown ?? DEFAULT_COMPUTE_BREAKDOWN) as ComputeBreakdown;
                        const next: ComputeBreakdown = {
                          ...cb,
                          ...(e.inputTokensPerExec != null ? { inputTokensPerExec: e.inputTokensPerExec } : {}),
                          ...(e.outputTokensPerExec != null ? { outputTokensPerExec: e.outputTokensPerExec } : {}),
                        };
                        setForm(f => ({ ...f, computeBreakdown: next }));
                        if (e.rationale) setComputeRationale(e.rationale);
                      }
                    } catch (err) {
                      console.error('[ComputeRefresh]', err);
                    }
                    setRefreshingCompute(false);
                  }}
                  disabled={refreshingCompute || !isPhase2Visible}
                  className="flex items-center gap-1 text-xs text-blue-aria border border-blue-aria rounded px-2 py-1 hover:bg-blue-50 transition-colors disabled:opacity-50"
                >
                  {refreshingCompute ? <Spinner size="sm" /> : <RefreshCw size={11} />}
                  {refreshingCompute ? 'Updating…' : 'Suggest token volumes (AI)'}
                </button>
              </div>
              {computeRationale && (
                <div className="flex items-start gap-1.5 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
                  <Bot size={11} className="mt-0.5 flex-shrink-0" /><span>{computeRationale}</span>
                </div>
              )}
              <ComputeCalculator
                breakdown={(form as any).computeBreakdown}
                onChange={(next) => setForm(f => ({ ...f, computeBreakdown: next }))}
                b3AnnualReps={annualReps}
                defaultOpen
              />
            </div>

            {/* ROI estimate */}
            {roi && (
              <div className="bg-slate-50 border border-border rounded p-3 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-text">
                  <TrendingUp size={13} className="text-green-600" />
                  ROI Estimate
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-green-50 border border-green-200 rounded p-2">
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Gross Annual Saving</div>
                    <div className="font-bold text-green-700 text-sm">€{Math.round(roi.annualSaving).toLocaleString('de-DE')}</div>
                    <div className="text-green-600">{roi.totalHours}h/run × €{roi.avgRate.toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1})}/h avg × {annualReps} runs/yr</div>
                    {roi.savingPct !== null && (
                      <div className="mt-1 font-semibold text-green-700">{roi.savingPct}% of targeted activities ({roi.totalHours}h saved / {roi.targetHours}h total)</div>
                    )}
                  </div>
                  <div className={`rounded p-2 ${roi.computeCostPerYear > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-slate-100 border border-border'}`}>
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Compute Cost/yr</div>
                    <div className={`font-bold text-sm ${roi.computeCostPerYear > 0 ? 'text-amber-700' : 'text-muted'}`}>
                      {roi.computeCostPerYear > 0 ? `€${Math.round(roi.computeCostPerYear).toLocaleString('de-DE')}` : '—'}
                    </div>
                    {roi.computeCostPerYear > 0 && (() => {
                      const cb = (form as any).computeBreakdown;
                      const calc = computeAnnualCompute(cb ?? null);
                      const mode = cb?.mode ?? '';
                      const modeLabel = mode === 'cloud_api' ? 'Cloud API' : mode === 'on_premise' ? 'On-premise' : mode === 'hybrid' ? 'Hybrid' : '';

                      return (
                        <>
                          <div className="text-amber-600 text-[11px] font-semibold">{modeLabel}</div>
                          <div className="text-[10px] text-amber-600">
                            {mode === 'cloud_api' && `${cb?.annualReps ?? annualReps} reps × (${(cb?.inputTokensPerExec ?? 0).toLocaleString('de-DE')} in × €${(cb?.modelPriceInSnapshot ?? 0).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}/M + ${(cb?.outputTokensPerExec ?? 0).toLocaleString('de-DE')} out × €${(cb?.modelPriceOutSnapshot ?? 0).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}/M) = €${Math.round(calc?.cloudCostEur ?? 0).toLocaleString('de-DE')}/yr`}
                            {mode === 'on_premise' && `${((calc?.occupancyShare ?? 0) * 100).toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1})}% occupancy (${cb?.peakConcurrentUsers ?? 0} users × ${cb?.peakUsageFractionOfWindow ?? 25}% of ${(cb?.workingHoursPerDay ?? 10) * (cb?.workingDaysPerWeek ?? 5) * (cb?.workingWeeksPerYear ?? 48).toLocaleString('de-DE')}h/yr) × (€${Math.round(calc?.hwAnnualAmortEur ?? 0).toLocaleString('de-DE')} amort + €${Math.round(calc?.hwAnnualElectricityEur ?? 0).toLocaleString('de-DE')} elec)/yr = €${Math.round(calc?.onPremTotalEur ?? 0).toLocaleString('de-DE')}/yr`}
                            {mode === 'hybrid' && `${cb?.annualReps ?? annualReps} reps × (${(cb?.inputTokensPerExec ?? 0).toLocaleString('de-DE')} in × €${(cb?.modelPriceInSnapshot ?? 0).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}/M + ${(cb?.outputTokensPerExec ?? 0).toLocaleString('de-DE')} out × €${(cb?.modelPriceOutSnapshot ?? 0).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}/M) cloud + €${Math.round(calc?.onPremTotalEur ?? 0).toLocaleString('de-DE')} on-prem = €${Math.round(roi.computeCostPerYear).toLocaleString('de-DE')}/yr`}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <div className={`col-span-2 rounded p-2 ${roi.netAnnualSaving > 0 ? 'bg-teal-50 border border-teal-200' : 'bg-red-50 border border-red-200'}`}>
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Net Annual Saving</div>
                    <div className={`font-bold text-base ${roi.netAnnualSaving > 0 ? 'text-teal-700' : 'text-red-600'}`}>
                      €{Math.round(roi.netAnnualSaving).toLocaleString('de-DE')}
                    </div>
                    {roi.computeCostPerYear > 0 && (
                      <div className="text-[10px] text-muted">Gross €{Math.round(roi.annualSaving).toLocaleString('de-DE')} − Compute €{Math.round(roi.computeCostPerYear).toLocaleString('de-DE')}</div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-red-50 border border-red-200 rounded p-2">
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Dev Cost (one-time)</div>
                    <div className="font-bold text-red-700 text-sm">€{(form.estimatedDevCostEur ?? 0).toLocaleString('de-DE')}</div>
                    {(form.estimatedImplWeeks ?? 0) > 0 && (
                      <>
                        <div className="text-red-600">{form.estimatedImplWeeks} weeks impl.</div>
                        <div className="text-[10px] text-red-500 mt-1">
                          {form.estimatedImplWeeks ?? 0}w × 5d × €{(form.devRateEur ?? 450).toLocaleString('de-DE')}/day × {(form.nDevs ?? 1).toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1})} devs = €{Math.round(form.estimatedDevCostEur ?? 0).toLocaleString('de-DE')}
                        </div>
                      </>
                    )}
                  </div>
                  {roi.paybackMonths > 0 && (
                    <div className="bg-slate-100 border border-border rounded p-2">
                      <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Payback Period</div>
                      <div className="font-bold text-text text-sm">{roi.paybackMonths.toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1})} months</div>
                      <div className="text-muted">on net saving</div>
                      <div className="text-[10px] text-muted mt-1">
                        €{Math.round(form.estimatedDevCostEur ?? 0).toLocaleString('de-DE')} ÷ €{Math.round(roi.netAnnualSaving).toLocaleString('de-DE')}/yr × 12 = {roi.paybackMonths.toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1})} months
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* === PHASE 2 FOOTER (only visible after Phase 1 saved) === */}
        {isPhase2Visible && (
          <div className="p-5 border-t border-border flex gap-3 bg-slate-50">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleSave_Phase2} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UCScore({ uc }: { uc: UseCase }) {
  if (!uc.score?.dimensions) return <span className="text-xs text-muted">—</span>;
  const { total, category } = calculateScore(uc.score.dimensions as Parameters<typeof calculateScore>[0]);
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="font-mono font-bold text-text">{total}/30</span>
      <Badge variant={category === 'quick_win' ? 'green' : category === 'mid_term' ? 'amber' : 'blue'} className="text-[10px]">
        {category === 'quick_win' ? 'Quick Win' : category === 'mid_term' ? 'Mid-term' : 'Strategic'}
      </Badge>
    </div>
  );
}

function UCRoi({ uc, b1Profiles, annualReps, activities }: { uc: UseCase; b1Profiles: ProfileEntry[]; annualReps: number; activities: ProcessActivity[] }) {
  const targetHours = activities
    .filter(a => (uc.targetActivities ?? []).includes(a.id))
    .reduce((s, a) => s + (a.estimatedTimeHours ?? 0), 0);
  const ccPerYear = computeAnnualCompute((uc as any).computeBreakdown ?? null).totalEur;
  const roi = computeRoi(uc.timeSavedPerProfile ?? [], b1Profiles, uc.estimatedDevCostEur ?? 0, annualReps, targetHours, ccPerYear);
  if (!roi) return <span className="text-xs text-muted">—</span>;
  return (
    <div className="text-xs space-y-0.5">
      <div className="flex items-center gap-1 text-green-600">
        <TrendingUp size={10} />
        <span className="font-medium">Net: €{Math.round(roi.netAnnualSaving).toLocaleString('de-DE')}/yr</span>
      </div>
      {roi.computeCostPerYear > 0 && (
        <div className="text-amber-600">Compute: −€{Math.round(roi.computeCostPerYear).toLocaleString('de-DE')}/yr</div>
      )}
      {roi.savingPct !== null && (
        <div className="text-muted">{roi.savingPct}% of targeted activities</div>
      )}
      {roi.paybackMonths > 0 && (
        <div className="text-muted">Payback: {roi.paybackMonths.toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1})} mo</div>
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
  const [filter, setFilter] = useState<'all' | 'eligible' | 'blocked' | 'pending_review'>('all');
  const [slideOver, setSlideOver] = useState(false);
  const [editUC, setEditUC] = useState<UseCase | null>(null);
  const [initialDesc, setInitialDesc] = useState('');
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; uc: UseCase | null; cascade: boolean; pocs: number; industrializations: number; error?: string }>({ open: false, uc: null, cascade: false, pocs: 0, industrializations: 0 });
  const [showArchived, setShowArchived] = useState(false);
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);
  const [generateModal, setGenerateModal] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  useBeforeUnload(slideOver || generateModal);

  const load = useCallback(async () => {
    try {
      const [procRes, ucRes] = await Promise.all([
        fetch(`/api/audits/${auditId}/processes/${procId}`, { credentials: 'include' }),
        fetch(`/api/audits/${auditId}/usecases?processId=${procId}${showArchived ? '&archived=true' : ''}`, { credentials: 'include' }),
      ]);

      let proc = {};
      try {
        const procText = await procRes.text();
        proc = procText ? JSON.parse(procText) : {};
      } catch (err) {
        console.error('[LoadProcess]', err);
      }

      let ucs: any[] = [];
      try {
        const ucsText = await ucRes.text();
        const parsed = ucsText ? JSON.parse(ucsText) : [];
        ucs = Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.error('[LoadUseCases]', err);
      }

      setProcessName(proc?.name || '');
      const acts: ProcessActivity[] = proc?.b3?.activities || [];
      setActivities(acts);
      setB1Profiles(proc?.b1?.profiles || []);
      setAnnualReps(proc?.b3?.annualRepetitions ?? 0);
      setB2Axes(proc?.b2?.axes ?? {});
      setUseCases(ucs);
      setLoading(false);
    } catch (err) {
      console.error('[LoadPage]', err);
      setLoading(false);
    }
  }, [auditId, procId, showArchived]);

  useEffect(() => { load(); }, [load]);

  // Handle ?newUC=1&desc=... from B3 "Create UC" button
  useEffect(() => {
    if (searchParams?.get('newUC') === '1') {
      const desc = searchParams.get('desc') ? decodeURIComponent(searchParams.get('desc')!) : '';
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
    setUseCases(prev => {
      const idx = prev.findIndex(u => u._id === uc._id);
      return idx >= 0 ? prev.map(u => u._id === uc._id ? uc : u) : [...prev, uc];
    });
    if (blocked) {
      setBlockedNotice('This use case has been automatically moved to Blocked due to B2 restrictions.');
      setTimeout(() => setBlockedNotice(null), 5000);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.uc) return;
    try {
      const url = `/api/audits/${auditId}/usecases/${deleteModal.uc._id}${deleteModal.cascade ? '?cascade=true' : ''}`;
      const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        const id = deleteModal.uc._id;
        setUseCases(prev => prev.filter(u => u._id !== id));
        setDeleteModal({ open: false, uc: null, cascade: false, pocs: 0, industrializations: 0 });
        return;
      }

      let data: any = {};
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        console.error('[DeleteParse]', parseErr);
      }

      if (res.status === 409 && data?.dependents) {
        setDeleteModal(s => ({ ...s, cascade: true, pocs: data.dependents.pocs ?? 0, industrializations: data.dependents.industrializations ?? 0, error: data.error }));
      } else {
        setDeleteModal(s => ({ ...s, error: data?.error || 'Delete failed' }));
      }
    } catch (err) {
      console.error('[DeleteError]', err);
      setDeleteModal(s => ({ ...s, error: 'Delete failed' }));
    }
  };

  const toggleArchive = async (uc: UseCase) => {
    try {
      const next = !uc.isArchived;
      const bodyStr = JSON.stringify({ isArchived: next }) || '{}';
      const res = await fetch(`/api/audits/${auditId}/usecases/${uc._id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
      });
      if (!res.ok) return;

      let updated: any = {};
      try {
        const text = await res.text();
        updated = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        console.error('[ArchiveParse]', parseErr);
        return;
      }

      setUseCases(prev => {
        // When the archived toggle is off, archived items should disappear; when on, active ones disappear.
        if (showArchived ? !updated.isArchived : updated.isArchived) {
          return prev.filter(u => u._id !== uc._id);
        }
        return prev.map(u => u._id === uc._id ? updated : u);
      });
    } catch (err) {
      console.error('[ArchiveError]', err);
    }
  };

  const createPOC = (uc: UseCase) => {
    router.push(`/audits/${auditId}/pocs/new?useCaseId=${uc._id}&processId=${procId}`);
  };

  const filtered = filter === 'all' ? useCases : useCases.filter(u => u.status === filter);
  const counts = {
    all: useCases.length,
    eligible: useCases.filter(u => u.status === 'eligible').length,
    blocked: useCases.filter(u => u.status === 'blocked').length,
    pending_review: useCases.filter(u => u.status === 'pending_review').length,
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-muted hover:text-text"><ArrowLeft size={18} /></button>
          <Badge variant="blue">B5</Badge>
          <h1 className="text-xl font-display font-bold text-text">Use Cases</h1>
          <span className="text-muted text-sm">— {processName}</span>
          {useCases.length > 0 && <Badge variant="green"><CheckCircle2 size={12} className="mr-1" />Complete</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSuggestions([]); setSelectedSuggestions(new Set()); setGenerateModal(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-aria border border-blue-aria rounded-sm hover:bg-blue-50 transition-colors"
          >
            <Sparkles size={13} /> Generate with AI
          </button>
          <button onClick={() => { setEditUC(null); setInitialDesc(''); setSlideOver(true); }} className="btn-primary flex items-center gap-1">
            <Plus size={14} /> Add Use Case
          </button>
        </div>
      </div>

      {blockedNotice && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-red-sov-light text-red-sov rounded text-sm">
          <AlertTriangle size={16} />{blockedNotice}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-white rounded-md border border-border p-1 w-fit">
          {(['all', 'eligible', 'blocked', 'pending_review'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors capitalize ${filter === f ? 'bg-blue-aria text-white' : 'text-muted hover:text-text'}`}>
              {f === 'pending_review' ? 'Pending' : f} ({counts[f]})
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="accent-blue-aria" />
          Show archived
        </label>
      </div>

      {/* Use case table */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-muted text-sm">
          {filter === 'all' ? 'No use cases yet. Click "Add Use Case" to identify AI opportunities.' : `No ${filter} use cases.`}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50 text-left text-xs text-muted">
                <th className="px-3 py-2.5 font-medium w-20">ID</th>
                <th className="px-3 py-2.5 font-medium">Description</th>
                <th className="px-3 py-2.5 font-medium w-36">AI Types</th>
                <th className="px-3 py-2.5 font-medium w-20 text-center">People</th>
                <th className="px-3 py-2.5 font-medium w-28">Score</th>
                <th className="px-3 py-2.5 font-medium w-28">ROI</th>
                <th className="px-3 py-2.5 font-medium w-28">Status</th>
                <th className="px-3 py-2.5 font-medium w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(uc => {
                const aiTypes: AIType[] = uc.aiTypes?.length ? uc.aiTypes : [(uc as any).aiType].filter(Boolean);
                return (
                  <tr key={uc._id} className={`hover:bg-slate-50 transition-colors ${uc.status === 'blocked' ? 'opacity-70' : ''} ${uc.isArchived ? 'opacity-60 bg-smoke/40' : ''}`}>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => { setEditUC(uc); setInitialDesc(''); setSlideOver(true); }}
                        className="font-mono text-xs text-blue-aria font-medium hover:underline cursor-pointer"
                      >
                        {uc.cuId}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-text line-clamp-2">{uc.description}</p>
                      {uc.status === 'blocked' && uc.blockedReason && (
                        <div className="mt-1 flex items-start gap-1 text-xs text-red-sov">
                          <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" />
                          {uc.blockedReason}
                        </div>
                      )}
                      {uc.requiresClientIT && (
                        <div className="mt-1 text-xs text-amber-sov">Client IT required</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {aiTypes.map(t => (
                          <Badge key={t} variant={AI_TYPE_COLORS[t] ?? 'slate'} className="text-[10px]">
                            {AI_TYPE_LABELS[t]?.label ?? t}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {(() => {
                        const total = (uc.timeSavedPerProfile ?? []).reduce((sum, e) => {
                          const p = b1Profiles.find(p => p.id === e.profileId);
                          return sum + (p?.count ?? 0);
                        }, 0);
                        return total > 0
                          ? <span className="font-bold text-text text-sm">{total}</span>
                          : <span className="text-muted text-xs">—</span>;
                      })()}
                    </td>
                    <td className="px-3 py-3">
                      <UCScore uc={uc} />
                    </td>
                    <td className="px-3 py-3">
                      <UCRoi uc={uc} b1Profiles={b1Profiles} annualReps={annualReps} activities={activities} />
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={STATUS_VARIANTS[uc.status]}>{uc.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {uc.status === 'eligible' && (
                          <button onClick={() => createPOC(uc)}
                            title="Create POC"
                            className="text-muted hover:text-blue-aria p-1"><FlaskConical size={13} /></button>
                        )}
                        <button onClick={() => { setEditUC(uc); setInitialDesc(''); setSlideOver(true); }}
                          className="text-muted hover:text-blue-aria p-1"><Pencil size={13} /></button>
                        <button onClick={() => toggleArchive(uc)}
                          title={uc.isArchived ? 'Unarchive' : 'Archive'}
                          className="text-muted hover:text-blue-aria p-1">
                          {uc.isArchived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                        </button>
                        <button onClick={() => setDeleteModal({ open: true, uc, cascade: false, pocs: 0, industrializations: 0 })}
                          className="text-muted hover:text-red-sov p-1"><Trash2 size={13} /></button>
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
          const hasParam = searchParams?.get('edit') || searchParams?.get('newUC');
          if (hasParam) router.replace(`/audits/${auditId}/processes/${procId}/b5`);
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
          <div className="absolute inset-0 bg-black/40" onClick={() => setGenerateModal(false)} />
          <div className="relative w-full max-w-2xl bg-white shadow-xl flex flex-col max-h-[85vh] rounded-sm">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-blue-aria" />
                <h2 className="font-semibold text-base">Generate Use Cases with AI</h2>
              </div>
              <button onClick={() => setGenerateModal(false)} className="text-muted hover:text-text"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <p className="text-sm text-muted">
                AI will analyze the process context (B1 profiles, B2 sovereignty, B3 activities) and suggest AI use cases.
              </p>
              {suggestions.length === 0 && (
                <button
                  onClick={async () => {
                    setGenerating(true);
                    setSuggestions([]);
                    setSelectedSuggestions(new Set());
                    try {
                      const res = await fetch(`/api/audits/${auditId}/ai/suggest-usecases`, {
                        method: 'POST', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ processId: procId }),
                      });
                      const data = await res.json();
                      if (data.suggestions) setSuggestions(data.suggestions);
                    } catch {}
                    setGenerating(false);
                  }}
                  disabled={generating}
                  className="btn-primary flex items-center gap-2"
                >
                  {generating ? <Spinner size="sm" /> : <Bot size={14} />}
                  {generating ? <ProgressIndicator steps={SUGGEST_USECASES_STEPS} completionTimeMs={30000} /> : 'Analyze & Suggest'}
                </button>
              )}

              {suggestions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text">{suggestions.length} suggestions</span>
                    <button
                      onClick={() => setSelectedSuggestions(
                        selectedSuggestions.size === suggestions.length ? new Set() : new Set(suggestions.map((_, i) => i))
                      )}
                      className="text-xs text-blue-aria hover:underline"
                    >
                      {selectedSuggestions.size === suggestions.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  {suggestions.map((s, i) => {
                    const selected = selectedSuggestions.has(i);
                    const total = s.score ? Object.entries(s.score).filter(([k]) => k !== 'd6_governanceComplexity').reduce((sum: number, [, d]: any) => sum + d.value, 0) : null;
                    return (
                      <div key={i} onClick={() => {
                        const next = new Set(selectedSuggestions);
                        if (selected) next.delete(i); else next.add(i);
                        setSelectedSuggestions(next);
                      }}
                        className={`border rounded p-3 cursor-pointer transition-colors ${selected ? 'border-blue-aria bg-blue-50' : 'border-border hover:border-blue-aria/50'}`}
                      >
                        <div className="flex items-start gap-2">
                          <input type="checkbox" checked={selected} readOnly className="mt-0.5 accent-blue-aria" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text">{s.description}</p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {(s.aiTypes ?? []).map((t: string) => (
                                <Badge key={t} variant={(AI_TYPE_COLORS as any)[t] ?? 'slate'} className="text-[10px]">
                                  {AI_TYPE_LABELS[t as AIType]?.label ?? t}
                                </Badge>
                              ))}
                              {total !== null && (
                                <span className="text-[10px] font-mono font-bold text-muted ml-auto">{total}/25</span>
                              )}
                            </div>
                            {s.notes && <p className="text-[10px] text-muted mt-1 italic">{s.notes}</p>}
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
                <span className="text-sm text-muted">{selectedSuggestions.size} selected</span>
                <button
                  onClick={async () => {
                    if (selectedSuggestions.size === 0) return;
                    setImporting(true);
                    try {
                      const toImport = [...selectedSuggestions].map(i => suggestions[i]);
                      for (const s of toImport) {
                        const score = s.score ? { dimensions: s.score, scoringNotes: '', scoredBy: 'ai', scoredAt: new Date().toISOString() } : undefined;
                        const mappedActivityIds = (s.targetActivityNames ?? []).map((name: string) => activities.find(a => a.name === name)?.id).filter(Boolean) as string[];

                        // Map roles to profileIds and consolidate duplicates
                        const mapped = (s.timeSavedPerProfile ?? []).map(entry => {
                          const matched = b1Profiles.find(
                            p => p.role.toLowerCase().trim() === entry.role?.toLowerCase().trim()
                          );
                          return {
                            profileId: matched?.id ?? crypto.randomUUID(),
                            role: matched?.role ?? entry.role ?? '',
                            hoursPerExecution: entry.hoursPerExecution ?? 0,
                          };
                        });

                        const consolidated = mapped.reduce((acc, entry) => {
                          const existing = acc.find(e => e.profileId === entry.profileId);
                          if (existing) {
                            existing.hoursPerExecution += entry.hoursPerExecution;
                          } else {
                            acc.push({ ...entry });
                          }
                          return acc;
                        }, [] as typeof mapped);

                        const body = {
                          description: s.description,
                          aiTypes: s.aiTypes ?? [],
                          targetActivities: mappedActivityIds,
                          timeSavedPerProfile: consolidated,
                          estimatedDevCostEur: s.estimatedDevCostEur ?? 0,
                          devCostExplanation: s.devCostExplanation ?? '',
                          devRateEur: 450,
                          nDevs: 1,
                          requiredPreconditions: {
                            requiresClientIT: s.requiredPreconditions?.requiresClientIT ?? false,
                            text: [
                              s.requiredPreconditions?.text ?? '',
                              s.notes ? `---\n${s.notes}` : ''
                            ].filter(Boolean).join('\n\n'),
                          },
                          estimatedImplWeeks: s.estimatedImplWeeks ?? 0,
                          computeBreakdown: { ...DEFAULT_COMPUTE_BREAKDOWN, annualReps },
                          processId: procId,
                          score,
                        };

                        await fetch(`/api/audits/${auditId}/usecases`, {
                          method: 'POST', credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(body),
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
                  {importing ? 'Importing…' : `Import ${selectedSuggestions.size} selected`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal isOpen={deleteModal.open}
        title={deleteModal.cascade ? 'Delete use case and dependents?' : 'Delete use case?'}
        message={
          deleteModal.cascade
            ? `"${deleteModal.uc?.cuId}" has ${deleteModal.pocs} POC(s) and ${deleteModal.industrializations} industrialization(s). Deleting will remove them too. This cannot be undone.`
            : `Are you sure you want to delete "${deleteModal.uc?.cuId}"? Consider archiving instead if you might need it later.`
        }
        confirmLabel={deleteModal.cascade ? 'Delete all' : 'Delete'}
        onConfirm={handleDelete}
        onClose={() => setDeleteModal({ open: false, uc: null, cascade: false, pocs: 0, industrializations: 0 })} />
    </div>
  );
}
