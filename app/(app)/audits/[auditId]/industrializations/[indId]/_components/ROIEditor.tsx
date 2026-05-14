'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Lock, Unlock } from 'lucide-react';
import type { IndustrializationROI, IndustrializationCost } from '@/lib/types';
import { computeROIBreakdown } from '@/lib/calculations';

// ─── Inheritance ──────────────────────────────────────────────────────────────
// Compute ROI defaults derived from the linked use case and process.

interface RoiInheritance {
  /** Annual hours of manual work the use case targets (Σ hoursPerExecution × annualReps). */
  annualHoursManual: number;
  /** Weighted average hourly rate across the profiles the use case touches. */
  avgHourlyCostEur: number;
  /** Total time saved per execution (sum of hours per profile). */
  timeSavedPerRun: number;
  /** Sum of estimatedTimeHours across the activities the UC targets. */
  targetHoursPerRun: number;
  /** Time saving as a % of the targeted activities' duration (saved/target × 100). */
  timeSavingPct: number;
  /** Annual repetitions inherited from process B3. */
  annualReps: number;
  /** Number of distinct profiles found in B1. */
  profilesUsed: number;
  /** Human-readable rationale of where each number comes from. */
  rationale: string;
  /** Has enough data to inherit. */
  hasData: boolean;
}

export function deriveRoiInheritance(
  useCase?: {
    cuId?: string;
    timeSavedPerProfile?: { profileId?: string; role?: string; hoursPerExecution: number }[];
    targetActivities?: string[];
  } | null,
  process?: {
    procId?: string;
    b1?: { profiles?: { id: string; role?: string; count?: number; hourlyRateEur?: number }[] };
    b3?: { annualRepetitions?: number; activities?: { id: string; name?: string; estimatedTimeHours?: number }[] };
  } | null,
): RoiInheritance {
  const tspe = useCase?.timeSavedPerProfile ?? [];
  const profiles = process?.b1?.profiles ?? [];
  const annualReps = process?.b3?.annualRepetitions ?? 0;
  const activities = process?.b3?.activities ?? [];
  const targetActivityIds = new Set(useCase?.targetActivities ?? []);
  const targetHoursPerRun = activities
    .filter(a => targetActivityIds.has(a.id))
    .reduce((s, a) => s + (a.estimatedTimeHours ?? 0), 0);

  // Index by id and by normalized role. AI-imported UCs only carry `role`
  // (no profileId), so matching by id alone would silently drop their hours
  // from the weighted-rate calculation.
  const norm = (s?: string) => (s ?? '').trim().toLowerCase();
  const profileById = new Map(profiles.map(p => [p.id, p]));
  const profileByRole = new Map(profiles.filter(p => p.role).map(p => [norm(p.role), p]));

  let weightedCost = 0;
  let weightTotal = 0;
  let timeSavedPerRun = 0;
  let usedProfiles = 0;

  const breakdownLines: string[] = [];
  for (const entry of tspe) {
    const hrs = entry.hoursPerExecution ?? 0;
    if (hrs <= 0) continue;
    timeSavedPerRun += hrs;
    const p = (entry.profileId ? profileById.get(entry.profileId) : undefined)
      ?? (entry.role ? profileByRole.get(norm(entry.role)) : undefined);
    const rate = p?.hourlyRateEur ?? 0;
    const label = p?.role || entry.role || (entry.profileId ? `${entry.profileId.slice(0, 6)}…` : 'profile');
    if (rate > 0) {
      weightedCost += hrs * rate;
      weightTotal += hrs;
      usedProfiles++;
      breakdownLines.push(`${label} ${hrs.toFixed(1)}h × €${rate}/h`);
    } else if (p) {
      breakdownLines.push(`${label} ${hrs.toFixed(1)}h × (no rate)`);
    } else {
      breakdownLines.push(`${label} ${hrs.toFixed(1)}h × (profile not found in B1)`);
    }
  }

  const avgHourlyCostEur = weightTotal > 0 ? weightedCost / weightTotal : 0;
  const annualHoursManual = timeSavedPerRun * annualReps;
  const timeSavingPct = targetHoursPerRun > 0
    ? Math.min(100, (timeSavedPerRun / targetHoursPerRun) * 100)
    : 0;

  const cuRef = useCase?.cuId ?? 'use case';
  const procRef = process?.procId ?? 'process';
  const rationale = (annualReps === 0 || timeSavedPerRun === 0)
    ? `Cannot derive baseline yet. Need ${cuRef}.timeSavedPerProfile (${tspe.length} entries, ${timeSavedPerRun}h/run) and ${procRef}.b3.annualRepetitions (${annualReps}/yr).`
    : `Annual hours = ${timeSavedPerRun.toFixed(1)}h/run × ${annualReps} runs/yr (from ${procRef}.b3) = ${(annualHoursManual).toLocaleString('en-GB', { maximumFractionDigits: 0 })}h/yr. ` +
      `Weighted hourly rate = ${weightTotal > 0 ? `€${avgHourlyCostEur.toFixed(2)}/h` : 'not available (no profile rates set)'}` +
      (breakdownLines.length ? ` — ${breakdownLines.join(' + ')}. ` : '. ') +
      (targetHoursPerRun > 0
        ? `Time saving = ${timeSavedPerRun.toFixed(1)}h saved / ${targetHoursPerRun.toFixed(1)}h targeted = ${timeSavingPct.toFixed(0)}%.`
        : `Time saving % cannot be derived (UC has no targetActivities or activities have no estimatedTimeHours).`);

  return {
    annualHoursManual,
    avgHourlyCostEur,
    timeSavedPerRun,
    targetHoursPerRun,
    timeSavingPct,
    annualReps,
    profilesUsed: usedProfiles,
    rationale,
    hasData: timeSavedPerRun > 0 && annualReps > 0,
  };
}

// ─── UI primitives ────────────────────────────────────────────────────────────

const fmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

function NumInput({ value, onChange, suffix = '€', step = 1, disabled = false }: {
  value?: number; onChange: (v: number) => void; suffix?: string; step?: number; disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        min={0}
        step={step}
        value={value ?? 0}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className={`form-input pr-10 text-xs tabular-nums ${disabled ? 'bg-slate-50 text-muted cursor-not-allowed' : ''}`}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted">{suffix}</span>
    </div>
  );
}

function Field({ label, children, hint, badge }: { label: string; children: React.ReactNode; hint?: string; badge?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="form-label">{label}</label>
        {badge}
      </div>
      {children}
      {hint && <p className="text-[10px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

function dateInput(value: Date | string | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

function InheritedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold text-blue-aria bg-blue-pale rounded px-1.5 py-0.5">
      <Sparkles size={9} /> from UC
    </span>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

interface Props {
  roi: IndustrializationROI;
  cost: IndustrializationCost;
  onChange: (patch: Partial<IndustrializationROI>) => void;
  /** Optional: linked use case (populated) for inheritance. */
  useCase?: { cuId?: string; timeSavedPerProfile?: { profileId: string; hoursPerExecution: number }[] } | null;
  /** Optional: linked process (populated) for inheritance. */
  process?: { procId?: string; b1?: { profiles?: { id: string; role?: string; count?: number; hourlyRateEur?: number }[] }; b3?: { annualRepetitions?: number } } | null;
}

export function ROIEditor({ roi, cost, onChange, useCase, process }: Props) {
  const inherit = useMemo(() => deriveRoiInheritance(useCase, process), [useCase, process]);
  const breakdown = computeROIBreakdown(roi, cost);

  // Track which baseline fields the user has manually overridden, so we don't
  // keep stomping over their edits when inheritance changes.
  const [overrides, setOverrides] = useState<{ hours: boolean; rate: boolean; saving: boolean; timeSaving: boolean }>({
    hours: (roi.baseline?.annualHoursManual ?? 0) > 0,
    rate: (roi.baseline?.avgHourlyCostEur ?? 0) > 0,
    saving: (roi.expected?.annualSavingEur ?? 0) > 0,
    timeSaving: (roi.expected?.timeSavingPct ?? 0) > 0,
  });

  // Auto-pre-fill empty baseline fields with inherited values once data is available.
  useEffect(() => {
    if (!inherit.hasData) return;
    const patch: any = { baseline: { ...roi.baseline }, expected: { ...roi.expected } };
    let dirty = false;
    if (!overrides.hours && (roi.baseline?.annualHoursManual ?? 0) === 0 && inherit.annualHoursManual > 0) {
      patch.baseline.annualHoursManual = Math.round(inherit.annualHoursManual);
      dirty = true;
    }
    if (!overrides.rate && (roi.baseline?.avgHourlyCostEur ?? 0) === 0 && inherit.avgHourlyCostEur > 0) {
      patch.baseline.avgHourlyCostEur = Math.round(inherit.avgHourlyCostEur * 100) / 100;
      dirty = true;
    }
    if (!overrides.timeSaving && (roi.expected?.timeSavingPct ?? 0) === 0 && inherit.timeSavingPct > 0) {
      patch.expected.timeSavingPct = Math.round(inherit.timeSavingPct);
      dirty = true;
    }
    if (dirty) onChange(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inherit.annualHoursManual, inherit.avgHourlyCostEur, inherit.timeSavingPct, inherit.hasData]);

  const updateBaseline = (field: keyof IndustrializationROI['baseline'], v: number) => {
    if (field === 'annualHoursManual') setOverrides(o => ({ ...o, hours: true }));
    if (field === 'avgHourlyCostEur') setOverrides(o => ({ ...o, rate: true }));
    onChange({ baseline: { ...roi.baseline, [field]: v } });
  };
  const updateExpected = (field: keyof IndustrializationROI['expected'], v: number) => {
    if (field === 'annualSavingEur') setOverrides(o => ({ ...o, saving: true }));
    if (field === 'timeSavingPct') setOverrides(o => ({ ...o, timeSaving: true }));
    onChange({ expected: { ...roi.expected, [field]: v } });
  };
  const updateConfirmed = (field: keyof IndustrializationROI['confirmed'], v: any) =>
    onChange({ confirmed: { ...roi.confirmed, [field]: v } });

  const resetBaselineFromUC = () => {
    setOverrides({ hours: false, rate: false, saving: false });
    onChange({
      baseline: {
        ...roi.baseline,
        annualHoursManual: Math.round(inherit.annualHoursManual),
        avgHourlyCostEur: Math.round(inherit.avgHourlyCostEur * 100) / 100,
      },
    });
  };

  // Time saving % is inherited from the UC: hoursSaved/run ÷ targetActivities hours/run.
  // When inheritance is unavailable (no targetActivities or no estimatedTimeHours)
  // we fall back to 0 — the user can still type an explicit override.
  const expectedTimeSavingPct = roi.expected?.timeSavingPct ?? 0;
  const expectedTimeSavingDisplay = expectedTimeSavingPct > 0
    ? expectedTimeSavingPct
    : (inherit.timeSavingPct > 0 ? Math.round(inherit.timeSavingPct) : 0);
  const expectedSavingAuto = breakdown.expectedAnnualSavingEur;
  const showAutoSavingHint = !overrides.saving;

  return (
    <div className="space-y-5">
      {/* Inheritance rationale banner */}
      {inherit.hasData && (
        <div className="card bg-blue-pale/40 border-blue-aria/30 p-3 flex items-start gap-2">
          <Sparkles size={14} className="text-blue-aria mt-0.5 shrink-0" />
          <div className="flex-1 text-[11px] text-text leading-snug">
            <span className="font-semibold">Baseline inherited from {useCase?.cuId ?? 'UC'} × {process?.procId ?? 'process'}.</span>{' '}
            {inherit.rationale}
          </div>
          <button
            onClick={resetBaselineFromUC}
            className="text-[11px] text-blue-aria border border-blue-aria/40 rounded px-2 py-0.5 hover:bg-white shrink-0"
            title="Replace baseline annual hours and hourly rate with the inherited values"
          >
            Reset from UC
          </button>
        </div>
      )}
      {!inherit.hasData && (useCase || process) && (
        <div className="card bg-amber-sov-light border-amber-sov/30 p-3 text-[11px] text-text">
          {inherit.rationale}
        </div>
      )}

      {/* Baseline */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Baseline (pre-AI situation)</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <Field
            label="Annual hours done manually"
            hint="Σ hoursPerExecution from the UC × annualRepetitions from the process B3."
            badge={!overrides.hours && inherit.hasData ? <InheritedBadge /> : <span className="text-[10px] text-muted inline-flex items-center gap-1"><Unlock size={9} /> overridden</span>}
          >
            <NumInput value={roi.baseline?.annualHoursManual} onChange={v => updateBaseline('annualHoursManual', v)} suffix="h" />
          </Field>
          <Field
            label="Average loaded hourly cost"
            hint="Weighted by hoursPerExecution across the profiles touched by the UC."
            badge={!overrides.rate && inherit.hasData && inherit.avgHourlyCostEur > 0 ? <InheritedBadge /> : <span className="text-[10px] text-muted inline-flex items-center gap-1"><Unlock size={9} /> overridden</span>}
          >
            <NumInput value={roi.baseline?.avgHourlyCostEur} onChange={v => updateBaseline('avgHourlyCostEur', v)} suffix="€/h" step={0.5} />
          </Field>
          <Field label="Annual error / rework rate" hint="% of work redone / defective">
            <NumInput value={roi.baseline?.annualErrorRate} onChange={v => updateBaseline('annualErrorRate', v)} suffix="%" />
          </Field>
          <Field label="Annual quality cost" hint="Cost attributable to errors, rework, defects">
            <NumInput value={roi.baseline?.qualityCostEur} onChange={v => updateBaseline('qualityCostEur', v)} />
          </Field>
        </div>
        <div className="text-xs text-muted text-right border-t border-border pt-2">
          Baseline annual cost: <span className="font-semibold text-text">{fmt.format(breakdown.baselineAnnualCostEur)} €/year</span>
        </div>
      </div>

      {/* Expected — amber accent (preliminary) */}
      <div className="card p-5 space-y-3 border-l-4 border-l-amber-sov bg-amber-sov-light/30">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            Expected impact
            <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700 bg-amber-sov-light rounded px-1.5 py-0.5">preliminary</span>
          </h3>
          <span className="text-[11px] text-muted">From UC — review with POC results</span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <Field
            label="Time saving %"
            hint={
              overrides.timeSaving
                ? 'Manual override.'
                : inherit.timeSavingPct > 0
                  ? `From UC: ${inherit.timeSavedPerRun.toFixed(1)}h saved / ${inherit.targetHoursPerRun.toFixed(1)}h targeted. Adjust with POC findings.`
                  : 'No targetActivities or estimatedTimeHours on UC — set those in B5 to inherit.'
            }
            badge={!overrides.timeSaving && inherit.timeSavingPct > 0 ? <InheritedBadge /> : (overrides.timeSaving ? <span className="text-[10px] text-muted inline-flex items-center gap-1"><Unlock size={9} /> overridden</span> : undefined)}
          >
            <NumInput value={expectedTimeSavingDisplay} onChange={v => updateExpected('timeSavingPct', v)} suffix="%" />
          </Field>
          <Field label="Error reduction %"><NumInput value={roi.expected?.errorReductionPct} onChange={v => updateExpected('errorReductionPct', v)} suffix="%" /></Field>
          <Field
            label="Annual saving (€)"
            hint={showAutoSavingHint
              ? `Auto: baseline × time saving = ${fmt.format(expectedSavingAuto)} €/yr`
              : 'Manual override of baseline × time saving %.'}
            badge={showAutoSavingHint ? <span className="text-[10px] text-muted inline-flex items-center gap-1"><Lock size={9} /> auto</span> : undefined}
          >
            <NumInput
              value={overrides.saving ? (roi.expected?.annualSavingEur ?? 0) : Math.round(expectedSavingAuto)}
              onChange={v => updateExpected('annualSavingEur', v)}
              disabled={!overrides.saving}
            />
            {!overrides.saving && (
              <button
                onClick={() => setOverrides(o => ({ ...o, saving: true }))}
                className="text-[10px] text-blue-aria hover:underline mt-1"
              >
                Override
              </button>
            )}
            {overrides.saving && (
              <button
                onClick={() => { setOverrides(o => ({ ...o, saving: false })); onChange({ expected: { ...roi.expected, annualSavingEur: 0 } }); }}
                className="text-[10px] text-blue-aria hover:underline mt-1"
              >
                Use auto
              </button>
            )}
          </Field>
          <Field
            label="Payback (months)"
            hint={`Auto: oneTimeTotal ÷ netAnnualBenefit × 12. Calculated value: ${breakdown.expectedPaybackMonths === null ? 'n/a' : `${fmt1.format(breakdown.expectedPaybackMonths)} mo`}.`}
            badge={(roi.expected?.paybackMonths ?? 0) === 0 ? <span className="text-[10px] text-muted inline-flex items-center gap-1"><Lock size={9} /> auto</span> : undefined}
          >
            <NumInput
              value={(roi.expected?.paybackMonths ?? 0) > 0 ? (roi.expected?.paybackMonths ?? 0) : Math.round(breakdown.expectedPaybackMonths ?? 0)}
              onChange={v => updateExpected('paybackMonths', v)}
              suffix="mo"
              disabled={(roi.expected?.paybackMonths ?? 0) === 0}
            />
          </Field>
        </div>
        <div className="grid md:grid-cols-3 gap-3 text-xs border-t border-amber-sov/20 pt-3">
          <Summary tone="expected" label="Expected saving" value={breakdown.expectedAnnualSavingEur} suffix="/yr" />
          <Summary tone="expected" label="Net benefit (after recurring)" value={breakdown.expectedNetAnnualBenefitEur} suffix="/yr" />
          <Summary
            tone="expected"
            label="Calculated payback"
            value={breakdown.expectedPaybackMonths ?? 0}
            suffix="months"
            unit=""
            highlight={breakdown.expectedPaybackMonths !== null && breakdown.expectedPaybackMonths < 24}
            placeholder={breakdown.expectedPaybackMonths === null ? 'Negative net benefit' : null}
          />
        </div>
      </div>

      {/* Confirmed — green accent (validated) */}
      <div className="card p-5 space-y-3 border-l-4 border-l-green-sov bg-green-sov-light/30">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            Confirmed productivity savings
            <span className="text-[10px] font-medium uppercase tracking-wide text-green-700 bg-green-sov-light rounded px-1.5 py-0.5">measured</span>
          </h3>
          <span className="text-[11px] text-muted">Filled post go-live; replaces expected in dashboards</span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Measurement window — from">
            <input type="date" value={dateInput(roi.confirmed?.measuredFrom)} onChange={e => updateConfirmed('measuredFrom', e.target.value || null)} className="form-input text-xs" />
          </Field>
          <Field label="Measurement window — to">
            <input type="date" value={dateInput(roi.confirmed?.measuredTo)} onChange={e => updateConfirmed('measuredTo', e.target.value || null)} className="form-input text-xs" />
          </Field>
          <Field label="Annual hours saved (measured)">
            <NumInput value={roi.confirmed?.annualHoursSaved} onChange={v => updateConfirmed('annualHoursSaved', v)} suffix="h" />
          </Field>
          <Field label="Annual saving (measured)">
            <NumInput value={roi.confirmed?.annualSavingEur} onChange={v => updateConfirmed('annualSavingEur', v)} />
          </Field>
          <Field label="Error reduction (measured)">
            <NumInput value={roi.confirmed?.errorReductionPctMeasured} onChange={v => updateConfirmed('errorReductionPctMeasured', v)} suffix="%" />
          </Field>
          <Field label="Quality cost avoided">
            <NumInput value={roi.confirmed?.qualityCostAvoidedEur} onChange={v => updateConfirmed('qualityCostAvoidedEur', v)} />
          </Field>
          <Field label="Net annual benefit (override)">
            <NumInput value={roi.confirmed?.netAnnualBenefitEur} onChange={v => updateConfirmed('netAnnualBenefitEur', v)} />
          </Field>
          <Field label="Actual payback (months)">
            <NumInput value={roi.confirmed?.paybackMonthsActual} onChange={v => updateConfirmed('paybackMonthsActual', v)} suffix="mo" />
          </Field>
        </div>
        <div>
          <label className="form-label">Notes</label>
          <textarea value={roi.confirmed?.notes ?? ''} onChange={e => updateConfirmed('notes', e.target.value)} className="form-textarea" rows={2} />
        </div>
        <div className="grid md:grid-cols-2 gap-3 text-xs border-t border-green-sov/20 pt-3">
          <Summary tone="confirmed" label="Confirmed net benefit" value={breakdown.confirmedNetAnnualBenefitEur} suffix="/yr" />
          <Summary
            tone="confirmed"
            label="Calculated payback"
            value={breakdown.confirmedPaybackMonths ?? 0}
            suffix="months"
            unit=""
            highlight={breakdown.confirmedPaybackMonths !== null && breakdown.confirmedPaybackMonths < 24}
            placeholder={breakdown.confirmedPaybackMonths === null ? 'Negative net benefit' : null}
          />
        </div>
      </div>
    </div>
  );
}

function Summary({ tone, label, value, suffix = '', unit = '€', highlight = false, placeholder = null as string | null }: {
  tone: 'expected' | 'confirmed';
  label: string; value: number; suffix?: string; unit?: string; highlight?: boolean; placeholder?: string | null;
}) {
  const toneCls = tone === 'expected'
    ? (highlight ? 'bg-amber-sov-light border-amber-sov/40' : 'bg-white border-amber-sov/20')
    : (highlight ? 'bg-green-sov-light border-green-sov/40' : 'bg-white border-green-sov/20');
  const labelCls = tone === 'expected' ? 'text-amber-700' : 'text-green-700';
  return (
    <div className={`p-3 rounded border ${toneCls}`}>
      <div className={`text-[10px] uppercase tracking-wide font-semibold ${labelCls}`}>{label}</div>
      <div className="text-base font-semibold tabular-nums mt-0.5">
        {placeholder ?? `${fmt.format(value)} ${unit}${suffix}`}
      </div>
    </div>
  );
}
