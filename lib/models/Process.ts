import mongoose, { Schema, Document, Model } from 'mongoose';

const StakeholderSchema = new Schema({
  role: { type: String, default: '' },
  name: { type: String, default: '' },
  type: { type: String, enum: ['internal', 'client'], default: 'internal' },
  influenceLevel: { type: String, enum: ['very_high', 'high', 'medium', 'low'], default: 'medium' },
  aiAttitude: { type: String, enum: ['champion', 'supporter', 'neutral', 'sceptic', 'blocker', 'unknown'], default: 'unknown' },
  notes: { type: String, default: '' },
}, { _id: false });

const ProfileEntrySchema = new Schema({
  id: { type: String, required: true },
  role: { type: String, default: '' },
  type: { type: String, enum: ['internal', 'client'], default: 'internal' },
  count: { type: Number, default: 1 },
  hourlyRateEur: { type: Number, default: 0 },
}, { _id: false });

const SovereigntyAxisSchema = new Schema({
  status: { type: String, enum: ['green', 'amber', 'red'], default: 'amber' },
  findings: { type: String, default: '' },
  implications: { type: String, default: '' },
  normativeFrameworks: [{ type: String }],
  infrastructureMode: { type: String, enum: ['client_onsite', 'client_onpremise', 'client_cloud', 'atexis_onpremise', 'atexis_cloud', 'hybrid', ''], default: '' },
}, { _id: false });

const ProfileHoursSchema = new Schema({
  profileId: { type: String, default: '' },
  role: { type: String, default: '' },
  hours: { type: Number, default: 0 },
}, { _id: false });

const FileAttachmentSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, default: '' },
  url: { type: String, default: '' },
}, { _id: false });

const TaskSchema = new Schema({
  id: { type: String, required: true },
  description: { type: String, default: '' },
}, { _id: false });

const ActivitySchema = new Schema({
  id: { type: String, required: true },
  order: { type: Number, default: 0 },
  name: { type: String, default: '' },
  tools: [{ type: String }],
  inputs: [{ type: String }],
  outputs: [{ type: String }],
  inputFiles: [FileAttachmentSchema],
  outputFiles: [FileAttachmentSchema],
  responsibleProfile: { type: String, default: '' },
  profileHours: [ProfileHoursSchema],
  estimatedTimeHours: { type: Number, default: 0 },
  annualRepetitions: { type: Number, default: 0 },
  stepRepetitions: { type: Number, default: 1 },
  isDecisionPoint: { type: Boolean, default: false },
  linkedUseCaseIds: [{ type: String }],
  notes: { type: String, default: '' },
  tasks: { type: [TaskSchema], default: [] },
}, { _id: false });

export type DepartmentType = 'Technical Publications' | 'Training Development' | 'Training Delivery' | 'ISS' | 'LSA' | 'Digital' | 'Simulation' | 'General ILS' | 'Material Supply' | 'Provisioning' | 'Supply Chain' | 'D&D Engineering' | 'Other';

export interface IProcess extends Document {
  auditId: mongoose.Types.ObjectId;
  procId: string;
  name: string;
  department: DepartmentType;
  responsible: string;
  sector: string;
  applicableNorms: string[];
  activeCertifications: string[];
  digitalMaturityLevel: number;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_audit' | 'completed' | 'paused';
  // B1
  b1?: {
    formalName: string;
    department: string;
    contractReference: string;
    captureDate: Date;
    numberOfPeople: number;
    stakeholders: object[];
    profiles: object[];
    notes: string;
    clientDepartment?: string;
    clientResponsible?: string;
    technicalDirectorResponsible?: string;
  };
  // B2
  b2?: {
    axes: {
      axis1_InfoClassification: object;
      axis2_ProcessSovereignty: object;
      axis3_ToolSovereignty: object;
      axis4_DataSovereignty: object;
      axis5_Infrastructure: object;
    };
  };
  // B3
  b3?: {
    activities: object[];
    notes: string;
    annualRepetitions: number;
  };
  createdAt: Date;
}

const ProcessSchema = new Schema<IProcess>({
  auditId: { type: Schema.Types.ObjectId, ref: 'Audit', required: true },
  procId: { type: String, required: true },
  name: { type: String, required: true },
  department: { type: String, enum: ['Technical Publications', 'Training Development', 'Training Delivery', 'ISS', 'LSA', 'Digital', 'Simulation', 'General ILS', 'Material Supply', 'Provisioning', 'Supply Chain', 'D&D Engineering', 'Other'], default: 'Other' },
  responsible: { type: String, default: '' },
  sector: { type: String, default: '' },
  applicableNorms: [{ type: String }],
  activeCertifications: [{ type: String }],
  digitalMaturityLevel: { type: Number, min: 1, max: 5, default: 1 },
  priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  status: { type: String, enum: ['pending', 'in_audit', 'completed', 'paused'], default: 'pending' },
  b1: {
    formalName: { type: String, default: '' },
    department: { type: String, default: '' },
    contractReference: { type: String, default: '' },
    captureDate: { type: Date },
    numberOfPeople: { type: Number, default: 0 },
    stakeholders: [StakeholderSchema],
    profiles: [ProfileEntrySchema],
    notes: { type: String, default: '' },
    clientDepartment: { type: String, default: '' },
    clientResponsible: { type: String, default: '' },
    technicalDirectorResponsible: { type: String, default: '' },
  },
  b2: {
    axes: {
      axis1_InfoClassification: SovereigntyAxisSchema,
      axis2_ProcessSovereignty: SovereigntyAxisSchema,
      axis3_ToolSovereignty: SovereigntyAxisSchema,
      axis4_DataSovereignty: SovereigntyAxisSchema,
      axis5_Infrastructure: SovereigntyAxisSchema,
    },
  },
  b3: {
    activities: [ActivitySchema],
    notes: { type: String, default: '' },
    annualRepetitions: { type: Number, default: 1 },
  },
}, { timestamps: true });

const Process: Model<IProcess> = mongoose.models.Process || mongoose.model<IProcess>('Process', ProcessSchema);
export default Process;
