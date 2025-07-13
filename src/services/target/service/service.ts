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
      year: weekInfo.year,
      weekNumber: weekInfo.weekNumber,
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

    // Try to find an existing target
    const existingTarget = await this.targetRepository.findTargetByStartDate(userId, weekInfo.startDate);

    let target: IWeeklyTargetDocument | null;
    if (existingTarget) {
      // If target exists, update it
      target = await this.targetRepository.updateTarget({ ...existingTarget.toObject(), ...data });
    } else {
      // If no target exists, create a new one
      target = await this.targetRepository.createTarget({ ...defaultTarget, ...data });
    }

    if (!target) throw new Error('Failed to update or create weekly target.');
    return target;
  }

  private _aggregateTargets(targets: IWeeklyTargetDocument[]): IWeeklyTargetDocument {
    if (targets.length === 0) {
      return {
        userId: '', // This will be overwritten or should be handled by the calling function for clarity
        startDate: new Date(),
        endDate: new Date(),
        leads: 0,
        revenue: 0,
        avgJobSize: 0,
        appointmentRate: 0,
        showRate: 0,
        closeRate: 0,
        adSpendBudget: 0,
        costPerLead: 0,
        costPerEstimateSet: 0,
        costPerJobBooked: 0,
        year: new Date().getFullYear(), // Default year
        weekNumber: 0 // Default weekNumber for empty aggregate
      } as IWeeklyTargetDocument;
    }

    const aggregated: IWeeklyTarget = {
      userId: targets[0].userId, // Assuming all targets belong to the same user
      startDate: targets[0].startDate, // This might not be meaningful for aggregated data, consider adjusting
      endDate: targets[targets.length - 1].endDate, // Same as above
      year: targets[0].year,
      weekNumber: targets[0].weekNumber,
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

    let validCountAvgJobSize = 0;
    let validCountAppointmentRate = 0;
    let validCountShowRate = 0;
    let validCountCloseRate = 0;
    let validCountCostPerLead = 0;
    let validCountCostPerEstimateSet = 0;
    let validCountCostPerJobBooked = 0;

    for (const target of targets) {
      aggregated.leads += target.leads || 0;
      aggregated.revenue += target.revenue || 0;
      aggregated.adSpendBudget += target.adSpendBudget || 0;

      if (target.avgJobSize !== undefined && target.avgJobSize !== null) {
        aggregated.avgJobSize += target.avgJobSize;
        validCountAvgJobSize++;
      }
      if (target.appointmentRate !== undefined && target.appointmentRate !== null) {
        aggregated.appointmentRate += target.appointmentRate;
        validCountAppointmentRate++;
      }
      if (target.showRate !== undefined && target.showRate !== null) {
        aggregated.showRate += target.showRate;
        validCountShowRate++;
      }
      if (target.closeRate !== undefined && target.closeRate !== null) {
        aggregated.closeRate += target.closeRate;
        validCountCloseRate++;
      }
      if (target.costPerLead !== undefined && target.costPerLead !== null) {
        aggregated.costPerLead += target.costPerLead;
        validCountCostPerLead++;
      }
      if (target.costPerEstimateSet !== undefined && target.costPerEstimateSet !== null) {
        aggregated.costPerEstimateSet += target.costPerEstimateSet;
        validCountCostPerEstimateSet++;
      }
      if (target.costPerJobBooked !== undefined && target.costPerJobBooked !== null) {
        aggregated.costPerJobBooked += target.costPerJobBooked;
        validCountCostPerJobBooked++;
      }
    }

    aggregated.avgJobSize = validCountAvgJobSize > 0 ? aggregated.avgJobSize / validCountAvgJobSize : 0;
    aggregated.appointmentRate = validCountAppointmentRate > 0 ? aggregated.appointmentRate / validCountAppointmentRate : 0;
    aggregated.showRate = validCountShowRate > 0 ? aggregated.showRate / validCountShowRate : 0;
    aggregated.closeRate = validCountCloseRate > 0 ? aggregated.closeRate / validCountCloseRate : 0;
    aggregated.costPerLead = validCountCostPerLead > 0 ? aggregated.costPerLead / validCountCostPerLead : 0;
    aggregated.costPerEstimateSet = validCountCostPerEstimateSet > 0 ? aggregated.costPerEstimateSet / validCountCostPerEstimateSet : 0;
    aggregated.costPerJobBooked = validCountCostPerJobBooked > 0 ? aggregated.costPerJobBooked / validCountCostPerJobBooked : 0;

    return aggregated as IWeeklyTargetDocument;
  }

  public async upsertTargetByPeriod(
    userId: string,
    date: Date,
    queryType: 'weekly' | 'monthly' | 'yearly',
    data: Partial<IWeeklyTarget>
  ): Promise<IWeeklyTargetDocument[] | IWeeklyTargetDocument> {
    switch (queryType) {
      case 'weekly':
        return this.upsertWeeklyTarget(userId, date, data);
      case 'monthly':
        const weeksInMonth = DateUtils.getWeeksInMonth(date.getFullYear(), date.getMonth() + 1);
        if (weeksInMonth.length === 0) {
          return [];
        }
        const monthlyProratedData = {
          ...data,
          leads: data.leads ? data.leads / weeksInMonth.length : 0,
          revenue: data.revenue ? data.revenue / weeksInMonth.length : 0,
          avgJobSize: data.avgJobSize ? data.avgJobSize / weeksInMonth.length : 0,
          appointmentRate: data.appointmentRate ? data.appointmentRate / weeksInMonth.length : 0,
          showRate: data.showRate ? data.showRate / weeksInMonth.length : 0,
          closeRate: data.closeRate ? data.closeRate / weeksInMonth.length : 0,
          adSpendBudget: data.adSpendBudget ? data.adSpendBudget / weeksInMonth.length : 0,
          costPerLead: data.costPerLead ? data.costPerLead / weeksInMonth.length : 0,
          costPerEstimateSet: data.costPerEstimateSet ? data.costPerEstimateSet / weeksInMonth.length : 0,
          costPerJobBooked: data.costPerJobBooked ? data.costPerJobBooked / weeksInMonth.length : 0,
        };
        const monthlyUpsertPromises = weeksInMonth.map(week =>
          this.upsertWeeklyTarget(userId, week.startDate, monthlyProratedData)
        );
        return Promise.all(monthlyUpsertPromises);
      case 'yearly':
        const weeksInYear = DateUtils.getWeeksInYear(date.getFullYear());
        if (weeksInYear.length === 0) {
          return [];
        }
        const yearlyProratedData = {
          ...data,
          leads: data.leads ? data.leads / weeksInYear.length : 0,
          revenue: data.revenue ? data.revenue / weeksInYear.length : 0,
          avgJobSize: data.avgJobSize ? data.avgJobSize / weeksInYear.length : 0,
          appointmentRate: data.appointmentRate ? data.appointmentRate / weeksInYear.length : 0,
          showRate: data.showRate ? data.showRate / weeksInYear.length : 0,
          closeRate: data.closeRate ? data.closeRate / weeksInYear.length : 0,
          adSpendBudget: data.adSpendBudget ? data.adSpendBudget / weeksInYear.length : 0,
          costPerLead: data.costPerLead ? data.costPerLead / weeksInYear.length : 0,
          costPerEstimateSet: data.costPerEstimateSet ? data.costPerEstimateSet / weeksInYear.length : 0,
          costPerJobBooked: data.costPerJobBooked ? data.costPerJobBooked / weeksInYear.length : 0,
        };
        const yearlyUpsertPromises = weeksInYear.map(week =>
          this.upsertWeeklyTarget(userId, week.startDate, yearlyProratedData)
        );
        return Promise.all(yearlyUpsertPromises);
      default:
        throw new Error('Invalid queryType');
    }
  }

  public async getWeeklyTarget(userId: string, date: Date): Promise<IWeeklyTargetDocument> {
    const weekInfo = DateUtils.getWeekInfo(date);
    const target = await this.targetRepository.findTargetByStartDate(userId, weekInfo.startDate);
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
        costPerJobBooked: 0,
        year: weekInfo.year,
        weekNumber: weekInfo.weekNumber
      } as IWeeklyTargetDocument;
    }
    return target;
  }

  public async getAggregatedMonthlyTarget(userId: string, year: number, month: number): Promise<IWeeklyTargetDocument> {
    const weeksInMonth = DateUtils.getWeeksInMonth(year, month);
    if (weeksInMonth.length === 0) {
      return this._aggregateTargets([]); // Return zero-filled object if no weeks found
    }
    const firstWeekStartDate = weeksInMonth[0].startDate;
    const lastWeekEndDate = weeksInMonth[weeksInMonth.length - 1].endDate;
    const weeklyTargets = await this.targetRepository.getTargetsByDateRange(
      firstWeekStartDate,
      lastWeekEndDate,
      userId
    );
    return this._aggregateTargets(weeklyTargets);
  }

  public async getAggregatedYearlyTarget(userId: string, year: number): Promise<IWeeklyTargetDocument> {
    const weeksInYear = DateUtils.getWeeksInYear(year);
    if (weeksInYear.length === 0) {
      return this._aggregateTargets([]); // Return zero-filled object if no weeks found
    }
    const firstWeekStartDate = weeksInYear[0].startDate;
    const lastWeekEndDate = weeksInYear[weeksInYear.length - 1].endDate;
    const weeklyTargets = await this.targetRepository.getTargetsByDateRange(
      firstWeekStartDate,
      lastWeekEndDate,
      userId
    );
    return this._aggregateTargets(weeklyTargets);
  }
}