'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Check, X, HelpCircle, Sparkles, Plus, Trash2, ChevronDown, ChevronRight, Users } from 'lucide-react';
import type { IndustrializationCost, MaintenanceAssessment, MaintenanceDrivers, TriState, ProfileCatalogEntry, ProfileHoursLine, OneTimeFieldKey } from '@/lib/types';
import { computeCostBreakdown, assessmentStatus, computeMaintenanceCategoryEur, type MaintenanceCategoryKey } from '@/lib/calculations';
import { Spinner } from '@/components/ui/Spinner';
import { ComputeCalculator } from './ComputeCalculator';

interface Props {
  cost: IndustrializationCost;
  onChange: (patch: Partial<IndustrializationCost>) => void;
  aiBusy?: null | 'milestones' | 'cost' | 'maintenance';
  aiError?: string;
  onBootstrapWithAi?: () => void;
  onSuggestMaintenance?: () => void;
  /** Last AI rationale from `bootstrap-cost` — explains how the one-time / recurring numbers were derived. */
  costRationale?: string;
  /** Last AI rationale from `suggest-maintenance` — explains the yes/no calls and the per-category euro estimates. */
  maintenanceRationale?: string;
  /** Source POC (populated from `pocId`) — surfaces the POC's compute breakdown
   *  so the calculator can show a "scale up from POC" helper. */
  poc?: { pocId?: string; computeBreakdown?: any } | null;
  /** True when the current breakdown was inherited from the POC at creation time. */
  inheritedFromPoc?: boolean;
}

type MaintenanceEurField = 'correctiveEur' | 'evolutiveEur' | 'modelRetrainingEur' | 'driftMonitoringEur' | 'revalidationEur' | 'l1l2SupportEur' | 'vendorSlaEur';

interface AssessmentQuestion {
  key: keyof Omit<MaintenanceAssessment, 'completedAt' | 'completedBy'>;
  categoryKey: MaintenanceCategoryKey;
  question: string;
  hint: string;
  fieldKey: MaintenanceEurField;
  fieldLabel: string;
  /** Default driver values when the user opts into the parameterised form. */
  defaultDrivers: NonNullable<MaintenanceDrivers[MaintenanceCategoryKey]>;
  /** Short formula label shown next to the total. */
  formulaLabel: string;
}

const QUESTIONS: AssessmentQuestion[] = [
  { key: 'hasCorrectiveWarranty',     categoryKey: 'corrective',       question: 'Is there corrective maintenance after delivery?',                         hint: 'Bug fixes, patches under warranty.',                                                            fieldKey: 'correctiveEur',       fieldLabel: 'Corrective maintenance',
    defaultDrivers: { pctOfDevelopment: 10 },
    formulaLabel: '% of development cost' },
  { key: 'hasFunctionalRoadmap',      categoryKey: 'evolutive',        question: 'Is there a committed functional roadmap (evolutive)?',                    hint: 'New features, functional adjustments planned beyond go-live.',                                  fieldKey: 'evolutiveEur',        fieldLabel: 'Evolutive maintenance',
    defaultDrivers: { featuresPerYear: 4, hoursPerFeature: 40, hourlyRateEur: 75 },
    formulaLabel: 'features × hours × rate' },
  { key: 'hasFineTuningOrDynamicRag', categoryKey: 'modelRetraining',  question: 'Does the system use fine-tuning or RAG with a changing corpus?',           hint: 'Triggers periodic model/index refresh.',                                                        fieldKey: 'modelRetrainingEur',  fieldLabel: 'Model retraining',
    defaultDrivers: { cyclesPerYear: 4, hoursPerCycle: 24, hourlyRateEur: 75, cloudComputePerCycleEur: 500 },
    formulaLabel: 'cycles × (hours × rate + compute)' },
  { key: 'requiresDriftMonitoring',   categoryKey: 'driftMonitoring',  question: 'Is drift monitoring required (SLA or regulation)?',                        hint: 'Detect accuracy degradation over time.',                                                        fieldKey: 'driftMonitoringEur',  fieldLabel: 'Drift monitoring',
    defaultDrivers: { checksPerYear: 12, hoursPerCheck: 4, hourlyRateEur: 75, toolingEurPerYear: 2000 },
    formulaLabel: 'checks × hours × rate + tooling' },
  { key: 'isRegulatedRevalidation',   categoryKey: 'revalidation',     question: 'Does the regulated context require re-validation when the model changes?', hint: 'Defence / aerospace / naval / railway. Triggers external audit/dossier each retrain.',          fieldKey: 'revalidationEur',     fieldLabel: 'Re-validation',
    defaultDrivers: { cyclesPerYear: 1, hoursPerCycle: 80, hourlyRateEur: 95, externalAuditEurPerCycle: 15000 },
    formulaLabel: 'cycles × (hours × rate + audit)' },
  { key: 'hasInternalSupport',        categoryKey: 'l1l2Support',      question: 'Is there internal L1/L2 user support?',                                    hint: 'Help desk, ticketing, internal team.',                                                          fieldKey: 'l1l2SupportEur',      fieldLabel: 'L1/L2 support',
    defaultDrivers: { ticketsPerMonth: 20, hoursPerTicket: 1.5, hourlyRateEur: 75 },
    formulaLabel: 'tickets × 12 × hours × rate' },
  { key: 'hasVendorSla',              categoryKey: 'vendorSla',        question: 'Is there a vendor SLA (LLM provider, cloud)?',                             hint: 'Anthropic, Mistral, OpenAI, hyperscaler support contracts.',                                    fieldKey: 'vendorSlaEur',        fieldLabel: 'Vendor SLA',
    defaultDrivers: { monthlyFeeEur: 1000 },
    formulaLabel: 'monthly fee × 12' },
];

const fmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

function NumInput({ value, onChange, suffix = '€', disabled = false }: { value?: number; onChange: (v: number) => void; suffix?: string; disabled?: boolean }) {
  return (
    <div className="relative">
      <input
        type="number"
        min={0}
        value={value ?? 0}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className={`form-input pr-8 text-xs tabular-nums ${disabled ? 'bg-slate-50 text-muted cursor-not-allowed' : ''}`}
        title={disabled ? 'Auto-derived from profile-hour breakdown — clear the breakdown to edit manually.' : undefined}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted">{suffix}</span>
    </div>
  );
}

export function CostEditor({ cost, onChange, aiBusy, aiError, onBootstrapWithAi, onSuggestMaintenance, costRationale, maintenanceRationale, poc, inheritedFromPoc }: Props) {
  const [editingAssessment, setEditingAssessment] = useState(false);
  const breakdown = computeCostBreakdown(cost);
  const assessment = cost.recurringAnnual?.maintenance?.assessment;
  const status = assessmentStatus(assessment);
  const showQuestionnaire = editingAssessment || !status.isComplete;

  const updateOneTime = (field: keyof IndustrializationCost['oneTime'], value: number) => {
    onChange({ oneTime: { ...cost.oneTime, [field]: value } });
  };

  const updateRecurring = (field: 'computeEur' | 'licensesEur' | 'monitoringObservabilityEur', value: number) => {
    onChange({
      recurringAnnual: {
        ...cost.recurringAnnual,
        [field]: value,
      },
    });
  };

  const updateMaintenanceField = (field: AssessmentQuestion['fieldKey'], value: number) => {
    onChange({
      recurringAnnual: {
        ...cost.recurringAnnual,
        maintenance: {
          ...cost.recurringAnnual.maintenance,
          [field]: value,
        },
      },
    });
  };

  /** Patch one driver block (e.g. `corrective`, `evolutive`). Pass `null`
   *  to remove the block and revert to manual EUR entry. */
  const updateMaintenanceDrivers = (
    categoryKey: MaintenanceCategoryKey,
    patch: Partial<NonNullable<MaintenanceDrivers[MaintenanceCategoryKey]>> | null,
  ) => {
    const currentDrivers = cost.recurringAnnual?.maintenance?.drivers ?? {};
    const nextDrivers: MaintenanceDrivers = { ...currentDrivers };
    if (patch === null) {
      delete (nextDrivers as any)[categoryKey];
    } else {
      const current = (currentDrivers as any)[categoryKey] ?? {};
      (nextDrivers as any)[categoryKey] = { ...current, ...patch };
    }
    onChange({
      recurringAnnual: {
        ...cost.recurringAnnual,
        maintenance: {
          ...cost.recurringAnnual.maintenance,
          drivers: nextDrivers,
        },
      },
    });
  };

  const updateAssessment = (key: AssessmentQuestion['key'], value: TriState) => {
    onChange({
      recurringAnnual: {
        ...cost.recurringAnnual,
        maintenance: {
          ...cost.recurringAnnual.maintenance,
          assessment: {
            ...(cost.recurringAnnual.maintenance?.assessment ?? {} as MaintenanceAssessment),
            [key]: value,
          },
        },
      },
    });
  };

  const completeAssessment = () => {
    onChange({
      recurringAnnual: {
        ...cost.recurringAnnual,
        maintenance: {
          ...cost.recurringAnnual.maintenance,
          assessment: {
            ...(cost.recurringAnnual.maintenance?.assessment ?? {} as MaintenanceAssessment),
            completedAt: new Date(),
          },
        },
      },
    });
    setEditingAssessment(false);
  };

  const reopenAssessment = () => setEditingAssessment(true);

  const updateActual = (field: keyof IndustrializationCost['actual'], value: any) => {
    onChange({ actual: { ...cost.actual, [field]: value } });
  };

  const updateHorizon = (years: number) => onChange({ horizonYears: years });

  return (
    <div className="space-y-5">
      {/* Header: horizon + warning + AI bootstrap */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs font-medium text-muted">Cost horizon</label>
          <select
            value={cost.horizonYears ?? 3}
            onChange={e => updateHorizon(Number(e.target.value))}
            className="form-input text-xs w-24"
          >
            {[1, 2, 3, 4, 5, 6, 7].map(y => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>)}
          </select>
          {(cost.horizonYears ?? 3) > 3 && (
            <span className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-sov-light rounded px-2 py-1">
              <AlertTriangle size={12} />
              Estimates beyond 3 years carry high uncertainty (AI market evolution).
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onBootstrapWithAi && (
            <button
              onClick={onBootstrapWithAi}
              disabled={aiBusy !== null}
              className="text-[11px] text-blue-aria border border-blue-aria rounded px-2 py-1 hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center gap-1"
              title="Fills empty cost fields based on POC data and sector context"
            >
              {aiBusy === 'cost' ? <Spinner size="sm" /> : <Sparkles size={12} />}
              Bootstrap with AI
            </button>
          )}
          <span className="text-[11px] text-muted">All values in {cost.currency ?? 'EUR'}</span>
        </div>
      </div>
      {aiError && aiBusy === null && (
        <div className="text-[11px] text-red-sov bg-red-sov-light rounded p-2">{aiError}</div>
      )}
      {costRationale && (
        <div className="text-[11px] text-blue-aria bg-blue-pale/60 border border-blue-aria/20 rounded p-2 flex items-start gap-2">
          <Sparkles size={12} className="mt-0.5 shrink-0" />
          <div><span className="font-semibold">AI rationale:</span> {costRationale}</div>
        </div>
      )}

      {/* One-time */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">One-time costs (CAPEX)</h3>
          <span className="text-[11px] text-muted flex items-center gap-1">
            <Users size={11} /> Click <em>profile-hours</em> on any line to break it down
          </span>
        </div>
        <div className="space-y-2">
          <OneTimeLine label="Development"            fieldKey="development"        eurFieldKey="developmentEur"        cost={cost} onChange={onChange} />
          <OneTimeLine label="Integration / SI"       fieldKey="integration"        eurFieldKey="integrationEur"        cost={cost} onChange={onChange} />
          <OneTimeLine label="Infra setup"            fieldKey="infraSetup"         eurFieldKey="infraSetupEur"         cost={cost} onChange={onChange} />
          <OneTimeLine label="Security & compliance"  fieldKey="securityCompliance" eurFieldKey="securityComplianceEur" cost={cost} onChange={onChange} />
          <OneTimeLine label="Training / change mgmt" fieldKey="trainingChangeMgmt" eurFieldKey="trainingChangeMgmtEur" cost={cost} onChange={onChange} />
          <div className="grid md:grid-cols-12 gap-2 items-center">
            <label className="md:col-span-4 text-xs font-medium text-text">Contingency</label>
            <div className="md:col-span-3"><NumInput value={cost.oneTime?.contingencyPct} onChange={v => updateOneTime('contingencyPct', v)} suffix="%" /></div>
          </div>
        </div>
        <div className="text-xs text-muted border-t border-border pt-2 flex justify-between">
          <span>Subtotal {fmt.format(breakdown.oneTimeSubtotal)} € + contingency {fmt.format(breakdown.contingencyEur)} €</span>
          <span className="font-semibold text-text">One-time total: {fmt.format(breakdown.oneTimeTotal)} €</span>
        </div>
      </div>

      {/* Recurring annual */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Recurring annual costs (OPEX)</h3>
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Compute (LLM, infra)">
            <NumInput
              value={cost.recurringAnnual?.computeEur}
              onChange={v => updateRecurring('computeEur', v)}
              disabled={!!cost.recurringAnnual?.computeBreakdown?.mode}
            />
          </Field>
          <Field label="Licenses"><NumInput value={cost.recurringAnnual?.licensesEur} onChange={v => updateRecurring('licensesEur', v)} /></Field>
          <Field label="Monitoring & observability"><NumInput value={cost.recurringAnnual?.monitoringObservabilityEur} onChange={v => updateRecurring('monitoringObservabilityEur', v)} /></Field>
        </div>

        {/* Compute calculator: when active, drives Compute (LLM, infra) above.
            Passes POC reference so the calculator can show a "scale up from POC" helper. */}
        <ComputeCalculator cost={cost} onChange={onChange} poc={poc} inheritedFromPoc={inheritedFromPoc} />

        <div className="text-xs text-muted text-right border-t border-border pt-2">
          Infra subtotal: <span className="font-semibold text-text">{fmt.format(breakdown.recurringInfra)} €/year</span>
        </div>
      </div>

      {/* Maintenance assessment */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Maintenance</h3>
          {status.isComplete && !editingAssessment && (
            <button onClick={reopenAssessment} className="text-xs text-muted hover:text-blue-aria flex items-center gap-1">
              <RefreshCw size={12} /> Re-evaluate
            </button>
          )}
        </div>
        {maintenanceRationale && (
          <div className="text-[11px] text-blue-aria bg-blue-pale/60 border border-blue-aria/20 rounded p-2 flex items-start gap-2">
            <Sparkles size={12} className="mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">AI rationale (maintenance):</span> {maintenanceRationale}
            </div>
          </div>
        )}

        {showQuestionnaire ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-muted flex-1">
                Answer Yes/No so only the applicable maintenance categories are tracked. Leave Undecided to defer; the industrialization cannot move to <em>Go for run</em> while any answer is undecided.
              </p>
              {onSuggestMaintenance && (
                <button
                  onClick={onSuggestMaintenance}
                  disabled={aiBusy !== null}
                  className="text-[11px] text-blue-aria border border-blue-aria rounded px-2 py-1 hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
                  title="Pre-fills answers based on POC, sector and AI types. You still need to confirm."
                >
                  {aiBusy === 'maintenance' ? <Spinner size="sm" /> : <Sparkles size={12} />}
                  Suggest with AI
                </button>
              )}
            </div>
            <div className="space-y-2">
              {QUESTIONS.map(q => (
                <div key={q.key} className="border border-border rounded-sm p-3 grid md:grid-cols-12 gap-3 items-start">
                  <div className="md:col-span-8">
                    <p className="text-xs font-medium text-text">{q.question}</p>
                    <p className="text-[11px] text-muted mt-0.5">{q.hint}</p>
                  </div>
                  <div className="md:col-span-4 flex gap-1 justify-end">
                    {([
                      { v: true as TriState, label: 'Yes', cls: 'border-green-sov text-green-sov hover:bg-green-sov-light' },
                      { v: false as TriState, label: 'No', cls: 'border-red-sov text-red-sov hover:bg-red-sov-light' },
                      { v: null as TriState, label: 'Undecided', cls: 'border-border text-muted hover:bg-smoke' },
                    ]).map(opt => {
                      const cur = assessment?.[q.key] ?? null;
                      const isActive = cur === opt.v;
                      const activeCls = opt.v === true ? 'bg-green-sov text-white border-green-sov'
                        : opt.v === false ? 'bg-red-sov text-white border-red-sov'
                        : 'bg-slate-200 text-text border-slate-300';
                      return (
                        <button
                          key={String(opt.v)}
                          onClick={() => updateAssessment(q.key, opt.v)}
                          className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${isActive ? activeCls : opt.cls}`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-[11px] text-muted">
                {status.applicable} applicable · {status.notApplicable} not applicable · {status.pending} undecided
              </span>
              <button
                onClick={completeAssessment}
                disabled={!status.isComplete}
                className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Complete assessment
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-xs text-muted bg-smoke rounded p-2 flex items-center gap-2">
              <Check size={12} className="text-green-sov" />
              Assessment completed
              {assessment?.completedAt && <span>· {new Date(assessment.completedAt).toLocaleDateString()}</span>}
              · {status.applicable} applicable, {status.notApplicable} not applicable
            </div>

            {status.applicable === 0 ? (
              <p className="text-xs text-muted italic">No maintenance categories apply to this industrialization.</p>
            ) : (
              <div className="space-y-2">
                {QUESTIONS.filter(q => assessment?.[q.key] === true).map(q => (
                  <MaintenanceCategoryEditor
                    key={q.key}
                    question={q}
                    cost={cost}
                    onUpdateField={updateMaintenanceField}
                    onUpdateDrivers={updateMaintenanceDrivers}
                  />
                ))}
              </div>
            )}

            {QUESTIONS.some(q => assessment?.[q.key] === false) && (
              <details className="text-[11px] text-muted">
                <summary className="cursor-pointer hover:text-text">Categories marked not applicable</summary>
                <ul className="mt-1 space-y-0.5 ml-4 list-disc">
                  {QUESTIONS.filter(q => assessment?.[q.key] === false).map(q => (
                    <li key={q.key} className="flex items-center gap-1"><X size={10} className="text-red-sov" /> {q.fieldLabel}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="text-xs text-muted text-right border-t border-border pt-2">
              Maintenance subtotal: <span className="font-semibold text-text">{fmt.format(breakdown.recurringMaintenance)} €/year</span>
            </div>
          </>
        )}
      </div>

      {/* Actual */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Actual costs (post go-live)</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="One-time actual"><NumInput value={cost.actual?.oneTimeEur} onChange={v => updateActual('oneTimeEur', v)} /></Field>
          <Field label="Recurring annual actual"><NumInput value={cost.actual?.recurringAnnualEur} onChange={v => updateActual('recurringAnnualEur', v)} suffix="€/yr" /></Field>
        </div>
        <div>
          <label className="form-label">Notes</label>
          <textarea value={cost.actual?.notes ?? ''} onChange={e => updateActual('notes', e.target.value)} className="form-textarea" rows={2} />
        </div>
      </div>

      {/* TCO summary */}
      <div className="card p-5 bg-blue-pale/40 border-blue-aria/30">
        <h3 className="text-sm font-semibold mb-3">Total Cost of Ownership</h3>
        {breakdown.maintenancePending && (
          <div className="text-[11px] text-amber-700 bg-amber-sov-light rounded px-2 py-1 mb-3 flex items-center gap-1">
            <HelpCircle size={12} />
            Maintenance assessment pending — TCO excludes maintenance until completed.
          </div>
        )}
        <div className="grid md:grid-cols-4 gap-4 text-xs">
          <SummaryCell label="One-time total" value={breakdown.oneTimeTotal} />
          <SummaryCell label="Recurring/year" value={breakdown.recurringAnnualTotal} suffix="/yr" />
          <SummaryCell label="TCO year 1" value={breakdown.tcoYear1} />
          <SummaryCell label={`TCO ${breakdown.horizonYears} years`} value={breakdown.tcoHorizon} highlight />
        </div>
      </div>
    </div>
  );
}

// ─── Maintenance category editor (collapsible drivers + manual override) ──────

interface MaintCategoryEditorProps {
  question: AssessmentQuestion;
  cost: IndustrializationCost;
  onUpdateField: (field: AssessmentQuestion['fieldKey'], value: number) => void;
  onUpdateDrivers: (
    categoryKey: MaintenanceCategoryKey,
    patch: Partial<NonNullable<MaintenanceDrivers[MaintenanceCategoryKey]>> | null,
  ) => void;
}

function MaintenanceCategoryEditor({ question, cost, onUpdateField, onUpdateDrivers }: MaintCategoryEditorProps) {
  const drivers = cost.recurringAnnual?.maintenance?.drivers;
  const block = (drivers as any)?.[question.categoryKey] as Record<string, number> | undefined;
  const usingDrivers = !!block;
  const developmentEur = cost.oneTime?.developmentEur ?? 0;

  // EUR/year shown in the header. From drivers if present, else manual.
  const computed = computeMaintenanceCategoryEur(question.categoryKey, drivers, developmentEur);
  const manual = (cost.recurringAnnual?.maintenance as any)?.[question.fieldKey] as number | undefined;
  const effectiveEur = computed ?? manual ?? 0;

  const [open, setOpen] = useState(false);

  const switchToDrivers = () => {
    onUpdateDrivers(question.categoryKey, question.defaultDrivers as any);
    setOpen(true);
  };
  const switchToManual = () => {
    // Snapshot the computed EUR into the manual field so the user can keep it.
    if (computed !== null) onUpdateField(question.fieldKey, computed);
    onUpdateDrivers(question.categoryKey, null);
    setOpen(true);
  };

  return (
    <div className="border border-border rounded-sm">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full grid md:grid-cols-12 gap-2 items-center p-2 text-left hover:bg-smoke/40"
      >
        <div className="md:col-span-6 flex items-center gap-1 text-xs font-medium text-text">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {question.fieldLabel}
          <span className={`ml-1 text-[10px] rounded px-1 py-0.5 font-semibold uppercase tracking-wide ${
            usingDrivers ? 'text-blue-aria bg-blue-pale' : 'text-muted bg-smoke'
          }`}>
            {usingDrivers ? 'parameterised' : 'manual'}
          </span>
        </div>
        <div className="md:col-span-3 text-[11px] text-muted truncate">{question.formulaLabel}</div>
        <div className="md:col-span-3 text-xs font-semibold tabular-nums text-right">
          {fmt.format(effectiveEur)} €/yr
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-smoke/40 p-3 space-y-2">
          {usingDrivers ? (
            <DriverInputs
              question={question}
              block={block!}
              developmentEur={developmentEur}
              onChange={(patch) => onUpdateDrivers(question.categoryKey, patch as any)}
            />
          ) : (
            <div className="grid md:grid-cols-12 gap-2 items-center">
              <label className="md:col-span-4 text-[11px] text-muted">Manual annual cost</label>
              <div className="md:col-span-4">
                <NumInput
                  value={manual}
                  onChange={v => onUpdateField(question.fieldKey, v)}
                  suffix="€/yr"
                />
              </div>
              <p className="md:col-span-4 text-[11px] text-muted italic">
                Free-form entry. Switch to parameterised below to expose the calculation drivers.
              </p>
            </div>
          )}
          <div className="flex justify-end pt-1">
            {usingDrivers ? (
              <button
                onClick={switchToManual}
                className="text-[11px] text-muted hover:text-red-sov underline"
                title="Drop the parameter breakdown and keep a fixed euro value."
              >
                Switch to manual override
              </button>
            ) : (
              <button
                onClick={switchToDrivers}
                className="text-[11px] text-blue-aria hover:underline"
                title="Expose the calculation drivers (hours, rates, frequency) so the figure becomes auditable."
              >
                Switch to parameterised
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface DriverInputsProps {
  question: AssessmentQuestion;
  block: Record<string, number>;
  developmentEur: number;
  onChange: (patch: Record<string, number>) => void;
}

/** Per-category driver fields. Layout/labels are tied to the category key. */
function DriverInputs({ question, block, developmentEur, onChange }: DriverInputsProps) {
  const num = (k: string) => Number(block?.[k] ?? 0);
  const set = (k: string, v: number) => onChange({ [k]: v });

  switch (question.categoryKey) {
    case 'corrective':
      return (
        <div className="grid md:grid-cols-12 gap-2 items-center">
          <DriverField className="md:col-span-4" label="% of development">
            <NumInput value={num('pctOfDevelopment')} onChange={v => set('pctOfDevelopment', v)} suffix="%" />
          </DriverField>
          <p className="md:col-span-8 text-[11px] text-muted">
            Applied on development one-time cost ({fmt.format(developmentEur)} €).
            Typical: 8–15%/year.
          </p>
        </div>
      );
    case 'evolutive':
      return (
        <div className="grid md:grid-cols-12 gap-2">
          <DriverField className="md:col-span-4" label="Features per year">
            <NumInput value={num('featuresPerYear')} onChange={v => set('featuresPerYear', v)} suffix="" />
          </DriverField>
          <DriverField className="md:col-span-4" label="Hours per feature">
            <NumInput value={num('hoursPerFeature')} onChange={v => set('hoursPerFeature', v)} suffix="h" />
          </DriverField>
          <DriverField className="md:col-span-4" label="Hourly rate">
            <NumInput value={num('hourlyRateEur')} onChange={v => set('hourlyRateEur', v)} suffix="€/h" />
          </DriverField>
        </div>
      );
    case 'modelRetraining':
      return (
        <div className="grid md:grid-cols-12 gap-2">
          <DriverField className="md:col-span-3" label="Cycles per year">
            <NumInput value={num('cyclesPerYear')} onChange={v => set('cyclesPerYear', v)} suffix="" />
          </DriverField>
          <DriverField className="md:col-span-3" label="Hours per cycle">
            <NumInput value={num('hoursPerCycle')} onChange={v => set('hoursPerCycle', v)} suffix="h" />
          </DriverField>
          <DriverField className="md:col-span-3" label="Hourly rate">
            <NumInput value={num('hourlyRateEur')} onChange={v => set('hourlyRateEur', v)} suffix="€/h" />
          </DriverField>
          <DriverField className="md:col-span-3" label="Cloud / cycle">
            <NumInput value={num('cloudComputePerCycleEur')} onChange={v => set('cloudComputePerCycleEur', v)} suffix="€" />
          </DriverField>
        </div>
      );
    case 'driftMonitoring':
      return (
        <div className="grid md:grid-cols-12 gap-2">
          <DriverField className="md:col-span-3" label="Checks per year">
            <NumInput value={num('checksPerYear')} onChange={v => set('checksPerYear', v)} suffix="" />
          </DriverField>
          <DriverField className="md:col-span-3" label="Hours per check">
            <NumInput value={num('hoursPerCheck')} onChange={v => set('hoursPerCheck', v)} suffix="h" />
          </DriverField>
          <DriverField className="md:col-span-3" label="Hourly rate">
            <NumInput value={num('hourlyRateEur')} onChange={v => set('hourlyRateEur', v)} suffix="€/h" />
          </DriverField>
          <DriverField className="md:col-span-3" label="Tooling / year">
            <NumInput value={num('toolingEurPerYear')} onChange={v => set('toolingEurPerYear', v)} suffix="€/yr" />
          </DriverField>
        </div>
      );
    case 'revalidation':
      return (
        <div className="grid md:grid-cols-12 gap-2">
          <DriverField className="md:col-span-3" label="Cycles per year">
            <NumInput value={num('cyclesPerYear')} onChange={v => set('cyclesPerYear', v)} suffix="" />
          </DriverField>
          <DriverField className="md:col-span-3" label="Hours per cycle">
            <NumInput value={num('hoursPerCycle')} onChange={v => set('hoursPerCycle', v)} suffix="h" />
          </DriverField>
          <DriverField className="md:col-span-3" label="Hourly rate (senior)">
            <NumInput value={num('hourlyRateEur')} onChange={v => set('hourlyRateEur', v)} suffix="€/h" />
          </DriverField>
          <DriverField className="md:col-span-3" label="External audit / cycle">
            <NumInput value={num('externalAuditEurPerCycle')} onChange={v => set('externalAuditEurPerCycle', v)} suffix="€" />
          </DriverField>
        </div>
      );
    case 'l1l2Support':
      return (
        <div className="grid md:grid-cols-12 gap-2">
          <DriverField className="md:col-span-4" label="Tickets per month">
            <NumInput value={num('ticketsPerMonth')} onChange={v => set('ticketsPerMonth', v)} suffix="" />
          </DriverField>
          <DriverField className="md:col-span-4" label="Hours per ticket">
            <NumInput value={num('hoursPerTicket')} onChange={v => set('hoursPerTicket', v)} suffix="h" />
          </DriverField>
          <DriverField className="md:col-span-4" label="Hourly rate">
            <NumInput value={num('hourlyRateEur')} onChange={v => set('hourlyRateEur', v)} suffix="€/h" />
          </DriverField>
        </div>
      );
    case 'vendorSla':
      return (
        <div className="grid md:grid-cols-12 gap-2">
          <DriverField className="md:col-span-4" label="Monthly fee">
            <NumInput value={num('monthlyFeeEur')} onChange={v => set('monthlyFeeEur', v)} suffix="€/mo" />
          </DriverField>
          <p className="md:col-span-8 text-[11px] text-muted">Annualised as monthly fee × 12.</p>
        </div>
      );
  }
}

function DriverField({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-[10px] text-muted uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

function SummaryCell({ label, value, suffix = '', highlight = false }: { label: string; value: number; suffix?: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded ${highlight ? 'bg-blue-aria text-white' : 'bg-white border border-border'}`}>
      <div className={`text-[10px] ${highlight ? 'text-blue-pale' : 'text-muted'} uppercase tracking-wide`}>{label}</div>
      <div className="text-base font-semibold tabular-nums mt-0.5">
        {fmt.format(value)} €{suffix}
      </div>
    </div>
  );
}

// ─── Profile catalog hook ─────────────────────────────────────────────────────
// Lazy-loaded once per page mount; the result is cached at module scope so it
// is shared across all OneTimeLine instances. Refreshed on first hook usage.

let profilesCache: ProfileCatalogEntry[] | null = null;
const profileSubscribers = new Set<(p: ProfileCatalogEntry[]) => void>();

async function loadProfiles(): Promise<ProfileCatalogEntry[]> {
  const res = await fetch('/api/admin/profiles?activeOnly=true');
  if (!res.ok) return [];
  const list = (await res.json()) as ProfileCatalogEntry[];
  profilesCache = list;
  for (const cb of profileSubscribers) cb(list);
  return list;
}

function useProfiles(): ProfileCatalogEntry[] {
  const [profiles, setProfiles] = useState<ProfileCatalogEntry[]>(profilesCache ?? []);
  useEffect(() => {
    if (profilesCache === null) loadProfiles().then(setProfiles);
    profileSubscribers.add(setProfiles);
    return () => { profileSubscribers.delete(setProfiles); };
  }, []);
  return profiles;
}

// ─── One-time line with profile-hour breakdown ────────────────────────────────

interface OneTimeLineProps {
  label: string;
  fieldKey: OneTimeFieldKey;
  eurFieldKey: 'developmentEur' | 'integrationEur' | 'infraSetupEur' | 'securityComplianceEur' | 'trainingChangeMgmtEur';
  cost: IndustrializationCost;
  onChange: (patch: Partial<IndustrializationCost>) => void;
}

function OneTimeLine({ label, fieldKey, eurFieldKey, cost, onChange }: OneTimeLineProps) {
  const profiles = useProfiles();
  const profileMap = useMemo(() => new Map(profiles.map(p => [p._id, p])), [profiles]);
  const lines: ProfileHoursLine[] = (cost.oneTime?.profileHours as any)?.[fieldKey] ?? [];
  const [open, setOpen] = useState(lines.length > 0);

  const sumFromLines = lines.reduce(
    (s, l) => s + (l.hours ?? 0) * (l.profileRateSnapshot ?? 0),
    0,
  );
  const usingBreakdown = lines.length > 0;
  const eurValue = (cost.oneTime as any)?.[eurFieldKey] ?? 0;

  const patchProfileHours = (next: ProfileHoursLine[]) => {
    onChange({
      oneTime: {
        ...cost.oneTime,
        // Server will recompute …Eur from the lines, but we also update it
        // locally so the UI reflects the new sum immediately.
        [eurFieldKey]: Math.round(next.reduce((s, l) => s + (l.hours ?? 0) * (l.profileRateSnapshot ?? 0), 0)),
        profileHours: { ...(cost.oneTime?.profileHours ?? {}), [fieldKey]: next },
      } as any,
    });
  };

  const updateLine = (idx: number, patch: Partial<ProfileHoursLine>) => {
    const next = lines.map((l, i) => i === idx ? { ...l, ...patch } : l);
    patchProfileHours(next);
  };

  const addLine = () => {
    const first = profiles[0];
    const line: ProfileHoursLine = first
      ? { profileId: first._id, profileNameSnapshot: first.name, profileRateSnapshot: first.hourlyRateEur, hours: 0 }
      : { hours: 0 };
    patchProfileHours([...lines, line]);
    setOpen(true);
  };

  const removeLine = (idx: number) => patchProfileHours(lines.filter((_, i) => i !== idx));

  const onPickProfile = (idx: number, profileId: string) => {
    const p = profileMap.get(profileId);
    if (!p) return;
    updateLine(idx, {
      profileId: p._id,
      profileNameSnapshot: p.name,
      profileRateSnapshot: p.hourlyRateEur,
    });
  };

  const updateEur = (v: number) => onChange({ oneTime: { ...cost.oneTime, [eurFieldKey]: v } as any });

  return (
    <div className="border border-border rounded-sm">
      <div className="grid md:grid-cols-12 gap-2 items-center p-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="md:col-span-4 flex items-center gap-1 text-xs font-medium text-text hover:text-blue-aria text-left"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {label}
          {usingBreakdown && (
            <span className="ml-1 text-[10px] text-blue-aria bg-blue-pale rounded px-1 py-0.5 font-semibold uppercase tracking-wide">
              {lines.length} profile-line{lines.length !== 1 ? 's' : ''}
            </span>
          )}
        </button>
        <div className="md:col-span-3">
          <NumInput value={eurValue} onChange={updateEur} disabled={usingBreakdown} />
        </div>
        <div className="md:col-span-5 text-[11px] text-muted">
          {usingBreakdown
            ? <>Σ profile-hours = {fmt.format(sumFromLines)} € (auto)</>
            : <>Direct entry. Click <em>{label}</em> above to break down by profile.</>}
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-smoke/40 p-2 space-y-1.5">
          {profiles.length === 0 && (
            <p className="text-[11px] text-amber-700 bg-amber-sov-light rounded px-2 py-1">
              No active profiles in the catalog yet.{' '}
              <a href="/admin/profiles" className="underline">Create one →</a>
            </p>
          )}
          {lines.length === 0 ? (
            <p className="text-[11px] text-muted">No profile-hour lines for this cost yet.</p>
          ) : (
            <div className="space-y-1.5">
              {lines.map((l, i) => {
                const p = l.profileId ? profileMap.get(l.profileId) : undefined;
                const archived = !!l.profileId && !p; // profile id present but not in active list
                return (
                  <div key={i} className="grid md:grid-cols-12 gap-2 items-center">
                    <div className="md:col-span-5">
                      <select
                        value={l.profileId ?? ''}
                        onChange={(e) => onPickProfile(i, e.target.value)}
                        className="form-input text-xs"
                      >
                        <option value="" disabled>Pick a profile…</option>
                        {profiles.map(pp => (
                          <option key={pp._id} value={pp._id}>
                            {pp.name} — {pp.role} (€{pp.hourlyRateEur}/h)
                          </option>
                        ))}
                        {archived && (
                          <option value={l.profileId} disabled>
                            {l.profileNameSnapshot ?? '(archived)'} — archived (€{l.profileRateSnapshot ?? 0}/h)
                          </option>
                        )}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <div className="relative">
                        <input
                          type="number" min={0} step={1}
                          className="form-input text-xs pr-6 tabular-nums"
                          value={l.hours ?? 0}
                          onChange={e => updateLine(i, { hours: Number(e.target.value) || 0 })}
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted">h</span>
                      </div>
                    </div>
                    <div className="md:col-span-2 text-[11px] text-muted tabular-nums">
                      × €{(l.profileRateSnapshot ?? 0).toFixed(2)}/h
                    </div>
                    <div className="md:col-span-2 text-xs font-semibold tabular-nums text-right">
                      {fmt.format((l.hours ?? 0) * (l.profileRateSnapshot ?? 0))} €
                    </div>
                    <button
                      onClick={() => removeLine(i)}
                      className="md:col-span-1 text-muted hover:text-red-sov justify-self-end p-1"
                      title="Remove line"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={addLine}
              disabled={profiles.length === 0}
              className="text-[11px] text-blue-aria border border-blue-aria/40 rounded px-2 py-1 hover:bg-blue-pale transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <Plus size={11} /> Add profile-hour line
            </button>
            {usingBreakdown && (
              <button
                onClick={() => patchProfileHours([])}
                className="text-[11px] text-muted hover:text-red-sov underline"
                title="Clear breakdown and revert to a free-text euro value"
              >
                Clear breakdown
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
