import { Model } from 'mongoose';
import { IWeeklyTarget, ITargetQuery } from '../domain/target.domain.js';
import WeeklyTarget, { IWeeklyTargetDocument } from './models/target.model.js';

export class TargetRepository {
  private model: Model<IWeeklyTargetDocument>;

  constructor() {
    this.model = WeeklyTarget;
  }

  async upsertTarget(targetData: IWeeklyTarget): Promise<IWeeklyTargetDocument> {
    return this.model.findOneAndUpdate(
      { userId: targetData.userId, startDate: targetData.startDate },
      targetData,
      { new: true, upsert: true }
    );
  }

  async getTargets(query: ITargetQuery): Promise<IWeeklyTargetDocument[]> {
    let endDate: Date;
    const startDate = new Date(query.startDate);
    
    switch (query.type) {
      case 'weekly':
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        break;
      
      case 'monthly':
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
        break;
      
      case 'yearly':
        endDate = new Date(startDate.getFullYear(), 11, 31);
        break;
    }

    return this.model.find({
      userId: query.userId,
      startDate: { 
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ startDate: 1 });
  }

  async getTargetsByDateRange(startDate: Date, endDate: Date, userId: string): Promise<IWeeklyTargetDocument[]> {
    return this.model.find({
      userId,
      startDate: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ startDate: 1 });
  }
} 