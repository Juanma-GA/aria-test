import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Single catalog with two kinds:
 *  - 'ai_model'  → an LLM/AI service entry (vendor, context window, token prices, deployment mode)
 *  - 'gpu'       → a hardware entry (TDP, VRAM, unit price)
 *
 * Kept in one collection with kind-specific optional fields so the admin page
 * can manage both with a single CRUD surface and the "Refresh with AI" route
 * can update both in one call. Unused fields per kind stay null/undefined.
 *
 * `aiUpdatedAt` + `aiRationale` are populated by the AI refresh route.
 */
export type CatalogKind = 'ai_model' | 'gpu';
export type AIModelDeploymentMode = 'cloud_api' | 'on_premise' | 'hybrid';

export interface ICatalogItem extends Document {
  kind: CatalogKind;
  name: string;
  isActive: boolean;
  notes?: string;

  // ai_model fields
  vendor?: string;
  contextWindow?: number;
  pricePerMInputTokens?: number;
  pricePerMOutputTokens?: number;
  deploymentMode?: AIModelDeploymentMode;
  /** Approx active-parameter count of the model in billions, used for VRAM sizing. */
  paramCountB?: number;

  // gpu fields
  tdpW?: number;
  vramGb?: number;
  priceEur?: number;
  /** Concurrent users this GPU can serve at acceptable SLA (vendor benchmark
   *  or measured). Used by the compute calculator to default the case's
   *  declared HW capacity. */
  concurrentUsersPerGpu?: number;

  aiUpdatedAt?: Date;
  aiRationale?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CatalogSchema = new Schema<ICatalogItem>({
  kind: { type: String, enum: ['ai_model', 'gpu'], required: true, index: true },
  name: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true },
  notes: { type: String, default: '' },

  vendor: { type: String, trim: true },
  contextWindow: { type: Number, min: 0 },
  pricePerMInputTokens: { type: Number, min: 0 },
  pricePerMOutputTokens: { type: Number, min: 0 },
  deploymentMode: { type: String, enum: ['cloud_api', 'on_premise', 'hybrid'] },
  paramCountB: { type: Number, min: 0 },

  tdpW: { type: Number, min: 0 },
  vramGb: { type: Number, min: 0 },
  priceEur: { type: Number, min: 0 },
  concurrentUsersPerGpu: { type: Number, min: 0 },

  aiUpdatedAt: { type: Date },
  aiRationale: { type: String, default: '' },
}, { timestamps: true });

// Same name within a kind must be unique (e.g. two distinct "RTX 4090" entries make no sense).
CatalogSchema.index({ kind: 1, name: 1 }, { unique: true });
CatalogSchema.index({ kind: 1, isActive: 1 });

const Catalog: Model<ICatalogItem> =
  mongoose.models.Catalog || mongoose.model<ICatalogItem>('Catalog', CatalogSchema);
export default Catalog;
