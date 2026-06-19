export interface UCRoiResult {
  gross: number;
  compute: number;
  net: number;
  dev: number;
}

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

/** Compute ROI for a single UC with per-UC process resolution. */
export function computeUCRoi(uc: any, fallbackProcess?: any): UCRoiResult {
  const ucProcess = getUCProcess(uc, fallbackProcess);
  const b1Profiles = ucProcess?.b1?.profiles ?? [];
  const annualReps = ucProcess?.b3?.annualRepetitions ?? 0;

  // Gross: sum of hours × rate × annualReps
  const ucTimeSaved = uc?.timeSavedPerProfile ?? [];
  const gross = ucTimeSaved.reduce((s: number, e: any) => {
    const profile = b1Profiles.find((p: any) => p.id === e.profileId);
    return s + (e.hoursPerExecution ?? 0) * (profile?.hourlyRateEur ?? 0) * annualReps;
  }, 0);

  // Compute cost
  const compute = uc?.computeBreakdown?.computedAnnualEur ?? 0;

  // Net
  const net = Math.max(gross - compute, 0);

  // Dev cost
  const isRef = !uc.isInstance;
  const dev = getUCDevCost(uc, isRef);

  return { gross, compute, net, dev };
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

  // Aggregate ROI from all UCs
  const roiByUC = assignedUCs.map(uc => computeUCRoi(uc, process));

  const computeCost = roiByUC.reduce((total, roi) => total + roi.compute, 0);
  const grossSaving = roiByUC.reduce((total, roi) => total + roi.gross, 0);
  const devCost = roiByUC.reduce((total, roi) => total + roi.dev, 0);

  const netSaving = Math.max(grossSaving - computeCost, 0);
  const paybackMonths =
    devCost > 0 && netSaving > 0 ? devCost / (netSaving / 12) : 0;

  const breakdown: RoiBreakdownItem[] = assignedUCs.map((uc: any, i: number) => {
    const roi = roiByUC[i];
    const isRef = !uc.isInstance;
    const devLabel = isRef ? 'Dev' : 'Additional Dev';

    return {
      cuId: uc.cuId,
      gross: roi.gross,
      compute: roi.compute,
      net: roi.net,
      dev: roi.dev,
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

export interface UCRoiTableRow {
  step: string;
  profile: string;
  current: number;
  saved: number;
}

export interface UCRoiTableData {
  type: 'Reference' | 'Instance';
  isRef: boolean;
  cuId: string;
  description: string;
  auditName: string;
  status: 'ok' | 'no_process' | 'no_steps';
  procName: string;
  implWeeks: number;
  rows: UCRoiTableRow[];
}

export function computeUCRoiTableData(
  assignedUCs: any[],
  auditName: string,
  pocProcess: any,
): UCRoiTableData[] {
  return (assignedUCs ?? []).map((uc: any) => {
    const isRef = !uc.isInstance;
    const type: 'Reference' | 'Instance' = isRef ? 'Reference' : 'Instance';
    const audit = isRef ? auditName : (uc.audit?.name ?? '—');
    const process = isRef ? pocProcess : uc.process;

    if (!process) {
      return {
        type,
        isRef,
        cuId: uc.cuId,
        description: uc.description || '—',
        auditName: audit,
        status: 'no_process',
        procName: '',
        implWeeks: 0,
        rows: [],
      };
    }

    const targetActivityIds = new Set(uc.targetActivities ?? []);
    const activitiesForUC = (process.b3?.activities ?? []).filter((a: any) =>
      targetActivityIds.has(a.id),
    );

    if (!activitiesForUC.length) {
      return {
        type,
        isRef,
        cuId: uc.cuId,
        description: uc.description || '—',
        auditName: audit,
        status: 'no_steps',
        procName: '',
        implWeeks: 0,
        rows: [],
      };
    }

    // Build rows: activity × profileHours
    const rows: any[] = [];
    activitiesForUC.forEach((activity: any) => {
      const profileHours = activity.profileHours ?? [];
      if (profileHours.length === 0) {
        rows.push({
          step: activity.name,
          profile: '—',
          current: 0,
          saved: 0,
        });
      } else {
        profileHours.forEach((ph: any) => {
          rows.push({
            step: activity.name,
            profile: ph.role,
            current: ph.hours,
            profileId: ph.profileId,
          });
        });
      }
    });

    // Distribute saved hours proportionally by current hours within each profile group
    const profileGroups: Record<string, (typeof rows)> = {};
    rows.forEach(row => {
      if (row.profileId) {
        if (!profileGroups[row.profileId]) profileGroups[row.profileId] = [];
        profileGroups[row.profileId].push(row);
      }
    });

    rows.forEach(row => {
      if (!row.profileId) {
        row.saved = 0;
        return;
      }
      const totalProfile =
        uc.timeSavedPerProfile?.find((t: any) => t.profileId === row.profileId)
          ?.hoursPerExecution ?? 0;
      const groupRows = profileGroups[row.profileId];
      const sumCurrent = groupRows.reduce((s: number, r: any) => s + r.current, 0);
      row.saved =
        sumCurrent > 0
          ? Math.round((totalProfile * (row.current / sumCurrent)) * 10) / 10
          : totalProfile / groupRows.length;
      delete row.profileId;
    });

    const procName = process.procId
      ? `${process.procId} / ${process.name}`
      : process.name;
    let implWeeks;
    if (uc.isInstance) {
      const rate = uc.devRateEur ?? 450;
      const addCost = uc.additionalDevCostEur ?? 0;
      implWeeks = rate > 0 ? Math.round((addCost / rate / 5) * 10) / 10 : 0;
    } else {
      implWeeks = uc.estimatedImplWeeks ?? 0;
    }

    return {
      type,
      isRef,
      cuId: uc.cuId,
      description: uc.description || '—',
      auditName: audit,
      status: 'ok',
      procName,
      implWeeks,
      rows: rows as UCRoiTableRow[],
    };
  });
}
