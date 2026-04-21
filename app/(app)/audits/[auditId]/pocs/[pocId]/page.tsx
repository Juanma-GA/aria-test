'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, CheckCircle2, ChevronDown, ChevronUp, Bot, RefreshCw } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { SaveIndicator } from '@/components/ui/SaveIndicator';
import { apiUrl } from '@/lib/utils';
import type { POC, POCPhase, POCDecisionType, POCCriterion, POCMilestone } from '@/lib/types';

const PHASES: { key: POCPhase; label: string; num: number }[] = [
  { key: 'design', label: 'Design', num: 1 },
  { key: 'execution', label: 'Execution', num: 2 },
  { key: 'evaluation', label: 'Evaluation', num: 3 },
  { key: 'closed', label: 'Decision', num: 4 },
];

const DECISIONS: { key: POCDecisionType; label: string; color: string; desc: string }[] = [
  { key: 'go', label: 'GO — Scale to implementation', color: 'bg-green-sov text-white border-green-sov', desc: 'All criteria met. Proceed to full implementation.' },
  { key: 'go_conditional', label: 'GO Conditional — Scale with conditions', color: 'bg-teal-poc text-white border-teal-poc', desc: 'Most criteria met. One condition pending.' },
  { key: 'no_go_redesign', label: 'No-Go — Redesign POC', color: 'bg-amber-sov text-white border-amber-sov', desc: 'Criteria not met. Redesign and retry.' },
  { key: 'no_go_discard', label: 'No-Go — Discard use case', color: 'bg-red-sov text-white border-red-sov', desc: 'Use case not viable in this context. Move to Blocked.' },
  { key: 'paused', label: 'Paused — External dependency', color: 'bg-purple-aria text-white border-purple-aria', desc: 'Unresolved external dependency. Document and track.' },
];

const MILESTONE_STATUS_COLORS: Record<'pending' | 'done' | 'missed', string> = {
  pending: 'border-border text-muted',
  done: 'border-green-sov bg-green-sov text-white',
  missed: 'border-red-sov bg-red-sov text-white',
};

function SectionAccordion({ title, phase, currentPhase, children, badge }: {
  title: string;
  phase: POCPhase;
  currentPhase: POCPhase;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const phaseOrder: POCPhase[] = ['design', 'execution', 'evaluation', 'closed'];
  const isActive = phase === currentPhase;
  const isDone = phaseOrder.indexOf(phase) < phaseOrder.indexOf(currentPhase);
  const [open, setOpen] = useState(isActive);

  return (
    <div className={`card border-l-4 ${isActive ? 'border-teal-poc' : isDone ? 'border-green-sov' : 'border-border'}`}>
      <button className="w-full flex items-center justify-between p-4 text-left" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          {isDone ? <CheckCircle2 size={16} className="text-green-sov" /> : (
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs border font-bold ${isActive ? 'border-teal-poc text-teal-poc' : 'border-muted text-muted'}`}>
              {PHASES.find(p => p.key === phase)?.num}
            </span>
          )}
          <span className="font-semibold text-sm">{title}</span>
          {badge}
        </div>
        {open ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-border/30 pt-4">{children}</div>}
    </div>
  );
}

export default function POCDetailPage() {
  const { auditId, pocId } = useParams<{ auditId: string; pocId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [poc, setPoc] = useState<POC | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    fetch(`/api/audits/${auditId}/pocs/${pocId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setPoc(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [auditId, pocId]);

  const save = useCallback(async (updated: Partial<POC>) => {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/audits/${auditId}/pocs/${pocId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      setPoc(data);
      setSaveStatus('saved');
    } catch { setSaveStatus('unsaved'); }
  }, [auditId, pocId]);

  const trigger = (updated: Partial<POC>) => {
    setSaveStatus('unsaved');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(updated), 2000);
  };

  const updateDesign = (field: string, value: unknown) => {
    if (!poc) return;
    const next = { ...poc, design: { ...poc.design, [field]: value } };
    setPoc(next as POC);
    trigger({ design: next.design });
  };

  const updateComputeCost = (field: string, value: unknown) => {
    if (!poc) return;
    const next = { ...poc, computeCost: { ...(poc as any).computeCost, [field]: value } };
    setPoc(next as POC);
    trigger({ computeCost: next.computeCost });
  };

  const updateCriterion = (id: string, field: string, value: unknown) => {
    if (!poc) return;
    const criteria = (poc.design?.successCriteria || []).map((c: POCCriterion) => c.id === id ? { ...c, [field]: value } : c);
    const next = { ...poc, design: { ...poc.design, successCriteria: criteria } };
    setPoc(next as POC);
    trigger({ design: next.design });
  };

  const addCriterion = () => {
    if (!poc) return;
    const criterion: POCCriterion = { id: uuidv4(), criterion: '', description: '', successThreshold: '' };
    const next = { ...poc, design: { ...poc.design, successCriteria: [...(poc.design?.successCriteria || []), criterion] } };
    setPoc(next as POC);
    trigger({ design: next.design });
  };

  const removeCriterion = (id: string) => {
    if (!poc) return;
    const criteria = (poc.design?.successCriteria || []).filter((c: POCCriterion) => c.id !== id);
    const next = { ...poc, design: { ...poc.design, successCriteria: criteria } };
    setPoc(next as POC);
    trigger({ design: next.design });
  };

  const updateExecution = (field: string, value: unknown) => {
    if (!poc) return;
    const next = { ...poc, execution: { ...poc.execution, [field]: value } };
    setPoc(next as POC);
    trigger({ execution: next.execution });
  };

  // Milestones
  const addMilestone = () => {
    if (!poc) return;
    const milestones: POCMilestone[] = poc.execution?.milestones ?? [];
    const m: POCMilestone = { id: uuidv4(), name: '', dueDate: new Date(), status: 'pending', notes: '' };
    const next = { ...poc, execution: { ...poc.execution, milestones: [...milestones, m] } };
    setPoc(next as POC);
    trigger({ execution: next.execution });
  };

  const updateMilestone = (id: string, field: string, value: unknown) => {
    if (!poc) return;
    const milestones = (poc.execution?.milestones ?? []).map((m: POCMilestone) => m.id === id ? { ...m, [field]: value } : m);
    const next = { ...poc, execution: { ...poc.execution, milestones } };
    setPoc(next as POC);
    trigger({ execution: next.execution });
  };

  const removeMilestone = (id: string) => {
    if (!poc) return;
    const milestones = (poc.execution?.milestones ?? []).filter((m: POCMilestone) => m.id !== id);
    const next = { ...poc, execution: { ...poc.execution, milestones } };
    setPoc(next as POC);
    trigger({ execution: next.execution });
  };

  const updateEvaluation = (field: string, value: unknown) => {
    if (!poc) return;
    const next = { ...poc, evaluation: { ...poc.evaluation, [field]: value } };
    setPoc(next as POC);
    trigger({ evaluation: next.evaluation });
  };

  const updateCriterionResult = (id: string, actualResult: string, passed: boolean) => {
    if (!poc) return;
    const criteria = (poc.design?.successCriteria || []).map((c: POCCriterion) => c.id === id ? { ...c, actualResult, passed } : c);
    const next = { ...poc, design: { ...poc.design, successCriteria: criteria } };
    setPoc(next as POC);
    trigger({ design: next.design });
  };

  const setDecision = async (decision: POCDecisionType) => {
    if (!poc) return;
    const next = { ...poc, phase: 'closed' as POCPhase, decision: { ...poc.decision, decision, decidedAt: new Date() } };
    setPoc(next as POC);
    await save({ phase: 'closed', decision: next.decision });
  };

  const advanceTo = async (nextPhase: POCPhase) => {
    if (!poc) return;
    const next = { ...poc, phase: nextPhase };
    setPoc(next as POC);
    await save({ phase: nextPhase });
  };

  const [simOpen, setSimOpen] = useState(false);
  const [refreshingFill, setRefreshingFill] = useState(false);
  const [refreshingCompute, setRefreshingCompute] = useState(false);
  const [computeRationale, setComputeRationale] = useState('');
  const aiGeneratedFields: string[] = (poc as any)?.aiGeneratedFields ?? [];

  const GPU_PRESETS: Record<string, { name: string; tdpW: number; priceEur: number; vramGb: number }> = {
    rtx_4090:  { name: 'RTX 4090',  tdpW: 450, priceEur: 2000,  vramGb: 24 },
    a100_40gb: { name: 'A100 40GB', tdpW: 300, priceEur: 10000, vramGb: 40 },
    a100_80gb: { name: 'A100 80GB', tdpW: 400, priceEur: 15000, vramGb: 80 },
    h100:      { name: 'H100 80GB', tdpW: 700, priceEur: 30000, vramGb: 80 },
  };

  const WORKING_HOURS_PER_YEAR = 215 * 8; // 1720h — 215 working days × 8h

  function autoRecommendGpu(annualReps: number, concurrentUsers: number, avgSec: number) {
    const cu = Math.max(1, concurrentUsers);
    const sec = Math.max(avgSec, 0.1);
    const avgRps = annualReps / (WORKING_HOURS_PER_YEAR * 3600);
    const gpusForThroughput = Math.ceil(avgRps * sec);
    // GPU class by throughput tier only
    const gpuModel =
      annualReps < 10_000 ? 'rtx_4090' :
      annualReps < 100_000 ? 'a100_40gb' :
      annualReps < 500_000 ? 'a100_80gb' : 'h100';
    // Realistic continuous-batching capacity per GPU (vLLM/TGI, medium-size model ~7–13B)
    const concPerGpu: Record<string, number> = { rtx_4090: 8, a100_40gb: 16, a100_80gb: 32, h100: 64 };
    const gpusForConcurrency = Math.ceil(cu / concPerGpu[gpuModel]);
    const nGpus = Math.max(gpusForThroughput, gpusForConcurrency, 1);
    const utilizationPct = Math.min((annualReps * sec) / (WORKING_HOURS_PER_YEAR * 3600), 1);
    const peakRps = (cu / sec).toFixed(1);
    const batchCap = concPerGpu[gpuModel];
    const rationale = `${annualReps.toLocaleString()} exec/yr ÷ ${WORKING_HOURS_PER_YEAR}h = ${avgRps.toFixed(4)} req/s avg · ${cu} concurrent users (${batchCap} batch cap/GPU → ${gpusForConcurrency} GPU${gpusForConcurrency !== 1 ? 's' : ''}) · GPU load ${(utilizationPct * 100).toFixed(1)}% · ${nGpus}× ${GPU_PRESETS[gpuModel].name}`;
    return { gpuModel, nGpus, utilizationPct, rationale };
  }

  const milestones: POCMilestone[] = poc?.execution?.milestones ?? [];
  const doneMilestones = milestones.filter(m => m.status === 'done').length;
  const currentPhaseIdx = PHASES.findIndex(p => p.key === poc?.phase);

  if (loading || !poc) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/audits/${auditId}/pocs`)} className="text-muted hover:text-text"><ArrowLeft size={18} /></button>
          <Badge variant="teal">B8</Badge>
          <span className="font-mono text-sm text-teal-poc font-semibold">{poc.pocId}</span>
          {poc.name && <span className="text-sm font-semibold text-text">— {poc.name}</span>}
          <Badge variant={currentPhaseIdx === 3 ? 'green' : 'blue'}>{poc.phase}</Badge>
        </div>
        <SaveIndicator status={saveStatus} />
      </div>

      {/* Phase stepper */}
      <div className="flex items-center gap-0 mb-6 card p-3">
        {PHASES.map((p, i) => {
          const active = poc.phase === p.key;
          const done = currentPhaseIdx > i;
          return (
            <div key={p.key} className="flex items-center flex-1">
              <div className={`flex items-center gap-2 flex-1 justify-center py-1 rounded text-xs font-medium ${active ? 'bg-teal-poc text-white' : done ? 'text-green-sov' : 'text-muted'}`}>
                {done ? <CheckCircle2 size={14} /> : <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs border ${active ? 'border-white bg-white/20' : 'border-current'}`}>{p.num}</span>}
                {p.label}
              </div>
              {i < PHASES.length - 1 && <div className={`h-px w-4 ${done ? 'bg-green-sov' : 'bg-border'}`} />}
            </div>
          );
        })}
      </div>

      <div className="space-y-4">
        {/* Phase 1: Design */}
        <SectionAccordion title="Phase 1 — Design" phase="design" currentPhase={poc.phase}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="form-label">POC Name</label>
                <input className="form-input" placeholder="Short descriptive name for this POC…"
                  value={poc.name || ''}
                  onChange={e => {
                    const next = { ...poc, name: e.target.value };
                    setPoc(next as POC);
                    trigger({ name: e.target.value });
                  }} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="form-label mb-0">Measurable Objective</label>
                  <button
                    onClick={async () => {
                      setRefreshingFill(true);
                      try {
                        const res = await fetch(`/api/audits/${auditId}/pocs/${pocId}/ai/fill-design`, {
                          method: 'POST', credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                        });
                        const data = await res.json();
                        if (data.poc) setPoc(data.poc);
                      } catch {}
                      setRefreshingFill(false);
                    }}
                    disabled={refreshingFill}
                    className="flex items-center gap-1 text-[10px] text-blue-aria border border-blue-aria rounded px-1.5 py-0.5 hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    {refreshingFill ? <Spinner size="sm" /> : <RefreshCw size={10} />}
                    Refresh with AI
                  </button>
                </div>
                <textarea rows={2} className="form-textarea" value={poc.design?.measurableObjective || ''}
                  onChange={e => updateDesign('measurableObjective', e.target.value)} />
                {aiGeneratedFields.includes('measurableObjective') && poc.design?.measurableObjective && (
                  <div className="flex items-center gap-1 mt-0.5 text-[10px] text-blue-600">
                    <Bot size={10} /><span>AI-generated</span>
                  </div>
                )}
              </div>
              <div>
                <label className="form-label">Scope Description</label>
                <textarea rows={2} className="form-textarea" value={poc.design?.scopeDescription || ''}
                  onChange={e => updateDesign('scopeDescription', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Start Date</label>
                <input type="date" className="form-input"
                  value={poc.design?.startDate ? new Date(poc.design.startDate).toISOString().slice(0, 10) : ''}
                  onChange={e => updateDesign('startDate', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Deadline</label>
                <input type="date" className="form-input"
                  value={poc.design?.deadlineDate ? new Date(poc.design.deadlineDate).toISOString().slice(0, 10) : ''}
                  onChange={e => updateDesign('deadlineDate', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="form-label">Required Resources</label>
                <textarea rows={2} className="form-textarea" value={poc.design?.requiredResources || ''}
                  onChange={e => updateDesign('requiredResources', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Dev Cost — Man-Hours (€)</label>
                <input type="number" className="form-input" value={poc.design?.estimatedDevCostEur || ''}
                  onChange={e => updateDesign('estimatedDevCostEur', Number(e.target.value))} />
              </div>
              <div className="col-span-2">
                <label className="form-label">Active B2 Restrictions</label>
                <textarea rows={2} className="form-textarea" value={poc.design?.activeB2Restrictions || ''}
                  onChange={e => updateDesign('activeB2Restrictions', e.target.value)} />
                {aiGeneratedFields.includes('activeB2Restrictions') && poc.design?.activeB2Restrictions && (
                  <div className="flex items-center gap-1 mt-0.5 text-[10px] text-blue-600">
                    <Bot size={10} /><span>AI-generated</span>
                  </div>
                )}
              </div>
            </div>

            {/* Success Criteria */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Success Criteria</h3>
                <button onClick={addCriterion} className="btn-primary text-xs flex items-center gap-1"><Plus size={13} /> Add Criterion</button>
              </div>
              {(poc.design?.successCriteria || []).length === 0 ? (
                <p className="text-sm text-muted">Add at least 2 success criteria.</p>
              ) : (
                <div className="space-y-3">
                  {(poc.design?.successCriteria as POCCriterion[]).map(c => (
                    <div key={c.id} className="border border-border rounded p-3 grid grid-cols-3 gap-3">
                      <div>
                        <label className="form-label">Criterion</label>
                        <input className="form-input text-xs" value={c.criterion} onChange={e => updateCriterion(c.id, 'criterion', e.target.value)} />
                      </div>
                      <div>
                        <label className="form-label">Description</label>
                        <input className="form-input text-xs" value={c.description} onChange={e => updateCriterion(c.id, 'description', e.target.value)} />
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="form-label">Success Threshold</label>
                          <input className="form-input text-xs" value={c.successThreshold} onChange={e => updateCriterion(c.id, 'successThreshold', e.target.value)} />
                        </div>
                        <button onClick={() => removeCriterion(c.id)} className="text-muted hover:text-red-sov mt-4"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {poc.phase === 'design' && (
              <button
                onClick={() => advanceTo('execution')}
                disabled={(poc.design?.successCriteria || []).length < 2}
                className="btn-primary disabled:opacity-50"
              >
                Advance to Execution →
              </button>
            )}
          </div>
        </SectionAccordion>

        {/* Compute Cost Simulator */}
        {(() => {
          const cc = (poc as any).computeCost ?? {};
          const annualReps = cc.annualReps ?? 0;
          const cu = cc.concurrentUsers ?? 1;
          const avgSec = cc.avgResponseTimeSec ?? 2;
          const autoRec = autoRecommendGpu(annualReps, cu, avgSec);

          // Cloud cost
          const cloudCost = annualReps > 0
            ? ((cc.inputTokensPerExec ?? 1000) * annualReps / 1_000_000 * (cc.pricePerMInputTokens ?? 2))
            + ((cc.outputTokensPerExec ?? 500)  * annualReps / 1_000_000 * (cc.pricePerMOutputTokens ?? 6))
            : 0;

          // On-premise cost (auto-sized GPU, power weighted by utilisation)
          const gpu = GPU_PRESETS[autoRec.gpuModel];
          const nGpus = autoRec.nGpus;
          const totalGpuCost = gpu.priceEur * nGpus;
          const amortYears = cc.amortizationYears ?? 4;
          const amortization = totalGpuCost / amortYears;
          const powerFactor = 0.30 + 0.70 * autoRec.utilizationPct;
          const electricity = (gpu.tdpW / 1000) * nGpus * WORKING_HOURS_PER_YEAR * powerFactor * (cc.electricityRateEur ?? 0.15);
          const maintenance = 0.08 * totalGpuCost;
          const onPremCost = amortization + electricity + maintenance;

          // Hybrid cost
          const onPremPct = (cc.onPremPct ?? 70) / 100;
          const hybridCost = onPremCost * onPremPct + cloudCost * (1 - onPremPct);

          // Break-even
          const monthlyCloudSavingVsOnPrem = (cloudCost - (electricity + maintenance)) / 12;
          const breakevenMonths = monthlyCloudSavingVsOnPrem > 0 ? Math.round(totalGpuCost / monthlyCloudSavingVsOnPrem) : null;

          // Subscriptions
          const subs: { tool: string; users: number; monthlyPerUser: number }[] = cc.subscriptions ?? [];
          const subscriptionsCost = subs.reduce((s, sub) => s + (sub.users ?? 0) * (sub.monthlyPerUser ?? 0) * 12, 0);
          const setSubs = (next: typeof subs) => updateComputeCost('subscriptions', next);
          const addSub = () => setSubs([...subs, { tool: '', users: 1, monthlyPerUser: 0 }]);
          const removeSub = (i: number) => setSubs(subs.filter((_, idx) => idx !== i));
          const updateSub = (i: number, field: string, value: string | number) =>
            setSubs(subs.map((s, idx) => idx === i ? { ...s, [field]: value } : s));

          // Cost per execution
          const infraCost = cc.deploymentModel === 'on_premise' ? onPremCost : cc.deploymentModel === 'hybrid' ? hybridCost : cloudCost;
          const activeCost = infraCost + subscriptionsCost;
          const costPerExec = annualReps > 0 ? activeCost / annualReps : 0;

          const deploymentModel: string = cc.deploymentModel ?? 'cloud_api';

          // Auto-recommendation
          let recommendation = '';
          if (annualReps > 0) {
            if (cloudCost < onPremCost) recommendation = 'Cloud API recommended — lower annual cost';
            else if (breakevenMonths !== null && breakevenMonths < 24) recommendation = `On-Premise recommended — break-even in ${breakevenMonths} months`;
            else recommendation = 'Hybrid may offer balanced cost/control';
          }

          return (
            <div className="card border-l-4 border-blue-aria">
              <button
                className="w-full flex items-center justify-between p-4 text-left"
                onClick={() => setSimOpen(o => !o)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">🖥️</span>
                  <span className="font-semibold text-sm">Compute Cost Simulator</span>
                  {(annualReps > 0 || subscriptionsCost > 0) && (
                    <span className="text-xs text-muted bg-slate-100 px-2 py-0.5 rounded">
                      Total: €{activeCost.toLocaleString('en-GB', { maximumFractionDigits: 0 })}/yr
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      setRefreshingCompute(true);
                      try {
                        const res = await fetch(apiUrl('/api/ai/refresh-compute-estimates'), {
                          method: 'POST', credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ computeCost: cc, useCaseDescription: (poc as any).cuId }),
                        });
                        const data = await res.json();
                        if (data.estimates) {
                          const e2 = data.estimates;
                          const updated = { ...cc };
                          if (e2.pricePerMInputTokens != null) updated.pricePerMInputTokens = e2.pricePerMInputTokens;
                          if (e2.pricePerMOutputTokens != null) updated.pricePerMOutputTokens = e2.pricePerMOutputTokens;
                          if (e2.inputTokensPerExec != null) updated.inputTokensPerExec = e2.inputTokensPerExec;
                          if (e2.outputTokensPerExec != null) updated.outputTokensPerExec = e2.outputTokensPerExec;
                          if (e2.avgResponseTimeSec != null) updated.avgResponseTimeSec = e2.avgResponseTimeSec;
                          const next = { ...poc, computeCost: updated };
                          setPoc(next as POC);
                          trigger({ computeCost: updated });
                          if (e2.rationale) setComputeRationale(e2.rationale);
                        }
                      } catch {}
                      setRefreshingCompute(false);
                    }}
                    disabled={refreshingCompute}
                    className="flex items-center gap-1 text-[10px] text-blue-aria border border-blue-aria rounded px-1.5 py-0.5 hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    {refreshingCompute ? <Spinner size="sm" /> : <RefreshCw size={10} />}
                    Update with AI
                  </button>
                  {simOpen ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
                </div>
              </button>

              {simOpen && (
                <div className="px-5 pb-5 border-t border-border/30 pt-4 space-y-5">
                  {computeRationale && (
                    <div className="flex items-start gap-1.5 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
                      <Bot size={11} className="mt-0.5 flex-shrink-0" /><span>{computeRationale}</span>
                    </div>
                  )}
                  {/* Deployment model tabs */}
                  <div>
                    <label className="form-label mb-2">Deployment Model</label>
                    <div className="flex gap-1 border border-border rounded-sm p-1 w-fit">
                      {[
                        { key: 'cloud_api', label: 'Cloud API' },
                        { key: 'on_premise', label: 'On-Premise GPU' },
                        { key: 'hybrid', label: 'Hybrid' },
                      ].map(opt => (
                        <button key={opt.key}
                          onClick={() => updateComputeCost('deploymentModel', opt.key)}
                          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${deploymentModel === opt.key ? 'bg-blue-aria text-white' : 'text-muted hover:text-text'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Common inputs */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Annual Executions</label>
                      <input type="number" className="form-input" value={cc.annualReps || ''}
                        onChange={e => updateComputeCost('annualReps', Number(e.target.value))} placeholder="0" />
                    </div>
                    <div>
                      <label className="form-label">Concurrent Users</label>
                      <input type="number" className="form-input" value={cc.concurrentUsers || ''}
                        onChange={e => updateComputeCost('concurrentUsers', Number(e.target.value))} placeholder="1" />
                    </div>
                    <div>
                      <label className="form-label">Avg. Response Time (sec)</label>
                      <input type="number" className="form-input" value={cc.avgResponseTimeSec || ''}
                        onChange={e => updateComputeCost('avgResponseTimeSec', Number(e.target.value))} placeholder="2" />
                    </div>
                  </div>

                  {/* Conditional inputs */}
                  {deploymentModel === 'cloud_api' && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-text uppercase tracking-wide">Cloud API Parameters</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="form-label">Input Tokens / Execution</label>
                          <input type="number" className="form-input" value={cc.inputTokensPerExec || ''}
                            onChange={e => updateComputeCost('inputTokensPerExec', Number(e.target.value))} placeholder="1000" />
                        </div>
                        <div>
                          <label className="form-label">Output Tokens / Execution</label>
                          <input type="number" className="form-input" value={cc.outputTokensPerExec || ''}
                            onChange={e => updateComputeCost('outputTokensPerExec', Number(e.target.value))} placeholder="500" />
                        </div>
                        <div>
                          <label className="form-label">Price / M Input Tokens (€)</label>
                          <input type="number" className="form-input" value={cc.pricePerMInputTokens || ''}
                            onChange={e => updateComputeCost('pricePerMInputTokens', Number(e.target.value))} placeholder="2" />
                        </div>
                        <div>
                          <label className="form-label">Price / M Output Tokens (€)</label>
                          <input type="number" className="form-input" value={cc.pricePerMOutputTokens || ''}
                            onChange={e => updateComputeCost('pricePerMOutputTokens', Number(e.target.value))} placeholder="6" />
                        </div>
                      </div>
                      <div>
                        <label className="form-label mb-1">Model Presets</label>
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { label: 'Mistral Medium', input: 2, output: 6 },
                            { label: 'GPT-4o', input: 5, output: 15 },
                            { label: 'Claude Sonnet', input: 3, output: 15 },
                          ].map(p => (
                            <button key={p.label}
                              onClick={() => { updateComputeCost('pricePerMInputTokens', p.input); updateComputeCost('pricePerMOutputTokens', p.output); }}
                              className="btn-secondary text-xs px-2 py-1">
                              {p.label}: {p.input}/{p.output}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {deploymentModel === 'on_premise' && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-text uppercase tracking-wide">On-Premise GPU Parameters</h4>
                      {/* Auto GPU recommendation */}
                      <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">Auto GPU Sizing</span>
                          <span className="text-sm font-bold text-text">{nGpus}× {gpu.name}</span>
                          <span className="text-xs text-muted">{gpu.vramGb}GB VRAM · {gpu.tdpW}W · €{gpu.priceEur.toLocaleString()}/unit</span>
                        </div>
                        <p className="text-[11px] text-muted leading-relaxed">{autoRec.rationale}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="form-label">Amortization (years)</label>
                          <input type="number" className="form-input" value={cc.amortizationYears || ''}
                            onChange={e => updateComputeCost('amortizationYears', Number(e.target.value))} placeholder="4" />
                        </div>
                        <div>
                          <label className="form-label">Electricity Rate (€/kWh)</label>
                          <input type="number" className="form-input" step="0.01" value={cc.electricityRateEur || ''}
                            onChange={e => updateComputeCost('electricityRateEur', Number(e.target.value))} placeholder="0.15" />
                        </div>
                      </div>
                      {/* Utilisation bar */}
                      <div className="bg-slate-50 rounded p-2.5 space-y-1.5 text-xs text-muted">
                        <div className="flex items-center gap-2">
                          <span>GPU load:</span>
                          <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-blue-aria transition-all"
                              style={{ width: `${Math.min(autoRec.utilizationPct * 100, 100).toFixed(1)}%` }} />
                          </div>
                          <span className="font-medium text-text">{(autoRec.utilizationPct * 100).toFixed(1)}%</span>
                          <span className="text-[10px]">power factor {(powerFactor * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex gap-4 text-[11px] flex-wrap">
                          <span>Amortization: €{Math.round(amortization).toLocaleString()}/yr</span>
                          <span>Electricity: €{Math.round(electricity).toLocaleString()}/yr</span>
                          <span>Maintenance: €{Math.round(maintenance).toLocaleString()}/yr</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {deploymentModel === 'hybrid' && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-text uppercase tracking-wide">Hybrid Split</h4>
                      <div>
                        <label className="form-label">% On-Premise: {cc.onPremPct ?? 70}%</label>
                        <input type="range" min={0} max={100} step={5}
                          value={cc.onPremPct ?? 70}
                          onChange={e => updateComputeCost('onPremPct', Number(e.target.value))}
                          className="w-full" />
                        <div className="flex justify-between text-[10px] text-muted mt-1">
                          <span>0% On-Prem (full cloud)</span>
                          <span>100% On-Prem (full local)</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Commercial licences / subscriptions */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-text uppercase tracking-wide">Commercial Licences / Subscriptions</h4>
                      <button onClick={addSub}
                        className="text-xs text-blue-aria border border-blue-aria rounded px-2 py-0.5 hover:bg-blue-50 transition-colors flex items-center gap-1">
                        <Plus size={11} /> Add
                      </button>
                    </div>
                    {subs.length > 0 && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-[1fr_72px_80px_72px_24px] gap-2 text-[10px] text-muted uppercase tracking-wide px-1">
                          <span>Tool / Licence</span><span className="text-right">Users</span><span className="text-right">€/user/mo</span><span className="text-right">Annual</span><span />
                        </div>
                        {subs.map((sub, i) => (
                          <div key={i} className="grid grid-cols-[1fr_72px_80px_72px_24px] gap-2 items-center">
                            <input className="form-input text-sm" placeholder="e.g. GitHub Copilot"
                              value={sub.tool} onChange={e => updateSub(i, 'tool', e.target.value)} />
                            <input type="number" min={1} className="form-input text-sm text-right"
                              value={sub.users} onChange={e => updateSub(i, 'users', parseInt(e.target.value) || 1)} />
                            <input type="number" min={0} step={0.5} className="form-input text-sm text-right"
                              value={sub.monthlyPerUser} onChange={e => updateSub(i, 'monthlyPerUser', parseFloat(e.target.value) || 0)} />
                            <span className="text-sm font-medium text-text text-right">
                              €{Math.round(sub.users * sub.monthlyPerUser * 12).toLocaleString()}
                            </span>
                            <button onClick={() => removeSub(i)} className="text-muted hover:text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm font-semibold text-text pt-2 border-t border-border">
                          <span className="text-muted font-normal">Total licences/yr</span>
                          <span>€{Math.round(subscriptionsCost).toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Results panel */}
                  {(annualReps > 0 || subscriptionsCost > 0) && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-text uppercase tracking-wide">Annual Cost Estimate</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className={`rounded p-3 border ${deploymentModel === 'cloud_api' ? 'border-blue-aria bg-blue-aria/5' : 'border-border bg-slate-50'}`}>
                          <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Cloud API</div>
                          <div className="text-lg font-bold text-text">€{cloudCost.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</div>
                          <div className="text-[10px] text-muted">/year</div>
                        </div>
                        <div className={`rounded p-3 border ${deploymentModel === 'on_premise' ? 'border-blue-aria bg-blue-aria/5' : 'border-border bg-slate-50'}`}>
                          <div className="text-[10px] text-muted uppercase tracking-wide mb-1">On-Premise</div>
                          <div className="text-lg font-bold text-text">€{onPremCost.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</div>
                          <div className="text-[10px] text-muted">/year (amort. + elec. + maint.)</div>
                        </div>
                        {deploymentModel === 'hybrid' && (
                          <div className="rounded p-3 border border-blue-aria bg-blue-aria/5">
                            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Hybrid ({cc.onPremPct ?? 70}% On-Prem)</div>
                            <div className="text-lg font-bold text-text">€{hybridCost.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</div>
                            <div className="text-[10px] text-muted">/year</div>
                          </div>
                        )}
                        {subscriptionsCost > 0 && (
                          <div className="rounded p-3 border border-purple-aria bg-purple-aria/5">
                            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Licences</div>
                            <div className="text-lg font-bold text-text">€{subscriptionsCost.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</div>
                            <div className="text-[10px] text-muted">/year ({subs.length} subscription{subs.length !== 1 ? 's' : ''})</div>
                          </div>
                        )}
                        <div className="rounded p-3 border border-border bg-slate-50 col-span-2">
                          <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Total Annual Cost</div>
                          <div className="text-xl font-bold text-blue-aria">€{activeCost.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</div>
                          {annualReps > 0 && <div className="text-[10px] text-muted">€{costPerExec.toLocaleString('en-GB', { maximumFractionDigits: 4 })} / execution</div>}
                        </div>
                        {breakevenMonths !== null && (
                          <div className="rounded p-3 border border-amber-sov bg-amber-sov/5 col-span-2">
                            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Break-Even (Cloud vs On-Prem)</div>
                            <div className="text-lg font-bold text-amber-sov">{breakevenMonths} months</div>
                            <div className="text-[10px] text-muted">until on-prem investment recovers</div>
                          </div>
                        )}
                      </div>
                      {recommendation && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-green-sov/10 border border-green-sov/30 rounded text-xs text-green-sov font-medium">
                          <span>✓</span> {recommendation}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Phase 2: Execution */}
        <SectionAccordion
          title="Phase 2 — Execution"
          phase="execution"
          currentPhase={poc.phase}
          badge={milestones.length > 0 ? (
            <span className="text-xs text-muted ml-2">{doneMilestones}/{milestones.length} milestones done</span>
          ) : undefined}
        >
          <div className="space-y-4">
            {/* Milestones table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium">Milestones</h3>
                <button onClick={addMilestone} className="btn-primary text-xs flex items-center gap-1"><Plus size={13} /> Add Milestone</button>
              </div>
              {milestones.length === 0 ? (
                <p className="text-sm text-muted">No milestones yet. Add at least one to track progress.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {['Milestone', 'Due Date', 'Status', 'Notes', ''].map(h => (
                          <th key={h} className="text-left py-2 px-2 text-xs font-medium text-muted">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {milestones.map((m) => (
                        <tr key={m.id} className="border-b border-border/50">
                          <td className="py-2 px-2">
                            <input className="form-input text-xs" value={m.name} placeholder="Milestone name…"
                              onChange={e => updateMilestone(m.id, 'name', e.target.value)} />
                          </td>
                          <td className="py-2 px-2">
                            <input type="date" className="form-input text-xs"
                              value={m.dueDate ? new Date(m.dueDate).toISOString().slice(0, 10) : ''}
                              onChange={e => updateMilestone(m.id, 'dueDate', e.target.value)} />
                          </td>
                          <td className="py-2 px-2">
                            <select
                              className={`form-input text-xs font-medium border-2 ${MILESTONE_STATUS_COLORS[m.status]}`}
                              value={m.status}
                              onChange={e => updateMilestone(m.id, 'status', e.target.value)}
                            >
                              <option value="pending">Pending</option>
                              <option value="done">Done</option>
                              <option value="missed">Missed</option>
                            </select>
                          </td>
                          <td className="py-2 px-2">
                            <input className="form-input text-xs" value={m.notes} placeholder="Notes…"
                              onChange={e => updateMilestone(m.id, 'notes', e.target.value)} />
                          </td>
                          <td className="py-2 px-2">
                            <button onClick={() => removeMilestone(m.id)} className="text-muted hover:text-red-sov"><Trash2 size={13} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Progress bar */}
              {milestones.length > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <span>Progress</span>
                    <span>{doneMilestones}/{milestones.length} ({Math.round(doneMilestones / milestones.length * 100)}%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full">
                    <div className="h-2 bg-teal-poc rounded-full transition-all"
                      style={{ width: `${Math.round(doneMilestones / milestones.length * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Incidents</label>
                <textarea rows={2} className="form-textarea text-xs" value={poc.execution?.incidents || ''}
                  onChange={e => updateExecution('incidents', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Plan Deviations</label>
                <textarea rows={2} className="form-textarea text-xs" value={poc.execution?.planDeviations || ''}
                  onChange={e => updateExecution('planDeviations', e.target.value)} />
              </div>
            </div>

            {poc.phase === 'execution' && (
              <button
                onClick={() => advanceTo('evaluation')}
                disabled={milestones.length === 0}
                className="btn-primary disabled:opacity-50"
              >
                Advance to Evaluation →
              </button>
            )}
          </div>
        </SectionAccordion>

        {/* Phase 3: Evaluation */}
        <SectionAccordion title="Phase 3 — Evaluation" phase="evaluation" currentPhase={poc.phase}>
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Results vs. Success Criteria</h3>
            <div className="space-y-3">
              {(poc.design?.successCriteria as POCCriterion[] || []).map(c => (
                <div key={c.id} className="border border-border rounded p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{c.criterion || 'Unnamed criterion'}</div>
                      <div className="text-xs text-muted">Threshold: {c.successThreshold}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input className="form-input text-xs w-36" placeholder="Actual result…" value={c.actualResult || ''}
                        onChange={e => updateCriterionResult(c.id, e.target.value, c.passed || false)} />
                      <button onClick={() => updateCriterionResult(c.id, c.actualResult || '', !c.passed)}
                        className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${c.passed ? 'bg-green-sov text-white border-green-sov' : 'border-border text-muted hover:border-green-sov'}`}>
                        {c.passed ? '✓ Pass' : '✗ Fail'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {(poc.design?.successCriteria || []).length === 0 && (
                <p className="text-sm text-muted">No success criteria defined in Design phase.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Technical Lessons', field: 'technicalLessons' },
                { label: 'Organisational Lessons', field: 'organisationalLessons' },
              ].map(({ label, field }) => (
                <div key={field}>
                  <label className="form-label">{label}</label>
                  <textarea rows={2} className="form-textarea text-xs"
                    value={((poc.evaluation || {}) as unknown as Record<string, string>)[field] || ''}
                    onChange={e => updateEvaluation(field, e.target.value)} />
                </div>
              ))}
              <div className="col-span-2">
                <label className="form-label">Estimated Production Impact</label>
                <textarea rows={2} className="form-textarea text-xs" value={poc.evaluation?.estimatedProductionImpact || ''}
                  onChange={e => updateEvaluation('estimatedProductionImpact', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Actual Cost (€)</label>
                <input type="number" className="form-input" value={poc.evaluation?.actualCostEur || ''}
                  onChange={e => updateEvaluation('actualCostEur', Number(e.target.value))} />
              </div>
            </div>

            {poc.phase === 'evaluation' && (
              <button onClick={() => advanceTo('closed')} className="btn-primary">Proceed to Decision →</button>
            )}
          </div>
        </SectionAccordion>

        {/* Phase 4: Decision */}
        <SectionAccordion title="Phase 4 — Go / No-Go Decision" phase="closed" currentPhase={poc.phase}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {DECISIONS.map(d => {
                const active = poc.decision?.decision === d.key;
                return (
                  <button key={d.key} onClick={() => setDecision(d.key)}
                    className={`flex items-start gap-3 p-4 rounded border-2 text-left transition-all ${active ? d.color : 'border-border hover:border-blue-aria'}`}>
                    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 ${active ? 'border-current bg-current' : 'border-muted'}`} />
                    <div>
                      <div className="font-semibold text-sm">{d.label}</div>
                      <div className={`text-xs mt-0.5 ${active ? 'opacity-80' : 'text-muted'}`}>{d.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="space-y-3">
              <div>
                <label className="form-label">Justification</label>
                <textarea rows={3} className="form-textarea" value={poc.decision?.justification || ''}
                  onChange={e => {
                    const n = { ...poc, decision: { ...poc.decision, justification: e.target.value } };
                    setPoc(n as POC);
                    trigger({ decision: n.decision });
                  }} />
              </div>
              {poc.decision?.decision === 'go_conditional' && (
                <div>
                  <label className="form-label">Conditional Requirement</label>
                  <textarea rows={2} className="form-textarea" value={poc.decision?.conditionalRequirement || ''}
                    onChange={e => {
                      const n = { ...poc, decision: { ...poc.decision, conditionalRequirement: e.target.value } };
                      setPoc(n as POC);
                      trigger({ decision: n.decision });
                    }} />
                </div>
              )}
              <div>
                <label className="form-label">Next Steps</label>
                <textarea rows={2} className="form-textarea" value={poc.decision?.nextSteps || ''}
                  onChange={e => {
                    const n = { ...poc, decision: { ...poc.decision, nextSteps: e.target.value } };
                    setPoc(n as POC);
                    trigger({ decision: n.decision });
                  }} />
              </div>
            </div>
            {(poc.decision?.decision === 'go' || poc.decision?.decision === 'go_conditional') && (
              <div className="p-3 bg-green-sov-light rounded text-sm text-green-sov flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>GO decision recorded. Update the B7 roadmap initiative with actual POC data.</span>
                <button onClick={() => router.push(`/audits/${auditId}/roadmap`)} className="ml-auto text-xs underline">Open Roadmap →</button>
              </div>
            )}
          </div>
        </SectionAccordion>
      </div>
    </div>
  );
}
