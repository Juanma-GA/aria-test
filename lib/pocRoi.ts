export interface RoiBreakdownItem {
  cuId: string;
  gross: number;
  compute: number;
  net: number;
  dev: number;
  devLabel: string;
}

export interface RoiResult {
  gross: number;
  compute: number;
  net: number;
  dev: number;
  paybackMonths: number;
  paybackFormula: string;
  breakdown: RoiBreakdownItem[];
  hasData: boolean;
}

/** Get per-UC dev cost: reference uses base, instances use only additional. */
function getUCDevCost(uc: any, isReference: boolean): number {
  if (isReference) {
    return uc?.estimatedDevCostEur ?? 0;
  } else {
    return uc?.additionalDevCostEur ?? 0;
  }
}

/**
 * Compute ROI for a POC with its assigned UCs.
 * Extracts the exact logic from B8 without changes.
 */
export function computePocRoi(assignedUCs: any[], process: any): RoiResult {
  if (!assignedUCs.length) {
    return {
      gross: 0,
      compute: 0,
      net: 0,
      dev: 0,
      paybackMonths: 0,
      paybackFormula: '',
      breakdown: [],
      hasData: false,
    };
  }

  const b1Profiles = process?.b1?.profiles ?? [];
  const annualReps = process?.b3?.annualRepetitions ?? 0;

  const grossSaving = assignedUCs.reduce((total: number, uc: any) => {
    const ucTimeSaved = uc?.timeSavedPerProfile ?? [];
    return total + ucTimeSaved.reduce((s: number, e: any) => {
      const profile = b1Profiles.find((p: any) => p.id === e.profileId);
      return s + (e.hoursPerExecution ?? 0) * (profile?.hourlyRateEur ?? 0) * annualReps;
    }, 0);
  }, 0);

  const computeCost = assignedUCs.reduce(
    (total: number, uc: any) => total + (uc?.computeBreakdown?.computedAnnualEur ?? 0),
    0
  );

  const devCost = assignedUCs.reduce((total: number, uc: any) => {
    const isRef = !uc.isInstance;
    return total + getUCDevCost(uc, isRef);
  }, 0);

  const netSaving = Math.max(grossSaving - computeCost, 0);
  const paybackMonths =
    devCost > 0 && netSaving > 0 ? devCost / (netSaving / 12) : 0;

  const breakdown: RoiBreakdownItem[] = assignedUCs.map((uc: any) => {
    const ucTimeSaved = uc?.timeSavedPerProfile ?? [];
    const ucGross = ucTimeSaved.reduce((s: number, e: any) => {
      const profile = b1Profiles.find((p: any) => p.id === e.profileId);
      return (
        s + (e.hoursPerExecution ?? 0) * (profile?.hourlyRateEur ?? 0) * annualReps
      );
    }, 0);
    const ucCompute = uc?.computeBreakdown?.computedAnnualEur ?? 0;
    const isRef = !uc.isInstance;
    const ucDevCost = getUCDevCost(uc, isRef);
    const devLabel = isRef ? 'Dev' : 'Additional Dev';
    const ucNet = Math.max(ucGross - ucCompute, 0);

    return {
      cuId: uc.cuId,
      gross: ucGross,
      compute: ucCompute,
      net: ucNet,
      dev: ucDevCost,
      devLabel,
    };
  });

  const paybackFormula = `€${Math.round(devCost).toLocaleString('de-DE')} / (€${Math.round(netSaving).toLocaleString('de-DE')} / 12) ≈ ${paybackMonths.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} months`;

  return {
    gross: grossSaving,
    compute: computeCost,
    net: netSaving,
    dev: devCost,
    paybackMonths,
    paybackFormula,
    breakdown,
    hasData: grossSaving > 0,
  };
}
