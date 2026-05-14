'use client';

/**
 * Industrialization-specific wrapper around the shared compute calculator.
 *
 * - Persists into `cost.recurringAnnual.computeBreakdown` and mirrors the
 *   server-derived euro into `cost.recurringAnnual.computeEur`.
 * - When the breakdown was inherited from the source POC, surfaces a banner
 *   and a one-click "Scale up from POC" helper so the user can review the
 *   POC values and apply a scaling factor to annual executions and GPU count
 *   (the two fields that typically grow between POC and production).
 * - The user can still freely change anything else in the calculator (model,
 *   GPU, mode, tokens) — the scale-up helper is just a convenience.
 */

import { useState } from 'react';
import { Sparkles, ArrowUpRight } from 'lucide-react';
import { ComputeCalculator as SharedCalculator } from '@/components/cost/ComputeCalculator';
import type { IndustrializationCost, ComputeBreakdown } from '@/lib/types';

interface PocSource {
  pocId?: string;
  computeBreakdown?: ComputeBreakdown & { computedAnnualEur?: number };
}

interface Props {
  cost: IndustrializationCost;
  onChange: (patch: Partial<IndustrializationCost>) => void;
  /** Source POC, if the industrialization was created from one. */
  poc?: PocSource | null;
  /** Whether the breakdown currently in `cost` was inherited from the POC
   *  (recorded as `cost.recurringAnnual.computeBreakdown` in `aiGeneratedFields`). */
  inheritedFromPoc?: boolean;
}

const fmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

export function ComputeCalculator({ cost, onChange, poc, inheritedFromPoc }: Props) {
  const breakdown = cost.recurringAnnual?.computeBreakdown;
  const pocBreakdown = poc?.computeBreakdown;
  const [scaleOpen, setScaleOpen] = useState(false);
  const [scaleFactor, setScaleFactor] = useState<number>(10);
  const [scaleNGpus, setScaleNGpus] = useState(true);

  const apply = (next: ComputeBreakdown, computedAnnualEur: number) => {
    onChange({
      recurringAnnual: {
        ...cost.recurringAnnual,
        computeBreakdown: next,
        computeEur: computedAnnualEur,
      } as any,
    });
  };

  const applyScaleFactor = () => {
    if (!breakdown || scaleFactor <= 0) return;
    const factor = scaleFactor;
    const next: ComputeBreakdown = {
      ...breakdown,
      annualReps: Math.round((breakdown.annualReps ?? 0) * factor),
      nGpus: scaleNGpus ? Math.max(1, Math.round((breakdown.nGpus ?? 1) * factor)) : (breakdown.nGpus ?? 1),
    };
    // Server will recompute the euro figure on save; we don't try to mirror it
    // exactly here — pass 0 and let the next save round-trip update it.
    apply(next, 0);
    setScaleOpen(false);
  };

  const resetFromPoc = () => {
    if (!pocBreakdown) return;
    const next: ComputeBreakdown = {
      mode: pocBreakdown.mode,
      modelId: pocBreakdown.modelId,
      modelNameSnapshot: pocBreakdown.modelNameSnapshot,
      modelPriceInSnapshot: pocBreakdown.modelPriceInSnapshot,
      modelPriceOutSnapshot: pocBreakdown.modelPriceOutSnapshot,
      gpuId: pocBreakdown.gpuId,
      gpuNameSnapshot: pocBreakdown.gpuNameSnapshot,
      gpuPriceSnapshot: pocBreakdown.gpuPriceSnapshot,
      gpuTdpSnapshot: pocBreakdown.gpuTdpSnapshot,
      annualReps: pocBreakdown.annualReps ?? 0,
      inputTokensPerExec: pocBreakdown.inputTokensPerExec ?? 1000,
      outputTokensPerExec: pocBreakdown.outputTokensPerExec ?? 500,
      nGpus: pocBreakdown.nGpus ?? 1,
      amortizationYears: pocBreakdown.amortizationYears ?? 4,
      electricityRateEur: pocBreakdown.electricityRateEur ?? 0.15,
      onPremPct: pocBreakdown.onPremPct ?? 100,
    };
    apply(next, pocBreakdown.computedAnnualEur ?? 0);
  };

  // Banner only when there's a POC-side breakdown to compare against.
  const hasPocBreakdown = !!pocBreakdown?.mode;

  return (
    <div className="space-y-2">
      {hasPocBreakdown && (
        <div className="border border-blue-aria/30 bg-blue-pale/40 rounded-sm p-3 text-[12px] space-y-2">
          <div className="flex items-start gap-2">
            <Sparkles size={13} className="text-blue-aria mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-text">
                <span className="font-semibold">
                  {inheritedFromPoc ? 'Inherited from POC' : 'POC reference available'}
                  {poc?.pocId ? ` ${poc.pocId}` : ''}.
                </span>{' '}
                POC scope: <span className="tabular-nums">{fmt.format(pocBreakdown!.annualReps ?? 0)} reps/yr</span>
                {' · '}<span className="tabular-nums">{fmt.format(pocBreakdown!.nGpus ?? 0)} GPU{(pocBreakdown!.nGpus ?? 0) === 1 ? '' : 's'}</span>
                {' · '}mode <code className="text-[11px]">{(pocBreakdown!.mode ?? '').replace('_', ' ')}</code>
                {(pocBreakdown!.computedAnnualEur ?? 0) > 0 && (
                  <> {' · '}€{fmt.format(pocBreakdown!.computedAnnualEur ?? 0)}/yr</>
                )}.
              </p>
              <p className="text-muted text-[11px] mt-0.5">
                Production volume is usually <strong>much larger</strong> than POC. Use <em>Scale up</em> to multiply executions and (optionally) GPU count, or change anything in the calculator below if POC results changed your assumptions (e.g. different model, infeasible on-prem).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!scaleOpen ? (
              <>
                <button
                  onClick={() => setScaleOpen(true)}
                  className="text-[11px] text-white bg-blue-aria rounded px-2 py-1 hover:bg-blue-aria/90 flex items-center gap-1"
                >
                  <ArrowUpRight size={11} /> Scale up from POC
                </button>
                <button
                  onClick={resetFromPoc}
                  className="text-[11px] text-blue-aria border border-blue-aria/40 rounded px-2 py-1 hover:bg-white"
                  title="Reset the calculator inputs to the POC values verbatim (no scaling)"
                >
                  Reset to POC values
                </button>
              </>
            ) : (
              <>
                <span className="text-[11px] text-muted">Multiply by</span>
                <input
                  type="number" min={0.1} step={0.5}
                  value={scaleFactor}
                  onChange={e => setScaleFactor(Number(e.target.value) || 0)}
                  className="form-input text-xs w-20 tabular-nums"
                />
                <span className="text-[11px] text-muted">×</span>
                <label className="flex items-center gap-1 text-[11px] text-muted">
                  <input
                    type="checkbox"
                    checked={scaleNGpus}
                    onChange={e => setScaleNGpus(e.target.checked)}
                  />
                  also scale GPU count
                </label>
                <span className="text-[11px] text-muted">
                  → {fmt.format((breakdown?.annualReps ?? 0) * scaleFactor)} reps/yr
                  {scaleNGpus && <>, {Math.max(1, Math.round((breakdown?.nGpus ?? 1) * scaleFactor))} GPUs</>}
                </span>
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    onClick={applyScaleFactor}
                    className="text-[11px] text-white bg-blue-aria rounded px-2 py-1 hover:bg-blue-aria/90"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => setScaleOpen(false)}
                    className="text-[11px] text-muted hover:text-text px-2"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <SharedCalculator
        breakdown={breakdown}
        onChange={apply}
      />
    </div>
  );
}
