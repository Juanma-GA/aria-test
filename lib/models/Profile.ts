import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Catalog of staff profiles used for cost estimation in industrializations.
 * Distinct from per-process B1.profiles (which are sized for a specific process)
 * — these are organisation-wide rate cards: a Senior Engineer always costs €X/h
 * regardless of which industrialization is using their hours.
 */
export interface IProfile extends Document {
  name: string;
  role: string;
  hourlyRateEur: number;
  isActive: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProfileSchema = new Schema<IProfile>({
  name: { type: String, required: true, trim: true },
  role: { type: String, required: true, trim: true },
  hourlyRateEur: { type: Number, required: true, min: 0 },
  isActive: { type: Boolean, default: true },
  notes: { type: String, default: '' },
}, { timestamps: true });

ProfileSchema.index({ name: 1 }, { unique: true });
ProfileSchema.index({ isActive: 1, role: 1 });

const Profile: Model<IProfile> =
  mongoose.models.Profile || mongoose.model<IProfile>('Profile', ProfileSchema);
export default Profile;
