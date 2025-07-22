import { IWeeklyActual } from "../domain/actual.domain.js";
import { IWeeklyActualDocument } from "../repository/models/actual.model.js";
import { ActualRepository } from "../repository/repository.js";
import { DateUtils } from "../../../utils/date.utils.js";

export class ActualService {
  private actualRepository: ActualRepository;

  constructor() {
    this.actualRepository = new ActualRepository();
  }

  /**
   * Get Actuals for a year, aggregated by month (array of 12 objects).
   */
  public async getActualYearlyMonthlyAggregate(
    userId: string,
    year: number
  ): Promise<IWeeklyActual[]> {
    const results: IWeeklyActual[] = [];
    for (let month = 0; month < 12; month++) {
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      const monthStartStr = monthStart.toISOString().slice(0, 10);
      const monthEndStr = monthEnd.toISOString().slice(0, 10);
      // Get all weeks in this month
      const weeks = DateUtils.getMonthWeeks(monthStartStr, monthEndStr);
      const weeklyActuals = await Promise.all(
        weeks.map(async ({ weekStart, weekEnd }) => {
          const actual = await this.actualRepository.findActualByStartDate(userId, weekStart);
          return actual
            ? actual.toObject()
            : this._zeroFilledActual(weekStart, weekEnd, userId);
        })
      );
      // Aggregate all weeks in the month into a single object
      let aggregated: IWeeklyActual;
      if (weeklyActuals.length === 0) {
        aggregated = this._zeroFilledActual(monthStartStr, monthEndStr, userId);
      } else {
        aggregated = weeklyActuals.reduce((acc, curr) => {
          acc.testingBudgetSpent += curr.testingBudgetSpent || 0;
          acc.awarenessBrandingBudgetSpent += curr.awarenessBrandingBudgetSpent || 0;
          acc.leadGenerationBudgetSpent += curr.leadGenerationBudgetSpent || 0;
          acc.revenue += curr.revenue || 0;
          acc.jobsBooked += curr.jobsBooked || 0;
          acc.estimatesRan += curr.estimatesRan || 0;
          acc.estimatesSet += curr.estimatesSet || 0;
          return acc;
        }, this._zeroFilledActual(monthStartStr, monthEndStr, userId));
      }
      aggregated.startDate = monthStartStr;
      aggregated.endDate = monthEndStr;
      results.push(aggregated);
    }
    return results;
  }

  private _zeroFilledActual(
    startDate: string,
    endDate: string,
    userId: string
  ): IWeeklyActual {
    return {
      userId,
      startDate,
      endDate,
      testingBudgetSpent: 0,
      awarenessBrandingBudgetSpent: 0,
      leadGenerationBudgetSpent: 0,
      revenue: 0,
      jobsBooked: 0,
      estimatesRan: 0,
      estimatesSet: 0,
    };
  }

  /**
   * Upsert Actual Data for a single week.
   */
  public async upsertActualWeekly(
    userId: string,
    startDate: string,
    endDate: string,
    data: Partial<IWeeklyActual>
  ): Promise<IWeeklyActualDocument> {
    const week = DateUtils.getWeekDetails(startDate);

    const payload: IWeeklyActual = {
      userId,
      startDate: week.weekStart,
      endDate: week.weekEnd,
      testingBudgetSpent: data.testingBudgetSpent ?? 0,
      awarenessBrandingBudgetSpent: data.awarenessBrandingBudgetSpent ?? 0,
      leadGenerationBudgetSpent: data.leadGenerationBudgetSpent ?? 0,
      revenue: data.revenue ?? 0,
      jobsBooked: data.jobsBooked ?? 0,
      estimatesRan: data.estimatesRan ?? 0,
      estimatesSet: data.estimatesSet ?? 0,
    };

    const existing = await this.actualRepository.findActualByStartDate(
      userId,
      week.weekStart
    );

    let actual: IWeeklyActualDocument | null;

    if (existing) {
      actual = await this.actualRepository.updateActual({
        ...existing.toObject(),
        ...payload,
      });
    } else {
      actual = await this.actualRepository.createActual(payload);
    }

    if (!actual) throw new Error("Upsert failed for actual data");
    return actual;
  }

  /**
   * Get Actual for one week.
   */
  public async getActualWeekly(
    userId: string,
    date: string
  ): Promise<IWeeklyActual> {
    const week = DateUtils.getWeekDetails(date);
    const actual = await this.actualRepository.findActualByStartDate(
      userId,
      week.weekStart
    );

    return actual
      ? actual.toObject()
      : this._zeroFilledActual(week.weekStart, week.weekEnd, userId);
  }

  /**
   * Get Actuals for a month (array of weekly actuals).
   */
  public async getActualMonthly(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<IWeeklyActual[]> {
    const weeks = DateUtils.getMonthWeeks(startDate, endDate);

    return await Promise.all(
      weeks.map(async ({ weekStart, weekEnd }) => {
        const actual = await this.actualRepository.findActualByStartDate(
          userId,
          weekStart
        );
        return actual
          ? actual.toObject()
          : this._zeroFilledActual(weekStart, weekEnd, userId);
      })
    );
  }

  /**
   * Get Actuals for a year (array of weekly actuals).
   */
  public async getActualYearly(
    userId: string,
    year: number
  ): Promise<IWeeklyActual[]> {
    const weeks = DateUtils.getYearWeeks(year);

    return await Promise.all(
      weeks.map(async ({ weekStart, weekEnd }) => {
        const actual = await this.actualRepository.findActualByStartDate(
          userId,
          weekStart
        );
        return actual
          ? actual.toObject()
          : this._zeroFilledActual(weekStart, weekEnd, userId);
      })
    );
  }

  public async getActualsByDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ) {
    // Get all week ranges between startDate and endDate
    const weeks = DateUtils.getMonthWeeks(startDate, endDate);
    return await Promise.all(
      weeks.map(async ({ weekStart, weekEnd }) => {
        const actual = await this.actualRepository.findActualByStartDate(
          userId,
          weekStart
        );
        return actual
          ? actual.toObject()
          : this._zeroFilledActual(weekStart, weekEnd, userId);
      })
    );
  }

  /**
   * Wrapper to get actuals by period type.
   */
  public async getActualByPeriod(
    userId: string,
    startDate: string,
    endDate: string,
    type: "weekly" | "monthly" | "yearly"
  ): Promise<IWeeklyActual | IWeeklyActual[]> {
    switch (type) {
      case "weekly":
        return this.getActualWeekly(userId, startDate);
      case "monthly":
        return this.getActualMonthly(userId, startDate, endDate);
      case "yearly":
        return this.getActualYearlyMonthlyAggregate(userId, new Date(startDate).getFullYear());
      default:
        throw new Error("Invalid type provided");
    }
  }
}
