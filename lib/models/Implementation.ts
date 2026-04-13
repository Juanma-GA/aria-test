import mongoose from 'mongoose'

const ImplementationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  pocId: { type: mongoose.Schema.Types.ObjectId, ref: 'POC' },
  status: { type: String, enum: ['planned', 'in-progress', 'deployed'], default: 'planned' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

export default mongoose.models.Implementation || mongoose.model('Implementation', ImplementationSchema)