import { IWeeklyTarget } from '../domain/target.domain.js';
import { IWeeklyTargetDocument } from '../repository/models/target.model.js';
import { TargetRepository } from '../repository/repository.js';
import { DateUtils } from '../../../utils/date.utils.js';

export class TargetService {
  private targetRepository: TargetRepository;

  constructor() {
    this.targetRepository = new TargetRepository();
  }

  public async upsertWeeklyTarget(userId: string, date: Date, data: Partial<IWeeklyTarget>): Promise<IWeeklyTargetDocument> {
    const weekInfo = DateUtils.getWeekInfo(date);
    const defaultTarget: IWeeklyTarget = {
      userId, // Pass userId
      startDate: weekInfo.startDate,
      endDate: weekInfo.endDate,
      leads: 0,
      revenue: 0,
      avgJobSize: 0,
      appointmentRate: 0,
      showRate: 0,
      closeRate: 0,
      adSpendBudget: 0,
      costPerLead: 0,
      costPerEstimateSet: 0,
      costPerJobBooked: 0
    };
    const target = await this.targetRepository.upsertTarget({
      ...defaultTarget,
      ...data
    });
    if (!target) throw new Error('Failed to update or create weekly target.');
    return target;
  }

  public async getWeeklyTarget(userId: string, date: Date): Promise<IWeeklyTargetDocument> {
    const weekInfo = DateUtils.getWeekInfo(date);
    const targets = await this.targetRepository.getTargets({
      userId,
      startDate: weekInfo.startDate,
      type: 'weekly'
    });
    const target = targets[0];
    if (!target) {
      // Return an object with 0 values if no target is found
      return {
        userId,
        startDate: weekInfo.startDate,
        endDate: weekInfo.endDate,
        leads: 0,
        revenue: 0,
        avgJobSize: 0,
        appointmentRate: 0,
        showRate: 0,
        closeRate: 0,
        adSpendBudget: 0,
        costPerLead: 0,
        costPerEstimateSet: 0,
        costPerJobBooked: 0
      } as IWeeklyTargetDocument;
    }
    return target;
  }

  public async getMonthlyTargets(userId: string, date: Date): Promise<IWeeklyTargetDocument[]> {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // Convert to 1-based month
    
    // Get the first and last day of the month
    const { startDate: monthStart, endDate: monthEnd } = DateUtils.getMonthStartEnd(year, month);
    
    // Get the week that contains the first day of the month
    const firstWeekInfo = DateUtils.getWeekInfo(monthStart);
    // Get the week that contains the last day of the month
    const lastWeekInfo = DateUtils.getWeekInfo(monthEnd);

    return this.targetRepository.getTargetsByDateRange(
      firstWeekInfo.startDate,
      lastWeekInfo.endDate,
      userId
    );
  }

  public async getWeeklyTargetsByDateRange(userId: string, startDate: Date, endDate: Date): Promise<IWeeklyTargetDocument[]> {
    // Adjust dates to week boundaries
    const startWeekInfo = DateUtils.getWeekInfo(startDate);
    const endWeekInfo = DateUtils.getWeekInfo(endDate);
    
    return this.targetRepository.getTargets({
      userId,
      startDate: startWeekInfo.startDate,
      type: 'weekly'
    });
  }

  public async getWeeklyTargetsByYear(userId: string, year: number): Promise<IWeeklyTargetDocument[]> {
    const startDate = new Date(year, 0, 1);
    return this.targetRepository.getTargets({
      userId,
      startDate,
      type: 'yearly'
    });
  }
}