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

/** Get process for UC: instances use their own, reference uses POC's process.
 * Handles both naming conventions:
 * - uc.process (from global GET listado)
 * - uc.processId (from B8 detail, populated with b1/b3)
 * If processId is a string/ObjectId (not populated), falls back to pocProcess.
 */
function getUCProcess(uc: any, pocProcess: any): any {
  // Try uc.process first (global GET listado)
  if (uc?.process && typeof uc.process === 'object' && (uc.process?.b1 || uc.process?.b3)) {
    return uc.process;
  }
  // Try uc.processId (B8 detail, Mongoose populated)
  if (uc?.processId && typeof uc.processId === 'object' && (uc.processId?.b1 || uc.processId?.b3)) {
    return uc.processId;
  }
  // Fall back to POC's process
  return pocProcess;
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

  const computeCost = assignedUCs.reduce(
    (total: number, uc: any) => total + (uc?.computeBreakdown?.computedAnnualEur ?? 0),
    0
  );

  const grossSaving = assignedUCs.reduce((total: number, uc: any) => {
    const ucProcess = getUCProcess(uc, process);
    const b1Profiles = ucProcess?.b1?.profiles ?? [];
    const annualReps = ucProcess?.b3?.annualRepetitions ?? 0;

    const ucTimeSaved = uc?.timeSavedPerProfile ?? [];
    return total + ucTimeSaved.reduce((s: number, e: any) => {
      const profile = b1Profiles.find((p: any) => p.id === e.profileId);
      return s + (e.hoursPerExecution ?? 0) * (profile?.hourlyRateEur ?? 0) * annualReps;
    }, 0);
  }, 0);

  const devCost = assignedUCs.reduce((total: number, uc: any) => {
    const isRef = !uc.isInstance;
    return total + getUCDevCost(uc, isRef);
  }, 0);

  const netSaving = Math.max(grossSaving - computeCost, 0);
  const paybackMonths =
    devCost > 0 && netSaving > 0 ? devCost / (netSaving / 12) : 0;

  const breakdown: RoiBreakdownItem[] = assignedUCs.map((uc: any) => {
    const ucProcess = getUCProcess(uc, process);
    const b1Profiles = ucProcess?.b1?.profiles ?? [];
    const annualReps = ucProcess?.b3?.annualRepetitions ?? 0;

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
