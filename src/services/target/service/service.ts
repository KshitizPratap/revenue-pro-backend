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
    const targets = await this.targetRepository.getTargets({ userId, startDate: weekInfo.startDate, endDate: weekInfo.endDate });
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

  public async getMonthlyTargets(userId: string, year: number, month: number): Promise<IWeeklyTargetDocument[]> {
    const weeksInMonth = DateUtils.getWeeksInMonth(year, month);
    if (weeksInMonth.length === 0) {
      return [];
    }
    const firstWeekStartDate = weeksInMonth[0].startDate;
    const lastWeekEndDate = weeksInMonth[weeksInMonth.length - 1].endDate;
    return this.targetRepository.getTargetsByDateRange(
      firstWeekStartDate,
      lastWeekEndDate,
      userId
    );
  }

  public async getWeeklyTargetsByYear(userId: string, year: number): Promise<IWeeklyTargetDocument[]> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    return this.targetRepository.getTargetsByDateRange(startDate, endDate, userId);
  }
}