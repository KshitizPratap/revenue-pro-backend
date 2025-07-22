import { Schema, model, Document } from 'mongoose';

export interface IWeeklyActual {
  userId: string;
  startDate: string;
  endDate: string;
  testingBudgetSpent: number;
  awarenessBrandingBudgetSpent: number;
  leadGenerationBudgetSpent: number;
  revenue: number;
  jobsBooked: number;
  estimatesRan: number;
  estimatesSet: number;
}

export interface IWeeklyActualDocument extends IWeeklyActual, Document {}

const weeklyActualSchema = new Schema<IWeeklyActualDocument>({
  userId: { type: String, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  testingBudgetSpent: { type: Number, required: true },
  awarenessBrandingBudgetSpent: { type: Number, required: true },
  leadGenerationBudgetSpent: { type: Number, required: true },
  revenue: { type: Number, required: true },
  jobsBooked: { type: Number, required: true },
  estimatesRan: { type: Number, required: true },
  estimatesSet: { type: Number, required: true },
}, { timestamps: true });

// Optional: Enforce uniqueness on (userId + startDate) to prevent duplicate weekly entries
weeklyActualSchema.index({ userId: 1, startDate: 1 }, { unique: true });

export default model<IWeeklyActualDocument>('WeeklyActual', weeklyActualSchema);
