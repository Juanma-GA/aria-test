'use client';

/**
 * Catalog-driven compute calculator for any entity that needs to project
 * annual recurring AI compute cost (POC, Industrialization, …).
 *
 * Generic shape: takes a `breakdown` value and an `onChange(next, computedAnnualEur)`
 * callback. The hosting page decides where to persist the breakdown and what to
 * do with the calculated euro value (write to its own scalar field).
 */

import { useEffect, useMemo, useState } from 'react';
import { Cpu, Cloud, Server, Calculator, ChevronDown, ChevronRight } from 'lucide-react';
import type { CatalogEntry, ComputeBreakdown, AIModelDeploymentMode } from '@/lib/types';
import { computeAnnualCompute } from '@/lib/calculations';

const fmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

const MODE_TABS: { key: AIModelDeploymentMode; label: string; Icon: typeof Cloud; hint: string }[] = [
  { key: 'cloud_api',  label: 'Cloud API',  Icon: Cloud,  hint: 'Token-based vendor pricing.' },
  { key: 'on_premise', label: 'On-premise', Icon: Server, hint: 'GPU amortisation + electricity.' },
  { key: 'hybrid',     label: 'Hybrid',     Icon: Cpu,    hint: 'Split cloud / on-prem by execution share.' },
];

export const DEFAULT_COMPUTE_BREAKDOWN: ComputeBreakdown = {
  mode: 'cloud_api',
  annualReps: 0,
  inputTokensPerExec: 1000,
  outputTokensPerExec: 500,
  nGpus: 1,
  amortizationYears: 4,
  electricityRateEur: 0.15,
  onPremPct: 50,
  workingHoursPerDay: 10,
  workingDaysPerWeek: 5,
  workingWeeksPerYear: 48,
  peakConcurrentUsers: 1,
  peakUsageFractionOfWindow: 25,
  hwPreexisting: false,
};

interface Props {
  breakdown?: ComputeBreakdown | null;
  /**
   * Called whenever the breakdown changes. Receives the new breakdown and the
   * derived annual cost in EUR (also computed server-side so this is just for
   * an immediate UI update on the hosting page).
   */
  onChange: (next: ComputeBreakdown, computedAnnualEur: number) => void;
  /** Card title — "Compute calculator" by default. */
  title?: string;
  /** Optional initial-open state when no breakdown exists yet. */
  defaultOpen?: boolean;
  /** B3 annual repetitions for override detection. */
  b3AnnualReps?: number;
}

export function ComputeCalculator({ breakdown, onChange, title = 'Compute calculator', defaultOpen = false, b3AnnualReps }: Props) {
  const b: ComputeBreakdown = breakdown ?? DEFAULT_COMPUTE_BREAKDOWN;
  const usingCalc = !!breakdown?.mode;
  const [open, setOpen] = useState(usingCalc || defaultOpen);
  const [models, setModels] = useState<CatalogEntry[]>([]);
  const [gpus, setGpus] = useState<CatalogEntry[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/catalog?kind=ai_model&activeOnly=true', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/admin/catalog?kind=gpu&activeOnly=true', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    ]).then(([m, g]) => {
      setModels(m as CatalogEntry[]);
      setGpus(g as CatalogEntry[]);
    });
  }, []);

  const calc = useMemo(() => computeAnnualCompute(b), [b]);

  const update = (patch: Partial<ComputeBreakdown>) => {
    const next: ComputeBreakdown = { ...DEFAULT_COMPUTE_BREAKDOWN, ...b, ...patch };
    const liveCalc = computeAnnualCompute(next);
    onChange(next, liveCalc.totalEur);
  };

  const setMode = (mode: AIModelDeploymentMode) => update({ mode });

  const onPickModel = (id: string) => {
    const m = models.find(x => x._id === id);
    if (!m) return;
    update({
      modelId: m._id,
      modelNameSnapshot: m.name,
      modelPriceInSnapshot: m.pricePerMInputTokens ?? 0,
      modelPriceOutSnapshot: m.pricePerMOutputTokens ?? 0,
    });
  };

  const onPickGpu = (id: string) => {
    const g = gpus.find(x => x._id === id);
    if (!g) return;
    const upg = g.concurrentUsersPerGpu ?? 0;
    const nGpus = b.nGpus ?? 1;
    update({
      gpuId: g._id,
      gpuNameSnapshot: g.name,
      gpuPriceSnapshot: g.priceEur ?? 0,
      gpuTdpSnapshot: g.tdpW ?? 0,
      concurrentUsersPerGpuSnapshot: upg,
      // Re-derive max concurrency from the new snapshot if the user hasn't
      // overridden it (i.e. it still matches the previous derived value).
      maxConcurrentUsersSupported: upg > 0 ? nGpus * upg : (b.maxConcurrentUsersSupported ?? 0),
    });
  };

  const clearBreakdown = () => {
    // Set mode='' so the server returns computedAnnualEur=0 (no calc) and the
    // host page re-enables manual euro entry. Snapshots stay so the user can
    // re-activate without re-typing.
    update({ mode: '' });
  };

  const showCloud = b.mode === 'cloud_api' || b.mode === 'hybrid';
  const showOnPrem = b.mode === 'on_premise' || b.mode === 'hybrid';

  return (
    <div className="border border-border rounded-sm">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-smoke/40 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-text">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Calculator size={13} className="text-blue-aria" />
          {title}
          {usingCalc && (
            <span className="ml-1 text-[10px] text-blue-aria bg-blue-pale rounded px-1 py-0.5 font-semibold uppercase tracking-wide">
              {(b.mode ?? '').replace('_', ' ')} · {fmt.format(calc.totalEur)} €/yr
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-border bg-smoke/30 p-3 space-y-3">
          {/* Mode tabs */}
          <div className="flex gap-1">
            {MODE_TABS.map(t => {
              const Icon = t.Icon;
              const active = b.mode === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setMode(t.key)}
                  className={`flex-1 px-3 py-1.5 text-xs rounded border flex items-center justify-center gap-1 transition-colors ${
                    active ? 'bg-blue-aria text-white border-blue-aria' : 'bg-white text-muted border-border hover:border-blue-aria'
                  }`}
                  title={t.hint}
                >
                  <Icon size={11} /> {t.label}
                </button>
              );
            })}
          </div>

          {/* Cloud inputs */}
          {showCloud && (
            <div className="bg-white border border-border rounded-sm p-3 space-y-2">
              <div className="text-[11px] font-semibold text-text flex items-center gap-1">
                <Cloud size={11} className="text-blue-aria" /> Cloud API
              </div>
              <div className="grid md:grid-cols-12 gap-2 items-end">
                <div className="md:col-span-5">
                  <label className="text-[10px] uppercase tracking-wide text-muted">Model</label>
                  <select className="form-input text-xs" value={b.modelId ?? ''} onChange={e => onPickModel(e.target.value)}>
                    <option value="" disabled>Pick a model…</option>
                    {models.map(m => (
                      <option key={m._id} value={m._id}>
                        {m.name}{m.vendor ? ` (${m.vendor})` : ''} — €{(m.pricePerMInputTokens ?? 0).toFixed(2)}/€{(m.pricePerMOutputTokens ?? 0).toFixed(2)}/M
                      </option>
                    ))}
                    {b.modelId && !models.find(m => m._id === b.modelId) && (
                      <option value={b.modelId} disabled>
                        {b.modelNameSnapshot ?? '(archived)'} — archived (€{b.modelPriceInSnapshot ?? 0}/€{b.modelPriceOutSnapshot ?? 0}/M)
                      </option>
                    )}
                  </select>
                </div>
                <NumField label="Annual executions" value={b.annualReps}          onChange={v => update({ annualReps: v, annualRepsManuallyEdited: v !== (b3AnnualReps ?? 0) })}           cols={3} />
                <NumField label="In tokens / exec"  value={b.inputTokensPerExec}  onChange={v => update({ inputTokensPerExec: v })}   cols={2} />
                <NumField label="Out tokens / exec" value={b.outputTokensPerExec} onChange={v => update({ outputTokensPerExec: v })}  cols={2} />
              </div>
              <p className="text-[10px] text-muted">
                {fmt.format(b.annualReps ?? 0)} reps × ({fmt.format(b.inputTokensPerExec ?? 0)} in × €{(b.modelPriceInSnapshot ?? 0).toFixed(2)}/M
                {' '}+ {fmt.format(b.outputTokensPerExec ?? 0)} out × €{(b.modelPriceOutSnapshot ?? 0).toFixed(2)}/M)
                {' '}= <span className="font-semibold text-text">{fmt.format(calc.cloudCostEur)} €/yr cloud</span>
              </p>
              {b.annualRepsManuallyEdited && (
                <div className="bg-amber-50 border border-amber-300 rounded text-[10px] text-amber-900 p-2">
                  <span className="font-semibold">⚠️ Manual override:</span> Annual executions differ from B3 value ({b3AnnualReps ?? 0}).
                </div>
              )}
            </div>
          )}

          {/* On-prem inputs */}
          {showOnPrem && (
            <div className="bg-white border border-border rounded-sm p-3 space-y-2">
              <div className="text-[11px] font-semibold text-text flex items-center gap-1">
                <Server size={11} className="text-blue-aria" /> On-premise
              </div>
              <div className="grid md:grid-cols-12 gap-2 items-end">
                <div className="md:col-span-4">
                  <label className="text-[10px] uppercase tracking-wide text-muted">GPU</label>
                  <select className="form-input text-xs" value={b.gpuId ?? ''} onChange={e => onPickGpu(e.target.value)}>
                    <option value="" disabled>Pick a GPU…</option>
                    {gpus.map(g => (
                      <option key={g._id} value={g._id}>
                        {g.name} — {g.vramGb ?? '?'}GB · {g.tdpW ?? '?'}W · €{(g.priceEur ?? 0).toLocaleString()}
                      </option>
                    ))}
                    {b.gpuId && !gpus.find(g => g._id === b.gpuId) && (
                      <option value={b.gpuId} disabled>
                        {b.gpuNameSnapshot ?? '(archived)'} — archived
                      </option>
                    )}
                  </select>
                </div>
                <NumField label="GPUs (n)"           value={b.nGpus}              onChange={v => update({ nGpus: v })}              cols={2} />
                <NumField label="Amortisation (y)"   value={b.amortizationYears}  onChange={v => update({ amortizationYears: Math.max(1, v) })} cols={2} />
                <NumField label="€ / kWh"            value={b.electricityRateEur} onChange={v => update({ electricityRateEur: v })} cols={2} step={0.01} />
                {b.mode === 'hybrid' && (
                  <NumField label="On-prem %" value={b.onPremPct} onChange={v => update({ onPremPct: Math.max(0, Math.min(100, v)) })} cols={2} suffix="%" />
                )}
              </div>
              <p className="text-[10px] text-muted leading-snug">
                Full-capacity HW reference (before occupancy share): amortisation
                {' '}<span className="font-semibold text-text">{fmt.format(calc.hwAnnualAmortEur)} €/yr</span>{' '}·{' '}
                electricity over <span className="font-semibold">{fmt.format(calc.windowHoursPerYear)}h</span> window
                {' '}<span className="font-semibold text-text">{fmt.format(calc.hwAnnualElectricityEur)} €/yr</span>{' '}·{' '}
                full-HW total <span className="font-semibold text-text">{fmt.format(calc.hwAnnualTotalEur)} €/yr</span>.
                Imputed to this case ({Math.round(calc.occupancyShare * 100)}% occupancy):{' '}
                <span className="font-semibold text-text">{fmt.format(calc.onPremTotalEur)} €/yr</span>.
              </p>
            </div>
          )}

          {/* Operating window (on-prem / hybrid) */}
          {showOnPrem && (
            <div className="bg-white border border-border rounded-sm p-3 space-y-2">
              <div className="text-[11px] font-semibold text-text">
                Operating window
                <span className="ml-1 text-[10px] text-muted font-normal">
                  hours the HW is actually available — drives electricity + per-hour cost
                </span>
              </div>
              <div className="grid md:grid-cols-12 gap-2 items-end">
                <NumField label="Hours / day"   value={b.workingHoursPerDay  ?? 10} onChange={v => update({ workingHoursPerDay: Math.max(0, Math.min(24, v)) })} cols={3} suffix="h" />
                <NumField label="Days / week"   value={b.workingDaysPerWeek  ?? 5}  onChange={v => update({ workingDaysPerWeek: Math.max(0, Math.min(7, v)) })}  cols={3} suffix="d" />
                <NumField label="Weeks / year"  value={b.workingWeeksPerYear ?? 48} onChange={v => update({ workingWeeksPerYear: Math.max(0, Math.min(53, v)) })} cols={3} suffix="w" />
                <div className="md:col-span-3 text-[10px] text-muted">
                  → {fmt.format(calc.windowHoursPerYear)} h/year
                </div>
              </div>
            </div>
          )}

          {/* Concurrency capacity + case occupancy (on-prem / hybrid) */}
          {showOnPrem && (
            <div className="bg-white border border-border rounded-sm p-3 space-y-2">
              <div className="text-[11px] font-semibold text-text">
                Concurrency &amp; occupancy
                <span className="ml-1 text-[10px] text-muted font-normal">
                  declared HW capacity vs. this case's peak — the case only pays for its share
                </span>
              </div>
              <div className="grid md:grid-cols-12 gap-2 items-end">
                <NumField
                  label="Conc. users / GPU"
                  value={b.concurrentUsersPerGpuSnapshot ?? 0}
                  onChange={v => update({ concurrentUsersPerGpuSnapshot: Math.max(0, v), maxConcurrentUsersSupported: Math.max(0, (b.nGpus ?? 1) * Math.max(0, v)) })}
                  cols={3}
                />
                <NumField
                  label="Max concurrent (HW)"
                  value={b.maxConcurrentUsersSupported ?? calc.derivedMaxConcurrentUsers}
                  onChange={v => update({ maxConcurrentUsersSupported: Math.max(0, v) })}
                  cols={3}
                />
                <NumField
                  label="Peak concurrent (case)"
                  value={b.peakConcurrentUsers ?? 0}
                  onChange={v => update({ peakConcurrentUsers: Math.max(0, v) })}
                  cols={3}
                />
                <NumField
                  label="Peak time / window"
                  value={b.peakUsageFractionOfWindow ?? 25}
                  onChange={v => update({ peakUsageFractionOfWindow: Math.max(0, Math.min(100, v)) })}
                  cols={3}
                  suffix="%"
                />
              </div>
              {(b.peakConcurrentUsers ?? 0) > ((b.maxConcurrentUsersSupported ?? calc.derivedMaxConcurrentUsers) || 0) && (
                <p className="text-[10px] text-red-sov bg-red-sov-light rounded px-2 py-1">
                  ⚠ Peak users exceed declared HW capacity — increase GPUs or capacity, or reduce peak.
                </p>
              )}
              <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
                <label className="flex items-center gap-1.5 text-[11px] text-text">
                  <input
                    type="checkbox"
                    checked={b.hwPreexisting ?? false}
                    onChange={e => update({ hwPreexisting: e.target.checked })}
                  />
                  HW already paid for (skip CAPEX, only impute electricity)
                </label>
                <span className="text-[10px] text-muted">
                  Occupancy share: <span className="font-semibold text-text">{(calc.occupancyShare * 100).toFixed(1)}%</span>
                </span>
              </div>
            </div>
          )}

          {/* Override warning (visible in all modes) */}
          {b.annualRepsManuallyEdited && !showCloud && (
            <div className="bg-amber-50 border border-amber-300 rounded text-[10px] text-amber-900 p-2">
              <span className="font-semibold">⚠️ Manual override:</span> Annual executions differ from B3 process value.
            </div>
          )}

          {/* Total + clear */}
          <div className="flex items-center justify-between text-xs border-t border-border pt-2">
            <button
              onClick={clearBreakdown}
              className="text-[11px] text-muted hover:text-red-sov underline"
              title="Clear the calculator — euro field becomes a free entry again"
            >
              Clear calculator
            </button>
            <span className="text-text">
              <span className="text-muted text-[11px] mr-1">Annual recurring compute</span>
              <span className="font-semibold text-base tabular-nums">{fmt.format(calc.totalEur)} €</span>
              {b.mode === 'hybrid' && (
                <span className="text-muted text-[10px] ml-1">({Math.round(calc.onPremFraction * 100)}% on-prem)</span>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Tailwind needs literal class names — interpolated values get stripped by the JIT.
const COL_SPAN: Record<number, string> = {
  1: 'md:col-span-1', 2: 'md:col-span-2', 3: 'md:col-span-3', 4: 'md:col-span-4',
  5: 'md:col-span-5', 6: 'md:col-span-6',
};

function NumField({ label, value, onChange, cols = 2, suffix = '', step = 1 }: {
  label: string; value?: number; onChange: (v: number) => void; cols?: number; suffix?: string; step?: number;
}) {
  return (
    <div className={COL_SPAN[cols] ?? 'md:col-span-2'}>
      <label className="text-[10px] uppercase tracking-wide text-muted">{label}</label>
      <div className="relative">
        <input
          type="number" min={0} step={step}
          className="form-input text-xs tabular-nums pr-6"
          value={value ?? 0}
          onChange={e => onChange(Number(e.target.value) || 0)}
        />
        {suffix && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted">{suffix}</span>}
      </div>
    </div>
  );
}
