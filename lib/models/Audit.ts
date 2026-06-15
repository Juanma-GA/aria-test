import mongoose, { Schema, Document, Model } from 'mongoose';

export type AuditTeamRole = 'owner' | 'editor' | 'viewer';

export interface IAuditTeamMember {
  userId: mongoose.Types.ObjectId;
  role: AuditTeamRole;
  addedAt: Date;
  addedBy?: mongoose.Types.ObjectId;
}

export interface IAudit extends Document {
  name: string;
  client: string;
  project: string;
  sector: 'defence' | 'aerospace' | 'naval' | 'railway' | 'internal' | 'other';
  leadConsultant: mongoose.Types.ObjectId;
  collaborators: mongoose.Types.ObjectId[];
  team: IAuditTeamMember[];
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

const TeamMemberSchema = new Schema<IAuditTeamMember>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'editor', 'viewer'], required: true },
  addedAt: { type: Date, default: Date.now },
  addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { _id: false });

const AuditSchema = new Schema<IAudit>({
  name: { type: String, required: true },
  client: { type: String, required: true },
  project: { type: String, default: '' },
  sector: { type: String, enum: ['defence', 'aerospace', 'naval', 'railway', 'internal', 'other'], required: true },
  leadConsultant: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  collaborators: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  team: { type: [TeamMemberSchema], default: [] },
  status: { type: String, enum: ['draft', 'active', 'review', 'completed'], default: 'draft' },
  classification: { type: String, enum: ['internal', 'confidential', 'reserved', 'secret'], default: 'internal' },
  startDate: { type: Date, required: true },
  targetEndDate: { type: Date, required: true },
  auditCode: { type: String },
  isArchived: { type: Boolean, default: false, index: true },
  report: {
    generatedAt: { type: Date },
    model: { type: String, default: '' },
    markdown: { type: String, default: '' },
  },
}, { timestamps: true });

AuditSchema.index({ 'team.userId': 1 });

const Audit: Model<IAudit> = mongoose.models.Audit || mongoose.model<IAudit>('Audit', AuditSchema);
export default Audit;
