import mongoose, { Schema, Document } from 'mongoose';

export interface ICatalogStats extends Document {
  type: 'sync' | 'refresh';
  executedAt: Date;
  webSearchOk: boolean;
  aiModelsCreated: number;
  aiModelsUpdated: number;
  gpusCreated: number;
  gpusUpdated: number;
}

const CatalogStatsSchema = new Schema<ICatalogStats>(
  {
    type: {
      type: String,
      enum: ['sync', 'refresh'],
      required: true,
      unique: true,
    },
    executedAt: {
      type: Date,
      required: true,
    },
    webSearchOk: {
      type: Boolean,
      default: false,
    },
    aiModelsCreated: {
      type: Number,
      default: 0,
    },
    aiModelsUpdated: {
      type: Number,
      default: 0,
    },
    gpusCreated: {
      type: Number,
      default: 0,
    },
    gpusUpdated: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: false }
);

CatalogStatsSchema.index({ type: 1 });

export const CatalogStats =
  mongoose.models.CatalogStats ||
  mongoose.model<ICatalogStats>('CatalogStats', CatalogStatsSchema);
