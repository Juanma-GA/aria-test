import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUseCase extends Document {
  auditId: mongoose.Types.ObjectId;
  processId: mongoose.Types.ObjectId;
  cuId: string;
  description: string;
  aiTypes: ('generative_llm' | 'extraction_nlp' | 'classification_ml' | 'rag' | 'validation' | 'prediction' | 'intelligent_automation' | 'agentic_ai' | 'other')[];
  targetActivities: string[];
  b2Compatible: 'yes' | 'no' | 'partial';
  requiresClientIT: boolean;
  timeSavedPerProfile: { profileId: string; role: string; hoursPerExecution: number }[];
  estimatedDevCostEur: number;
  devCostExplanation: string;
  estimatedImplWeeks: number;
  status: 'eligible' | 'blocked' | 'pending_review';
  blockedReason?: string;
  blockedAxis?: string;
  unblockCondition?: string;
  reviewDate?: Date;
  notes: string;
  sovereigntyAnalysis?: string;
  isArchived?: boolean;
  archivedAt?: Date;
  /**
   * Catalog-driven compute calculator state. Same shape as POC and
   * Industrialization so the breakdown can flow UC → POC → Industrialization
   * with optional inheritance. Snapshots model/GPU specs at the moment they
   * were picked. `computedAnnualEur` is server-derived on save.
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
    computedAnnualEur?: number;
  };
  // B6 Score embedded
  score?: {
    dimensions: {
      d1_efficiencyImpact: { value: number; justification: string };
      d2_qualityImpact: { value: number; justification: string };
      d3_techMaturity: { value: number; justification: string };
      d4_dataReadiness: { value: number; justification: string };
      d5_sovereigntyIndex: { value: number; justification: string; autoFilled?: boolean };
      d6_governanceComplexity: { value: number; justification: string };
    };
    scoringNotes: string;
    scoredBy: string;
    scoredAt: Date;
  };
  createdAt: Date;
}

const DimensionScoreSchema = new Schema({
  value: { type: Number, min: 1, max: 5, default: 3 },
  justification: { type: String, default: '' },
  autoFilled: { type: Boolean, default: false },
}, { _id: false });

const TimeSavedEntrySchema = new Schema({
  profileId: { type: String, default: '' },
  role: { type: String, default: '' },
  hoursPerExecution: { type: Number, default: 0 },
}, { _id: false });

const UseCaseSchema = new Schema<IUseCase>({
  auditId: { type: Schema.Types.ObjectId, ref: 'Audit', required: true },
  processId: { type: Schema.Types.ObjectId, ref: 'Process', required: true },
  cuId: { type: String, required: true },
  description: { type: String, required: true },
  aiTypes: [{ type: String }],
  targetActivities: [{ type: String }],
  b2Compatible: { type: String, enum: ['yes', 'no', 'partial'], default: 'yes' },
  requiresClientIT: { type: Boolean, default: false },
  timeSavedPerProfile: [TimeSavedEntrySchema],
  estimatedDevCostEur: { type: Number, default: 0 },
  devCostExplanation: { type: String, default: '' },
  estimatedImplWeeks: { type: Number, default: 0 },
  status: { type: String, enum: ['eligible', 'blocked', 'pending_review'], default: 'eligible' },
  blockedReason: { type: String },
  blockedAxis: { type: String },
  unblockCondition: { type: String },
  reviewDate: { type: Date },
  notes: { type: String, default: '' },
  sovereigntyAnalysis: { type: String, default: '' },
  isArchived: { type: Boolean, default: false, index: true },
  archivedAt: { type: Date },
  computeBreakdown: {
    // '' means dormant (no calculator-driven projection). Otherwise the server
    // recompute fills computedAnnualEur from the inputs on save.
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
  score: {
    dimensions: {
      d1_efficiencyImpact: DimensionScoreSchema,
      d2_qualityImpact: DimensionScoreSchema,
      d3_techMaturity: DimensionScoreSchema,
      d4_dataReadiness: DimensionScoreSchema,
      d5_sovereigntyIndex: DimensionScoreSchema,
      d6_governanceComplexity: DimensionScoreSchema,
    },
    scoringNotes: { type: String, default: '' },
    scoredBy: { type: String, default: '' },
    scoredAt: { type: Date },
  },
}, { timestamps: true });

const UseCase: Model<IUseCase> = mongoose.models.UseCase || mongoose.model<IUseCase>('UseCase', UseCaseSchema);
export default UseCase;
