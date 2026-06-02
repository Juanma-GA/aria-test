import mongoose, { Schema, Document, Model } from 'mongoose';

const CriterionSchema = new Schema({
  id: { type: String, required: true },
  criterion: { type: String, default: '' },
  description: { type: String, default: '' },
  successThreshold: { type: String, default: '' },
  actualResult: { type: String },
  passed: { type: Boolean },
}, { _id: false });

const MilestoneSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, default: '' },
  dueDate: { type: Date },
  status: { type: String, enum: ['pending', 'work_in_progress', 'done', 'missed'], default: 'pending' },
  progressPct: { type: Number, default: 0, min: 0, max: 100 },
  effortHours: { type: Number, default: 0, min: 0 },
  notes: { type: String, default: '' },
}, { _id: false });

export interface IPOC extends Document {
  auditId: mongoose.Types.ObjectId;
  useCaseId: mongoose.Types.ObjectId;
  processId: mongoose.Types.ObjectId;
  pocId: string;
  name?: string;
  phase: 'design' | 'execution' | 'evaluation' | 'closed';
  design: {
    responsibleUserId: string;
    measurableObjective: string;
    scopeDescription: string;
    startDate: Date;
    deadlineDate: Date;
    requiredResources: string;
    activeB2Restrictions: string;
    estimatedDevCostEur: number;
    estimatedImplWeeks?: number;
    nDevs?: number;
    devRateEur?: number;
    successCriteria: object[];
  };
  execution: {
    milestones: object[];
    incidents: string;
    planDeviations: string;
    pauseReason?: string;
    pausedAt?: Date;
  };
  evaluation: {
    resultsVsCriteria: string;
    technicalLessons: string;
    organisationalLessons: string;
    actualCostEur: number;
    estimatedProductionImpact: string;
    evaluatedBy: string;
    evaluatedAt?: Date;
  };
  decision: {
    decision: 'go' | 'go_conditional' | 'no_go_redesign' | 'no_go_discard' | 'paused' | 'pending';
    justification: string;
    conditionalRequirement?: string;
    nextSteps: string;
    decidedBy: string;
    decidedAt?: Date;
  };
  /**
   * Catalog-driven compute calculator state. Mirrors the industrialization
   * shape so the breakdown can be carried across when promoting POC →
   * industrialization. Snapshots model/GPU specs at the moment they were picked.
   */
  computeBreakdown?: {
    mode?: '' | 'cloud_api' | 'on_premise' | 'hybrid';
    modelId?: mongoose.Types.ObjectId;
    modelNameSnapshot?: string;
    modelPriceInSnapshot?: number;
    modelPriceOutSnapshot?: number;
    gpuId?: mongoose.Types.ObjectId;
    gpuNameSnapshot?: string;
    gpuPriceSnapshot?: number;
    gpuTdpSnapshot?: number;
    annualReps?: number;
    inputTokensPerExec?: number;
    outputTokensPerExec?: number;
    nGpus?: number;
    amortizationYears?: number;
    electricityRateEur?: number;
    onPremPct?: number;
    /** Server-derived: Σ cloud + on-prem amortisation + electricity (EUR/yr). */
    computedAnnualEur?: number;
  };
  aiGeneratedFields?: string[];
  isArchived?: boolean;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const POCSchema = new Schema<IPOC>({
  auditId: { type: Schema.Types.ObjectId, ref: 'Audit', required: true },
  useCaseId: { type: Schema.Types.ObjectId, ref: 'UseCase', required: true },
  processId: { type: Schema.Types.ObjectId, ref: 'Process', required: true },
  pocId: { type: String, required: true },
  name: { type: String, default: '' },
  phase: { type: String, enum: ['design', 'execution', 'evaluation', 'closed'], default: 'design' },
  design: {
    responsibleUserId: { type: String, default: '' },
    measurableObjective: { type: String, default: '' },
    scopeDescription: { type: String, default: '' },
    startDate: { type: Date },
    deadlineDate: { type: Date },
    requiredResources: { type: String, default: '' },
    activeB2Restrictions: { type: String, default: '' },
    estimatedDevCostEur: { type: Number, default: 0 },
    estimatedImplWeeks: { type: Number, default: 0 },
    nDevs: { type: Number, default: 1 },
    devRateEur: { type: Number, default: 450 },
    successCriteria: [CriterionSchema],
  },
  execution: {
    milestones: [MilestoneSchema],
    incidents: { type: String, default: '' },
    planDeviations: { type: String, default: '' },
    pauseReason: { type: String },
    pausedAt: { type: Date },
  },
  evaluation: {
    resultsVsCriteria: { type: String, default: '' },
    technicalLessons: { type: String, default: '' },
    organisationalLessons: { type: String, default: '' },
    actualCostEur: { type: Number, default: 0 },
    estimatedProductionImpact: { type: String, default: '' },
    evaluatedBy: { type: String, default: '' },
    evaluatedAt: { type: Date },
  },
  decision: {
    decision: { type: String, enum: ['go', 'go_conditional', 'no_go_redesign', 'no_go_discard', 'paused', 'pending'], default: 'pending' },
    justification: { type: String, default: '' },
    conditionalRequirement: { type: String },
    nextSteps: { type: String, default: '' },
    decidedBy: { type: String, default: '' },
    decidedAt: { type: Date },
  },
  computeBreakdown: {
    // '' means dormant (no calculator-driven projection). Otherwise the
    // server-side recompute fills computedAnnualEur from the inputs.
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
    workingHoursPerDay: { type: Number, default: 10, min: 0, max: 24 },
    workingDaysPerWeek: { type: Number, default: 5, min: 0, max: 7 },
    workingWeeksPerYear: { type: Number, default: 48, min: 0, max: 53 },
    maxConcurrentUsersSupported: { type: Number, default: 0, min: 0 },
    peakConcurrentUsers: { type: Number, default: 0, min: 0 },
    peakUsageFractionOfWindow: { type: Number, default: 25, min: 0, max: 100 },
    hwPreexisting: { type: Boolean, default: false },
    computedAnnualEur: { type: Number, default: 0, min: 0 },
  },
  aiGeneratedFields: [{ type: String }],
  isArchived: { type: Boolean, default: false, index: true },
  archivedAt: { type: Date },
}, { timestamps: true });

const POC: Model<IPOC> = mongoose.models.POC || mongoose.model<IPOC>('POC', POCSchema);
export default POC;
