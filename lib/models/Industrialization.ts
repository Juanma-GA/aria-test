import mongoose, { Schema, Document, Model } from 'mongoose';

const MilestoneSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, default: '' },
  dueDate: { type: Date },
  status: { type: String, enum: ['pending', 'work_in_progress', 'done', 'missed'], default: 'pending' },
  progressPct: { type: Number, default: 0, min: 0, max: 100 },
  effortHours: { type: Number, default: 0, min: 0 },
  notes: { type: String, default: '' },
}, { _id: false });

const RiskSchema = new Schema({
  id: { type: String, required: true },
  description: { type: String, default: '' },
  severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  mitigation: { type: String, default: '' },
}, { _id: false });

// Per-line profile-hour entry. The snapshot fields freeze the profile name and
// hourly rate at the moment the line was entered, so the recorded euros stay
// stable even if the catalog entry is later renamed, re-priced or deleted.
const ProfileHoursLineSchema = new Schema({
  profileId: { type: Schema.Types.ObjectId, ref: 'Profile' },
  profileNameSnapshot: { type: String, default: '' },
  profileRateSnapshot: { type: Number, default: 0 },
  hours: { type: Number, default: 0, min: 0 },
}, { _id: false });

export type IndustrializationStatus =
  | 'pending_customer_validation'
  | 'planned'
  | 'work_in_progress'
  | 'go_for_run'
  | 'stand_by'
  | 'cancelled';

export type TriState = boolean | null;

export interface IIndustrialization extends Document {
  auditId: mongoose.Types.ObjectId;
  useCaseId: mongoose.Types.ObjectId;
  processId: mongoose.Types.ObjectId;
  pocId: mongoose.Types.ObjectId;
  industrializationId: string;

  name?: string;
  status: IndustrializationStatus;
  statusReason?: string;

  milestones: object[];

  plan: {
    ownerBusiness: string;
    ownerTechnical: string;
    startDate?: Date;
    targetGoLiveDate?: Date;
    actualGoLiveDate?: Date;
    scope: string;
    dependencies: string;
    sovereigntyConstraints: string;
  };

  cost: {
    currency: string;
    horizonYears: number;
    oneTime: {
      developmentEur: number;
      integrationEur: number;
      infraSetupEur: number;
      securityComplianceEur: number;
      trainingChangeMgmtEur: number;
      contingencyPct: number;
    };
    recurringAnnual: {
      computeEur: number;
      licensesEur: number;
      monitoringObservabilityEur: number;
      maintenance: {
        assessment: {
          hasCorrectiveWarranty: TriState;
          hasFunctionalRoadmap: TriState;
          hasFineTuningOrDynamicRag: TriState;
          requiresDriftMonitoring: TriState;
          isRegulatedRevalidation: TriState;
          hasInternalSupport: TriState;
          hasVendorSla: TriState;
          completedAt?: Date;
          completedBy?: string;
        };
        correctiveEur?: number;
        evolutiveEur?: number;
        modelRetrainingEur?: number;
        driftMonitoringEur?: number;
        revalidationEur?: number;
        l1l2SupportEur?: number;
        vendorSlaEur?: number;
      };
    };
    actual: {
      oneTimeEur: number;
      recurringAnnualEur: number;
      notes: string;
    };
  };

  roi: {
    baseline: {
      annualHoursManual: number;
      avgHourlyCostEur: number;
      annualErrorRate: number;
      qualityCostEur: number;
    };
    expected: {
      timeSavingPct: number;
      errorReductionPct: number;
      annualSavingEur: number;
      paybackMonths: number;
    };
    confirmed: {
      measuredFrom?: Date;
      measuredTo?: Date;
      annualHoursSaved: number;
      annualSavingEur: number;
      errorReductionPctMeasured: number;
      qualityCostAvoidedEur: number;
      netAnnualBenefitEur: number;
      paybackMonthsActual: number;
      notes: string;
    };
  };

  production: {
    monitoredKpis: string;
    incidentsLog: string;
    decommissioningPlan: string;
  };

  risks: object[];
  changeManagement: {
    trainingPlan: string;
    communicationPlan: string;
  };

  aiGeneratedFields?: string[];
  isArchived?: boolean;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const IndustrializationSchema = new Schema<IIndustrialization>({
  auditId: { type: Schema.Types.ObjectId, ref: 'Audit', required: true, index: true },
  useCaseId: { type: Schema.Types.ObjectId, ref: 'UseCase', required: true, index: true },
  processId: { type: Schema.Types.ObjectId, ref: 'Process', required: true },
  pocId: { type: Schema.Types.ObjectId, ref: 'POC', required: true, unique: true, index: true },
  industrializationId: { type: String, required: true, unique: true },

  name: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending_customer_validation', 'planned', 'work_in_progress', 'go_for_run', 'stand_by', 'cancelled'],
    default: 'planned',
  },
  statusReason: { type: String, default: '' },

  milestones: [MilestoneSchema],

  plan: {
    ownerBusiness: { type: String, default: '' },
    ownerTechnical: { type: String, default: '' },
    startDate: { type: Date },
    targetGoLiveDate: { type: Date },
    actualGoLiveDate: { type: Date },
    scope: { type: String, default: '' },
    dependencies: { type: String, default: '' },
    sovereigntyConstraints: { type: String, default: '' },
  },

  cost: {
    currency: { type: String, default: 'EUR' },
    horizonYears: { type: Number, default: 3, min: 1, max: 7 },
    oneTime: {
      developmentEur: { type: Number, default: 0 },
      integrationEur: { type: Number, default: 0 },
      infraSetupEur: { type: Number, default: 0 },
      securityComplianceEur: { type: Number, default: 0 },
      trainingChangeMgmtEur: { type: Number, default: 0 },
      contingencyPct: { type: Number, default: 0 },
      // Optional per-line profile-hour breakdown. When present, the matching
      // …Eur scalar above is treated as a derived sum (Σ hours × rate) rather
      // than a free-text input.
      profileHours: {
        development:         { type: [ProfileHoursLineSchema], default: [] },
        integration:         { type: [ProfileHoursLineSchema], default: [] },
        infraSetup:          { type: [ProfileHoursLineSchema], default: [] },
        securityCompliance:  { type: [ProfileHoursLineSchema], default: [] },
        trainingChangeMgmt:  { type: [ProfileHoursLineSchema], default: [] },
      },
    },
    recurringAnnual: {
      computeEur: { type: Number, default: 0 },
      licensesEur: { type: Number, default: 0 },
      monitoringObservabilityEur: { type: Number, default: 0 },
      // Optional state of the compute calculator. When present, computeEur
      // above is treated as a derived value (Σ cloud + on-prem amortisation
      // + electricity) rather than a free-text input. Snapshot fields freeze
      // model/GPU spec at the moment the calculator was last applied.
      computeBreakdown: {
        // '' means the calculator is dormant (computeEur falls back to manual entry).
        mode: { type: String, enum: ['', 'cloud_api', 'on_premise', 'hybrid'], default: '' },
        modelId: { type: Schema.Types.ObjectId, ref: 'Catalog' },
        modelNameSnapshot: { type: String, default: '' },
        modelPriceInSnapshot: { type: Number, default: 0 },
        modelPriceOutSnapshot: { type: Number, default: 0 },
        gpuId: { type: Schema.Types.ObjectId, ref: 'Catalog' },
        gpuNameSnapshot: { type: String, default: '' },
        gpuPriceSnapshot: { type: Number, default: 0 },
        gpuTdpSnapshot: { type: Number, default: 0 },
        concurrentUsersPerGpuSnapshot: { type: Number, default: 0, min: 0 },
        annualReps: { type: Number, default: 0, min: 0 },
        inputTokensPerExec: { type: Number, default: 1000, min: 0 },
        outputTokensPerExec: { type: Number, default: 500, min: 0 },
        nGpus: { type: Number, default: 1, min: 0 },
        amortizationYears: { type: Number, default: 4, min: 1 },
        electricityRateEur: { type: Number, default: 0.15, min: 0 },
        onPremPct: { type: Number, default: 100, min: 0, max: 100 },
        // Operating window (on_premise / hybrid)
        workingHoursPerDay: { type: Number, default: 10, min: 0, max: 24 },
        workingDaysPerWeek: { type: Number, default: 5, min: 0, max: 7 },
        workingWeeksPerYear: { type: Number, default: 48, min: 0, max: 53 },
        // Concurrency capacity + case occupancy
        maxConcurrentUsersSupported: { type: Number, default: 0, min: 0 },
        peakConcurrentUsers: { type: Number, default: 0, min: 0 },
        peakUsageFractionOfWindow: { type: Number, default: 25, min: 0, max: 100 },
        hwPreexisting: { type: Boolean, default: false },
      },
      maintenance: {
        assessment: {
          hasCorrectiveWarranty: { type: Boolean, default: null },
          hasFunctionalRoadmap: { type: Boolean, default: null },
          hasFineTuningOrDynamicRag: { type: Boolean, default: null },
          requiresDriftMonitoring: { type: Boolean, default: null },
          isRegulatedRevalidation: { type: Boolean, default: null },
          hasInternalSupport: { type: Boolean, default: null },
          hasVendorSla: { type: Boolean, default: null },
          completedAt: { type: Date },
          completedBy: { type: String, default: '' },
        },
        // Per-category structured drivers. When a block is present for a
        // category, the matching `*Eur` scalar below is treated as derived
        // and ignored. Stored as a flexible Mixed sub-document so categories
        // can be added without a migration.
        drivers: { type: Schema.Types.Mixed, default: undefined },
        correctiveEur: { type: Number },
        evolutiveEur: { type: Number },
        modelRetrainingEur: { type: Number },
        driftMonitoringEur: { type: Number },
        revalidationEur: { type: Number },
        l1l2SupportEur: { type: Number },
        vendorSlaEur: { type: Number },
      },
    },
    actual: {
      oneTimeEur: { type: Number, default: 0 },
      recurringAnnualEur: { type: Number, default: 0 },
      notes: { type: String, default: '' },
    },
  },

  roi: {
    baseline: {
      annualHoursManual: { type: Number, default: 0 },
      avgHourlyCostEur: { type: Number, default: 0 },
      annualErrorRate: { type: Number, default: 0 },
      qualityCostEur: { type: Number, default: 0 },
    },
    expected: {
      timeSavingPct: { type: Number, default: 0 },
      errorReductionPct: { type: Number, default: 0 },
      annualSavingEur: { type: Number, default: 0 },
      paybackMonths: { type: Number, default: 0 },
    },
    confirmed: {
      measuredFrom: { type: Date },
      measuredTo: { type: Date },
      annualHoursSaved: { type: Number, default: 0 },
      annualSavingEur: { type: Number, default: 0 },
      errorReductionPctMeasured: { type: Number, default: 0 },
      qualityCostAvoidedEur: { type: Number, default: 0 },
      netAnnualBenefitEur: { type: Number, default: 0 },
      paybackMonthsActual: { type: Number, default: 0 },
      notes: { type: String, default: '' },
    },
  },

  production: {
    monitoredKpis: { type: String, default: '' },
    incidentsLog: { type: String, default: '' },
    decommissioningPlan: { type: String, default: '' },
  },

  risks: [RiskSchema],
  changeManagement: {
    trainingPlan: { type: String, default: '' },
    communicationPlan: { type: String, default: '' },
  },

  aiGeneratedFields: [{ type: String }],
  isArchived: { type: Boolean, default: false, index: true },
  archivedAt: { type: Date },
}, { timestamps: true });

const Industrialization: Model<IIndustrialization> =
  mongoose.models.Industrialization ||
  mongoose.model<IIndustrialization>('Industrialization', IndustrializationSchema);

export default Industrialization;
