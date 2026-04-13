import mongoose, { Schema, Document, Model } from 'mongoose';

const InitiativeSchema = new Schema({
  useCaseId: { type: Schema.Types.ObjectId, ref: 'UseCase' },
  processId: { type: Schema.Types.ObjectId, ref: 'Process' },
  description: { type: String, default: '' },
  annualTimeSavingHours: { type: Number, default: 0 },
  errorReductionPercent: { type: Number, default: 0 },
  estimatedInvestmentEur: { type: Number, default: 0 },
  roiBreakevenMonths: { type: Number, default: 0 },
  successKpi: { type: String, default: '' },
  prerequisite: { type: String, default: '' },
  owner: { type: String, default: '' },
  targetDate: { type: Date },
  pocActualData: {
    actualTimeSavingHours: { type: Number },
    actualCostEur: { type: Number },
    pocLessons: { type: String },
  },
});

const NextStepSchema = new Schema({
  action: { type: String, default: '' },
  responsible: { type: String, default: '' },
  deadline: { type: Date },
  status: { type: String, enum: ['pending', 'in_progress', 'done', 'blocked'], default: 'pending' },
});

export interface IRoadmap extends Document {
  auditId: mongoose.Types.ObjectId;
  horizons: {
    h1_quickWins: object[];
    h2_midTerm: object[];
    h3_strategic: object[];
  };
  nextSteps: object[];
  updatedAt: Date;
}

const RoadmapSchema = new Schema<IRoadmap>({
  auditId: { type: Schema.Types.ObjectId, ref: 'Audit', required: true, unique: true },
  horizons: {
    h1_quickWins: [InitiativeSchema],
    h2_midTerm: [InitiativeSchema],
    h3_strategic: [InitiativeSchema],
  },
  nextSteps: [NextStepSchema],
}, { timestamps: true });

const Roadmap: Model<IRoadmap> = mongoose.models.Roadmap || mongoose.model<IRoadmap>('Roadmap', RoadmapSchema);
export default Roadmap;
