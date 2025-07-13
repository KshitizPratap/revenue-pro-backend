import { Schema, model, Document } from 'mongoose';
import { IWeeklyTarget } from '../../domain/target.domain.js';

export interface IWeeklyTargetDocument extends IWeeklyTarget, Document {}

const weeklyTargetSchema = new Schema<IWeeklyTargetDocument>({
  userId: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  year: { type: Number, required: true },
  weekNumber: { type: Number, required: true },
  leads: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
  avgJobSize: { type: Number, default: 0 },
  appointmentRate: { type: Number, default: 0 },
  showRate: { type: Number, default: 0 },
  closeRate: { type: Number, default: 0 },
  adSpendBudget: { type: Number, default: 0 },
  costPerLead: { type: Number, default: 0 },
  costPerEstimateSet: { type: Number, default: 0 },
  costPerJobBooked: { type: Number, default: 0 }
}, { timestamps: true });

// Index on startDate for efficient queries
weeklyTargetSchema.index({ userId: 1, year: 1, weekNumber: 1 }, { unique: true });

export default model<IWeeklyTargetDocument>('WeeklyTarget', weeklyTargetSchema);