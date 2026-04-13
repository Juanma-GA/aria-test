import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAudit extends Document {
  name: string;
  client: string;
  project: string;
  sector: 'defence' | 'aerospace' | 'naval' | 'railway' | 'internal' | 'other';
  leadConsultant: mongoose.Types.ObjectId;
  collaborators: mongoose.Types.ObjectId[];
  status: 'draft' | 'active' | 'review' | 'completed';
  classification: 'internal' | 'confidential' | 'reserved' | 'secret';
  startDate: Date;
  targetEndDate: Date;
  auditCode?: string;
  isArchived?: boolean;
  report?: {
    generatedAt: Date;
    model: string;
    markdown: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AuditSchema = new Schema<IAudit>({
  name: { type: String, required: true },
  client: { type: String, required: true },
  project: { type: String, default: '' },
  sector: { type: String, enum: ['defence', 'aerospace', 'naval', 'railway', 'internal', 'other'], required: true },
  leadConsultant: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  collaborators: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['draft', 'active', 'review', 'completed'], default: 'draft' },
  classification: { type: String, enum: ['internal', 'confidential', 'reserved', 'secret'], default: 'internal' },
  startDate: { type: Date, required: true },
  targetEndDate: { type: Date, required: true },
  auditCode: { type: String },
  isArchived: { type: Boolean, default: false },
  report: {
    generatedAt: { type: Date },
    model: { type: String, default: '' },
    markdown: { type: String, default: '' },
  },
}, { timestamps: true });

const Audit: Model<IAudit> = mongoose.models.Audit || mongoose.model<IAudit>('Audit', AuditSchema);
export default Audit;
