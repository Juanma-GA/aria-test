import type {
  B2_Sovereignty,
  SovereigntyIndexResult,
  SovereigntyLevel,
  B6_Score,
  ScoreResult,
  IndustrializationCost,
  IndustrializationROI,
  MaintenanceAssessment,
  MaintenanceDrivers,
  ComputeBreakdown,
} from './types';

export function calculateSovereigntyIndex(axes: B2_Sovereignty['axes']): SovereigntyIndexResult {
  const values: number[] = Object.values(axes).reduce<number[]>((acc, axis) => {
    if (axis.status === 'green') acc.push(5);
    else if (axis.status === 'amber') acc.push(3);
    else if (axis.status === 'red') acc.push(1);
    return acc;
  }, []);

  if (values.length === 0) return { index: 0, hasCritical: false, level: 'conditioned' };

  const index = values.reduce((sum, v) => sum + v, 0) / values.length;
  const hasCritical = Object.values(axes).some((axis) => axis.status === 'red');

  let level: SovereigntyLevel;
  if (index >= 4.5) level = 'full_autonomy';
  else if (index >= 3.5) level = 'managed';
  else if (index >= 2.5) level = 'conditioned';
  else if (index >= 1.5) level = 'restricted';
  else level = 'critical';

  return { index: Math.round(index * 10) / 10, hasCritical, level };
}

export function calculateScore(dimensions: B6_Score['dimensions']): ScoreResult {
  const values = Object.values(dimensions).map((d) => d.value);
  const total = values.reduce((sum, v) => sum + v, 0);
  const d6 = dimensions.d6_governanceComplexity?.value ?? 0;

  let category: ScoreResult['category'];
  if (total >= 22 && d6 >= 4) {
    category = 'quick_win';
  } else if (total >= 14) {
    category = 'mid_term';
  } else {
    category = 'strategic';
  }

  return { total, category };
}

export function sovereigntyIndexToD5Score(index: number): 1 | 2 | 3 | 4 | 5 {
  if (index >= 4.5) return 5;
  if (index >= 3.5) return 4;
  if (index >= 2.5) return 3;
  if (index >= 1.5) return 2;
  return 1;
}

export function generateProcId(count: number): string {
  return `PROC-${String(count + 1).padStart(2, '0')}`;
}

export function generateCuId(count: number): string {
  return `CU-${String(count + 1).padStart(2, '0')}`;
}

export function generatePocId(cuId: string, count: number): string {
  return `POC-${cuId}-${String(count + 1).padStart(2, '0')}`;
}

// ── COMPUTE CALCULATOR ─────────────────────────────────────────────────────────

/** Defaults for the operating window — used when the breakdown does not
 *  specify them. 10h × 5 days × 48 weeks = 2 400 hours/year. */
const DEFAULT_HOURS_PER_DAY = 10;
const DEFAULT_DAYS_PER_WEEK = 5;
const DEFAULT_WEEKS_PER_YEAR = 48;

export interface ComputeCalculation {
  cloudCostEur: number;
  /** Total HW cost referenced — i.e. cost if a single case used 100% of the
   *  declared capacity 100% of the operating window (before occupancy). */
  hwAnnualAmortEur: number;
  hwAnnualElectricityEur: number;
  hwAnnualTotalEur: number;
  /** Imputed share of the HW cost for the case (= hwAnnualTotal × occupancyShare). */
  onPremAmortisationEur: number;
  onPremElectricityEur: number;
  onPremTotalEur: number;
  totalEur: number;
  /** Effective fraction of executions handled on-prem (0..1). */
  onPremFraction: number;
  /** Operating window in hours/year derived from the breakdown. */
  windowHoursPerYear: number;
  /** 0..1 — fraction of the HW the case occupies inside the window. */
  occupancyShare: number;
  /** nGpus × concurrentUsersPerGpuSnapshot, before any user override. */
  derivedMaxConcurrentUsers: number;
}

/**
 * Annual recurring compute cost from the calculator inputs.
 *
 * - **cloud_api**: token-based pricing only (no HW share).
 * - **on_premise / hybrid**: amortisation + electricity computed against the
 *   declared operating window (default 10×5×48 = 2 400 h/yr), and prorated
 *   to the case via the occupancy share derived from `peakConcurrentUsers`,
 *   `maxConcurrentUsersSupported` and `peakUsageFractionOfWindow`. When
 *   `hwPreexisting` is true the amortisation drops to zero.
 *
 * For backwards compatibility, when `peakConcurrentUsers` /
 * `maxConcurrentUsersSupported` / `peakUsageFractionOfWindow` are not set,
 * the case is treated as occupying 100% of the HW (legacy behaviour) so the
 * old single-tenant cost is preserved.
 */
export function computeAnnualCompute(b: Partial<ComputeBreakdown> | null | undefined): ComputeCalculation {
  const empty: ComputeCalculation = {
    cloudCostEur: 0,
    hwAnnualAmortEur: 0,
    hwAnnualElectricityEur: 0,
    hwAnnualTotalEur: 0,
    onPremAmortisationEur: 0,
    onPremElectricityEur: 0,
    onPremTotalEur: 0,
    totalEur: 0,
    onPremFraction: 0,
    windowHoursPerYear: 0,
    occupancyShare: 0,
    derivedMaxConcurrentUsers: 0,
  };
  if (!b || !b.mode) return empty;

  // Cloud component (token billing — independent of window/occupancy).
  const reps = b.annualReps ?? 0;
  const inTok = b.inputTokensPerExec ?? 0;
  const outTok = b.outputTokensPerExec ?? 0;
  const priceIn = b.modelPriceInSnapshot ?? 0;
  const priceOut = b.modelPriceOutSnapshot ?? 0;
  const cloudCostEur = (inTok * reps / 1_000_000) * priceIn + (outTok * reps / 1_000_000) * priceOut;

  // HW operating window in hours/year. CAPEX does not depend on it; the
  // electricity bill does (HW is on only during the window).
  const hpd = Math.max(0, Math.min(24, b.workingHoursPerDay ?? DEFAULT_HOURS_PER_DAY));
  const dpw = Math.max(0, Math.min(7, b.workingDaysPerWeek ?? DEFAULT_DAYS_PER_WEEK));
  const wpy = Math.max(0, Math.min(53, b.workingWeeksPerYear ?? DEFAULT_WEEKS_PER_YEAR));
  const windowHoursPerYear = hpd * dpw * wpy;

  // HW totals (before occupancy share).
  const nGpus = b.nGpus ?? 0;
  const gpuPrice = b.gpuPriceSnapshot ?? 0;
  const tdp = b.gpuTdpSnapshot ?? 0;
  const years = Math.max(1, b.amortizationYears ?? 1);
  const elec = b.electricityRateEur ?? 0;
  const hwAnnualAmortEur = b.hwPreexisting ? 0 : (gpuPrice * nGpus) / years;
  const hwAnnualElectricityEur = (nGpus * tdp * windowHoursPerYear * elec) / 1000;
  const hwAnnualTotalEur = hwAnnualAmortEur + hwAnnualElectricityEur;

  // Occupancy of the HW that we impute to this case.
  const upgSnap = b.concurrentUsersPerGpuSnapshot ?? 0;
  const derivedMaxConcurrentUsers = nGpus * upgSnap;
  const maxConcurrent = Math.max(0, b.maxConcurrentUsersSupported ?? derivedMaxConcurrentUsers);
  const peakUsers = b.peakConcurrentUsers;
  const peakFracPct = b.peakUsageFractionOfWindow;

  // Fall back to 100% occupancy when the new fields are not yet populated
  // (legacy breakdowns where the case paid for the whole HW).
  let occupancyShare = 1;
  if (peakUsers !== undefined && maxConcurrent > 0 && peakFracPct !== undefined) {
    const concurrencyShare = Math.min(1, Math.max(0, peakUsers / maxConcurrent));
    const timeShare = Math.min(1, Math.max(0, peakFracPct / 100));
    occupancyShare = concurrencyShare * timeShare;
  }

  const onPremAmortisationEur = hwAnnualAmortEur * occupancyShare;
  const onPremElectricityEur = hwAnnualElectricityEur * occupancyShare;
  const onPremTotalEur = onPremAmortisationEur + onPremElectricityEur;

  // Combine cloud + on-prem according to mode.
  let totalEur = 0;
  let onPremFraction = 0;
  if (b.mode === 'cloud_api') {
    totalEur = cloudCostEur;
    onPremFraction = 0;
  } else if (b.mode === 'on_premise') {
    totalEur = onPremTotalEur;
    onPremFraction = 1;
  } else {
    onPremFraction = Math.max(0, Math.min(100, b.onPremPct ?? 0)) / 100;
    totalEur = cloudCostEur * (1 - onPremFraction) + onPremTotalEur * onPremFraction;
  }

  return {
    cloudCostEur: Math.round(cloudCostEur),
    hwAnnualAmortEur: Math.round(hwAnnualAmortEur),
    hwAnnualElectricityEur: Math.round(hwAnnualElectricityEur),
    hwAnnualTotalEur: Math.round(hwAnnualTotalEur),
    onPremAmortisationEur: Math.round(onPremAmortisationEur),
    onPremElectricityEur: Math.round(onPremElectricityEur),
    onPremTotalEur: Math.round(onPremTotalEur),
    totalEur: Math.round(totalEur),
    onPremFraction,
    windowHoursPerYear,
    occupancyShare,
    derivedMaxConcurrentUsers,
  };
}

// ── INDUSTRIALIZATION ──────────────────────────────────────────────────────────

export interface MaintenanceAssessmentStatus {
  pending: number;
  applicable: number;
  notApplicable: number;
  isComplete: boolean;
}

const ASSESSMENT_KEYS: Array<keyof Omit<MaintenanceAssessment, 'completedAt' | 'completedBy'>> = [
  'hasCorrectiveWarranty',
  'hasFunctionalRoadmap',
  'hasFineTuningOrDynamicRag',
  'requiresDriftMonitoring',
  'isRegulatedRevalidation',
  'hasInternalSupport',
  'hasVendorSla',
];

export function assessmentStatus(a?: MaintenanceAssessment | null): MaintenanceAssessmentStatus {
  let pending = 0, applicable = 0, notApplicable = 0;
  for (const k of ASSESSMENT_KEYS) {
    const v = a?.[k];
    if (v === true) applicable++;
    else if (v === false) notApplicable++;
    else pending++;
  }
  return { pending, applicable, notApplicable, isComplete: pending === 0 };
}

export interface CostBreakdown {
  oneTimeSubtotal: number;
  contingencyEur: number;
  oneTimeTotal: number;
  recurringInfra: number;
  recurringMaintenance: number;
  recurringAnnualTotal: number;
  tcoYear1: number;
  tcoHorizon: number;
  horizonYears: number;
  maintenancePending: boolean;
}

/** Categories of maintenance, paired with the assessment flag that gates them
 *  and the manual EUR fallback field on `maintenance`. */
export const MAINTENANCE_CATEGORIES = [
  { key: 'corrective',       assessment: 'hasCorrectiveWarranty',     eurField: 'correctiveEur' },
  { key: 'evolutive',        assessment: 'hasFunctionalRoadmap',      eurField: 'evolutiveEur' },
  { key: 'modelRetraining',  assessment: 'hasFineTuningOrDynamicRag', eurField: 'modelRetrainingEur' },
  { key: 'driftMonitoring',  assessment: 'requiresDriftMonitoring',   eurField: 'driftMonitoringEur' },
  { key: 'revalidation',     assessment: 'isRegulatedRevalidation',   eurField: 'revalidationEur' },
  { key: 'l1l2Support',      assessment: 'hasInternalSupport',        eurField: 'l1l2SupportEur' },
  { key: 'vendorSla',        assessment: 'hasVendorSla',              eurField: 'vendorSlaEur' },
] as const;

export type MaintenanceCategoryKey = typeof MAINTENANCE_CATEGORIES[number]['key'];

/** Compute the annual EUR for a maintenance category from its drivers.
 *  Returns `null` when no drivers are present for that category — in that case
 *  callers fall back to the manual `*Eur` scalar on `maintenance`. */
export function computeMaintenanceCategoryEur(
  key: MaintenanceCategoryKey,
  drivers: MaintenanceDrivers | null | undefined,
  developmentEur: number,
): number | null {
  if (!drivers) return null;
  switch (key) {
    case 'corrective': {
      const d = drivers.corrective;
      if (!d) return null;
      return Math.round(developmentEur * (d.pctOfDevelopment ?? 0) / 100);
    }
    case 'evolutive': {
      const d = drivers.evolutive;
      if (!d) return null;
      return Math.round((d.featuresPerYear ?? 0) * (d.hoursPerFeature ?? 0) * (d.hourlyRateEur ?? 0));
    }
    case 'modelRetraining': {
      const d = drivers.modelRetraining;
      if (!d) return null;
      const labor = (d.hoursPerCycle ?? 0) * (d.hourlyRateEur ?? 0);
      return Math.round((d.cyclesPerYear ?? 0) * (labor + (d.cloudComputePerCycleEur ?? 0)));
    }
    case 'driftMonitoring': {
      const d = drivers.driftMonitoring;
      if (!d) return null;
      const labor = (d.checksPerYear ?? 0) * (d.hoursPerCheck ?? 0) * (d.hourlyRateEur ?? 0);
      return Math.round(labor + (d.toolingEurPerYear ?? 0));
    }
    case 'revalidation': {
      const d = drivers.revalidation;
      if (!d) return null;
      const perCycle = (d.hoursPerCycle ?? 0) * (d.hourlyRateEur ?? 0) + (d.externalAuditEurPerCycle ?? 0);
      return Math.round((d.cyclesPerYear ?? 0) * perCycle);
    }
    case 'l1l2Support': {
      const d = drivers.l1l2Support;
      if (!d) return null;
      return Math.round((d.ticketsPerMonth ?? 0) * 12 * (d.hoursPerTicket ?? 0) * (d.hourlyRateEur ?? 0));
    }
    case 'vendorSla': {
      const d = drivers.vendorSla;
      if (!d) return null;
      return Math.round((d.monthlyFeeEur ?? 0) * 12);
    }
  }
}

/** Resolve the effective annual EUR for one maintenance line.
 *  Drivers win when present; otherwise the manual scalar is used. */
function resolveMaintenanceLineEur(
  category: typeof MAINTENANCE_CATEGORIES[number],
  m: NonNullable<IndustrializationCost['recurringAnnual']>['maintenance'] | undefined,
  developmentEur: number,
): number {
  const fromDrivers = computeMaintenanceCategoryEur(category.key, m?.drivers, developmentEur);
  if (fromDrivers !== null) return fromDrivers;
  return (m as any)?.[category.eurField] ?? 0;
}

export function computeCostBreakdown(cost?: Partial<IndustrializationCost> | null): CostBreakdown {
  const horizonYears = cost?.horizonYears ?? 3;
  const o = cost?.oneTime;
  const developmentEur = o?.developmentEur ?? 0;
  const oneTimeSubtotal =
    developmentEur +
    (o?.integrationEur ?? 0) +
    (o?.infraSetupEur ?? 0) +
    (o?.securityComplianceEur ?? 0) +
    (o?.trainingChangeMgmtEur ?? 0);
  const contingencyEur = oneTimeSubtotal * ((o?.contingencyPct ?? 0) / 100);
  const oneTimeTotal = oneTimeSubtotal + contingencyEur;

  const r = cost?.recurringAnnual;
  const recurringInfra =
    (r?.computeEur ?? 0) + (r?.licensesEur ?? 0) + (r?.monitoringObservabilityEur ?? 0);

  const m = r?.maintenance;
  const a = m?.assessment;
  const status = assessmentStatus(a);
  const maintenancePending = !status.isComplete;

  const recurringMaintenance = maintenancePending
    ? 0
    : MAINTENANCE_CATEGORIES.reduce((sum, cat) => {
        if (a?.[cat.assessment] !== true) return sum;
        return sum + resolveMaintenanceLineEur(cat, m, developmentEur);
      }, 0);

  const recurringAnnualTotal = recurringInfra + recurringMaintenance;
  const tcoYear1 = oneTimeTotal + recurringAnnualTotal;
  const tcoHorizon = oneTimeTotal + recurringAnnualTotal * horizonYears;

  return {
    oneTimeSubtotal,
    contingencyEur,
    oneTimeTotal,
    recurringInfra,
    recurringMaintenance,
    recurringAnnualTotal,
    tcoYear1,
    tcoHorizon,
    horizonYears,
    maintenancePending,
  };
}

export interface ROIBreakdown {
  baselineAnnualCostEur: number;
  expectedAnnualSavingEur: number;
  expectedNetAnnualBenefitEur: number;
  expectedPaybackMonths: number | null;
  confirmedNetAnnualBenefitEur: number;
  confirmedPaybackMonths: number | null;
}

export function computeROIBreakdown(
  roi?: Partial<IndustrializationROI> | null,
  cost?: Partial<IndustrializationCost> | null,
): ROIBreakdown {
  const c = computeCostBreakdown(cost);
  const baseline = roi?.baseline;
  const expected = roi?.expected;
  const confirmed = roi?.confirmed;

  const baselineAnnualCostEur =
    (baseline?.annualHoursManual ?? 0) * (baseline?.avgHourlyCostEur ?? 0) +
    (baseline?.qualityCostEur ?? 0);

  const expectedAnnualSavingEur =
    expected?.annualSavingEur && expected.annualSavingEur > 0
      ? expected.annualSavingEur
      : baselineAnnualCostEur * ((expected?.timeSavingPct ?? 0) / 100);

  const expectedNetAnnualBenefitEur = expectedAnnualSavingEur - c.recurringAnnualTotal;
  const expectedPaybackMonths =
    expectedNetAnnualBenefitEur > 0 ? (c.oneTimeTotal / expectedNetAnnualBenefitEur) * 12 : null;

  const confirmedNetAnnualBenefitEur =
    confirmed?.netAnnualBenefitEur && confirmed.netAnnualBenefitEur !== 0
      ? confirmed.netAnnualBenefitEur
      : (confirmed?.annualSavingEur ?? 0) - c.recurringAnnualTotal;
  const confirmedPaybackMonths =
    confirmedNetAnnualBenefitEur > 0
      ? (c.oneTimeTotal / confirmedNetAnnualBenefitEur) * 12
      : null;

  return {
    baselineAnnualCostEur,
    expectedAnnualSavingEur,
    expectedNetAnnualBenefitEur,
    expectedPaybackMonths,
    confirmedNetAnnualBenefitEur,
    confirmedPaybackMonths,
  };
}
