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
  status: { type: String, enum: ['pending', 'done', 'missed'], default: 'pending' },
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
  computeCost?: any;
  aiGeneratedFields?: string[];
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
  computeCost: {
    deploymentModel: { type: String, enum: ['cloud_api', 'on_premise', 'hybrid'], default: 'cloud_api' },
    annualReps: { type: Number, default: 0 },
    concurrentUsers: { type: Number, default: 1 },
    avgResponseTimeSec: { type: Number, default: 2 },
    // Cloud API
    inputTokensPerExec: { type: Number, default: 1000 },
    outputTokensPerExec: { type: Number, default: 500 },
    pricePerMInputTokens: { type: Number, default: 2 },
    pricePerMOutputTokens: { type: Number, default: 6 },
    // On-premise
    gpuModel: { type: String, enum: ['rtx_4090', 'a100_40gb', 'a100_80gb', 'h100'], default: 'a100_40gb' },
    nGpus: { type: Number, default: 1 },
    amortizationYears: { type: Number, default: 4 },
    electricityRateEur: { type: Number, default: 0.15 },
    // Hybrid
    onPremPct: { type: Number, default: 70 },
    subscriptions: [{
      tool: { type: String, default: '' },
      users: { type: Number, default: 1 },
      monthlyPerUser: { type: Number, default: 0 },
    }],
  },
  aiGeneratedFields: [{ type: String }],
}, { timestamps: true });

const POC: Model<IPOC> = mongoose.models.POC || mongoose.model<IPOC>('POC', POCSchema);
export default POC;
