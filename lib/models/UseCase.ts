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
  computeCost: {
    deploymentModel: { type: String, enum: ['cloud_api', 'on_premise', 'hybrid'], default: 'cloud_api' },
    annualReps: { type: Number, default: 0 },
    concurrentUsers: { type: Number, default: 1 },
    avgResponseTimeSec: { type: Number, default: 2 },
    inputTokensPerExec: { type: Number, default: 1000 },
    outputTokensPerExec: { type: Number, default: 500 },
    pricePerMInputTokens: { type: Number, default: 2 },
    pricePerMOutputTokens: { type: Number, default: 6 },
    gpuModel: { type: String, enum: ['rtx_4090', 'a100_40gb', 'a100_80gb', 'h100'], default: 'a100_40gb' },
    nGpus: { type: Number, default: 1 },
    amortizationYears: { type: Number, default: 4 },
    electricityRateEur: { type: Number, default: 0.15 },
    onPremPct: { type: Number, default: 70 },
    subscriptions: [{
      tool: { type: String, default: '' },
      users: { type: Number, default: 1 },
      monthlyPerUser: { type: Number, default: 0 },
    }],
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
