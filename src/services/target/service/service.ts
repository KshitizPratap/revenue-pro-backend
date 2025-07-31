import { IWeeklyTarget } from "../domain/target.domain.js";
import { IWeeklyTargetDocument } from "../repository/models/target.model.js";
import { TargetRepository } from "../repository/repository.js";
import { DateUtils } from "../../../utils/date.utils.js";

export class TargetService {
  private targetRepository: TargetRepository;

  constructor() {
    this.targetRepository = new TargetRepository();
    // Test the getMonthWeeks function
    DateUtils.testGetMonthWeeks();
  }

  private _aggregateTargets(
    targets: IWeeklyTargetDocument[],
    queryType: string,
    userId?: string,
    startDate?: string,
    endDate?: string
  ): IWeeklyTargetDocument {
    if (targets.length === 0) {
      return {
        userId: userId || "",
        startDate: startDate || new Date().toISOString(),
        endDate: endDate || new Date().toISOString(),
        appointmentRate: 0,
        avgJobSize: 0,
        closeRate: 0,
        com: 0,
        revenue: 0,
        showRate: 0,
        queryType: queryType,
        year: new Date().getFullYear(),
        weekNumber: 0,
      } as unknown as IWeeklyTargetDocument;
    }

    // Use the passed dates if available, otherwise calculate from first target
    let finalStartDate: string;
    let finalEndDate: string;
    let year: number;
    
    if (startDate && endDate) {
      // Use the passed dates (this is what we want for monthly aggregation)
      finalStartDate = startDate;
      finalEndDate = endDate;
      year = new Date(startDate).getFullYear();
    } else {
      // Fallback to calculating from first target (for backward compatibility)
      const firstTarget = targets[0];
      const firstDate = new Date(firstTarget.startDate);
      year = firstDate.getFullYear();
      const month = firstDate.getMonth();
      
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      
      finalStartDate = monthStart.toISOString().split('T')[0];
      finalEndDate = monthEnd.toISOString().split('T')[0];
    }
    
    const aggregated: IWeeklyTarget = {
      userId: targets[0].userId,
      startDate: finalStartDate,
      endDate: finalEndDate,
      year: year,
      weekNumber: targets[0].weekNumber,
      appointmentRate: 0,
      avgJobSize: 0,
      closeRate: 0,
      com: 0,
      revenue: 0,
      showRate: 0,
      queryType: targets[0].queryType || "",
    };

    // Sum up revenue from all weekly targets
    for (const target of targets) {
      aggregated.revenue += target.revenue || 0;
    }
    
    // Use values from the first target for other fields (they should be the same across weeks)
    aggregated.avgJobSize = targets[0].avgJobSize || 0;
    aggregated.appointmentRate = targets[0].appointmentRate || 0;
    aggregated.showRate = targets[0].showRate || 0;
    aggregated.closeRate = targets[0].closeRate || 0;
    aggregated.com = targets[0].com || 0;

    return aggregated as IWeeklyTargetDocument;
  }

  public async upsertWeeklyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    data: Partial<IWeeklyTarget>,
    queryType: string
  ): Promise<IWeeklyTargetDocument> {
    try {
      console.log(`=== Creating/Updating Weekly Target ===`);
      console.log(`userId: ${userId}`);
      console.log(`startDate: ${startDate}`);
      console.log(`endDate: ${endDate}`);
      console.log(`queryType: ${queryType}`);
      console.log(`data:`, data);
      
      const weekData = DateUtils.getWeekDetails(startDate);
      console.log(`Week data:`, weekData);
      
      const defaultTarget: IWeeklyTarget = {
        userId,
        startDate: weekData.weekStart,
        endDate: weekData.weekEnd,
        year: weekData.year,
        weekNumber: weekData.weekNumber,
        appointmentRate: data?.appointmentRate ?? 0,
        avgJobSize: data.avgJobSize ?? 0,
        closeRate: data?.closeRate ?? 0,
        com: data.com ?? 0,
        revenue: data?.revenue ?? 0,
        showRate: data?.showRate ?? 0,
        queryType: queryType,
      };    

      console.log(`Default target:`, defaultTarget);

      // Try to find an existing target
      const existingTarget = await this.targetRepository.findTargetByStartDate(
        userId,
        startDate,
        queryType
      );
      
      console.log(`Existing target found:`, !!existingTarget);
        
      let target: IWeeklyTargetDocument | null;
      if (existingTarget) {
        // If target exists, update it with new data and queryType
        console.log(`Updating existing target`);
        target = await this.targetRepository.updateTarget({
          ...existingTarget.toObject(),
          ...data,
          queryType, // Update the queryType
        });
        console.log("Target updated successfully");
      } else {
        // If no target exists, create a new one
        console.log(`Creating new target`);
        target = await this.targetRepository.createTarget({
          ...defaultTarget,
          queryType,
        });
        console.log("Target created successfully");
      }

      if (!target) {
        console.error("Failed to update or create weekly target");
        throw new Error("Failed to update or create weekly target.");
      }
      
      console.log(`Final target:`, target);
      return target;
    } catch (error) {
      console.error('Error in upsertWeeklyTarget:', error);
      throw error;
    }
  }

  private async _upsertMonthlyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    data: Partial<IWeeklyTarget>,
    queryType: string
  ): Promise<IWeeklyTargetDocument | IWeeklyTargetDocument[]> {
    try {
      console.log(`=== Processing monthly target ===`);
      console.log(`userId: ${userId}`);
      console.log(`startDate: ${startDate}`);
      console.log(`endDate: ${endDate}`);
      console.log(`queryType: ${queryType}`);
      console.log(`data:`, data);
      
      const weeksInMonth = DateUtils.getMonthWeeks(startDate, endDate);
      console.log(`Weeks found: ${weeksInMonth.length}`);
      console.log('Weeks:', JSON.stringify(weeksInMonth, null, 2));
      
      if (weeksInMonth.length === 0) {
        console.log('No weeks found, returning empty aggregate');
        return this._aggregateTargets([], queryType, userId, startDate, endDate);
      }
      
      const monthlyProratedData: Partial<IWeeklyTarget> = {
        ...data,
        revenue: data.revenue ? data.revenue / weeksInMonth.length : 0,
        avgJobSize: data.avgJobSize ? data.avgJobSize : 0,
        appointmentRate: data.appointmentRate ? data.appointmentRate : 0,
        showRate: data.showRate ? data.showRate : 0,
        closeRate: data.closeRate ? data.closeRate : 0,
        com: data.com ? data.com : 0,
      };
      
      console.log(`Monthly prorated data:`, monthlyProratedData);
      
      const monthlyUpsertPromises = weeksInMonth.map((week, index) => {
        console.log(`Creating weekly target ${index + 1}: ${week.weekStart} to ${week.weekEnd}`);
        return this.upsertWeeklyTarget(
          userId,
          week.weekStart,
          week.weekEnd,
          monthlyProratedData,
          queryType
        );
      });
      
      const monthlyResults = await Promise.all(monthlyUpsertPromises);
      console.log(`Created ${monthlyResults.length} weekly targets`);
      
      // Always aggregate the results into a monthly summary
      console.log(`Aggregating ${monthlyResults.length} weekly targets into monthly summary`);
      return this._aggregateTargets(monthlyResults, queryType, userId, startDate, endDate);
    } catch (error) {
      console.error('Error in _upsertMonthlyTarget:', error);
      throw error;
    }
  }

  public async upsertTargetByPeriod(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: "weekly" | "monthly" | "yearly",
    data: Partial<IWeeklyTarget>
  ): Promise<IWeeklyTargetDocument | IWeeklyTargetDocument[]> {
    try {
      console.log(`=== upsertTargetByPeriod ===`);
      console.log(`userId: ${userId}`);
      console.log(`startDate: ${startDate}`);
      console.log(`endDate: ${endDate}`);
      console.log(`queryType: ${queryType}`);
      console.log(`data:`, data);
      
      switch (queryType) {
        case "weekly":
          console.log(`Processing as weekly target`);
          return this.upsertWeeklyTarget(userId, startDate, endDate, data, queryType);
          
        case "monthly":
          console.log(`Processing as monthly target`);
          return this._upsertMonthlyTarget(
            userId,
            startDate,
            endDate,
            data,
            queryType
          );
        case "yearly":
          console.log(`Processing as yearly target`);
          // For yearly, process as monthly but return all weekly targets
          return this._upsertMonthlyTarget(
            userId,
            startDate,
            endDate,
            data,
            queryType
          );
        default:
          throw new Error(`Invalid queryType: ${queryType}`);
      }
    } catch (error) {
      console.error(`Error in upsertTargetByPeriod:`, error);
      console.error(`Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
      throw error;
    }
  }

  public async getWeeklyTargetsInRange(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: string = "monthly"
  ): Promise<IWeeklyTargetDocument[]> {
    console.log(`=== Getting Weekly Targets In Range ===`);
    console.log(`userId: ${userId}`);
    console.log(`startDate: ${startDate}`);
    console.log(`endDate: ${endDate}`);
    console.log(`queryType: ${queryType}`);
    
    // Get all weeks in the specified date range
    const weeksInRange = DateUtils.getMonthWeeks(startDate, endDate);
    console.log(`Weeks in range: ${weeksInRange.length}`);
    console.log('Weeks:', weeksInRange);
    
    if (weeksInRange.length === 0) {
      console.log('No weeks found in the specified range');
      return [];
    }
    
    // Get weekly targets for each week in the range
    const weeklyTargets = await Promise.all(
      weeksInRange.map(week => 
        this.getWeeklyTarget(userId, week.weekStart, week.weekEnd, queryType)
      )
    );
    
    console.log(`Found ${weeklyTargets.length} weekly targets`);
    
    // Filter targets by queryType
    const filteredTargets = weeklyTargets.filter(target => 
      !queryType || target.queryType === queryType
    );
    
    console.log(`Filtered to ${filteredTargets.length} targets with queryType: ${queryType}`);
    
    return filteredTargets;
  }

  public async getWeeklyTarget(
    userId: string,
    startDate: string,
    endDate?: string,
    queryType: string = "monthly"
  ): Promise<IWeeklyTargetDocument> {
    console.log(`=== Getting Weekly Target ===`);
    console.log(`userId: ${userId}`);
    console.log(`startDate: ${startDate}`);
    console.log(`queryType: ${queryType}`);
    
    const weekInfo = DateUtils.getWeekDetails(startDate);
    console.log(`Week info:`, weekInfo);
    
    // First try to find target with the specified queryType
    let target = await this.targetRepository.findTargetByStartDate(
      userId,
      weekInfo.weekStart,
      queryType
    );
    
    // If not found and queryType is "yearly", also try to find with "monthly" queryType
    if (!target && queryType === "yearly") {
      console.log(`Target not found with queryType "yearly", trying "monthly"`);
      target = await this.targetRepository.findTargetByStartDate(
        userId,
        weekInfo.weekStart,
        "monthly"
      );
    }
    
    console.log(`Target found:`, !!target);
    
    if (!target) {
      // Return an object with 0 values if no target is found
      const defaultTarget = {
        userId,
        startDate: weekInfo.weekStart,
        endDate: weekInfo.weekEnd,
        appointmentRate: 0,
        avgJobSize: 0,
        closeRate: 0,
        com: 0,
        revenue: 0,
        showRate: 0,
        queryType: queryType,
        year: weekInfo.year,
        weekNumber: weekInfo.weekNumber,
      } as unknown as IWeeklyTargetDocument;
      
      console.log(`Returning default target:`, defaultTarget);
      return defaultTarget;
    }
    
    console.log(`Returning found target:`, target);
    return target;
  }

  public async getAggregatedMonthlyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: string
  ): Promise<IWeeklyTargetDocument[]> {
    console.log(`=== Getting Monthly Targets ===`);
    console.log(`userId: ${userId}`);
    console.log(`startDate: ${startDate}`);
    console.log(`endDate: ${endDate}`);
    console.log(`queryType: ${queryType}`);
    
    const weeksInMonth = DateUtils.getMonthWeeks(startDate, endDate);
    console.log(`Weeks in month: ${weeksInMonth.length}`);
    
    if (weeksInMonth.length === 0) {
      console.log('No weeks found in the month');
      return [];
    }

    // Use getWeeklyTarget and pass the queryType parameter
    const weeklyTargets = await Promise.all(
      weeksInMonth.map(week =>
        this.getWeeklyTarget(userId, week.weekStart, week.weekEnd, queryType)
      )
    );
    
    console.log(`Found ${weeklyTargets.length} weekly targets`);
    
    // Filter targets by queryType
    const filteredTargets = weeklyTargets.filter(target => 
      !queryType || target.queryType === queryType
    );
    
    console.log(`Filtered to ${filteredTargets.length} targets with queryType: ${queryType}`);
    
    if (filteredTargets.length === 0) {
      console.log('No targets found with the specified queryType');
      // Return a zero-filled monthly summary
      return [this._aggregateTargets([], queryType, userId, startDate, endDate)];
    }
    
    // Aggregate all weekly targets into a monthly summary
    const monthlySummary = this._aggregateTargets(filteredTargets, queryType, userId, startDate, endDate);
    
    console.log(`Returning monthly summary:`, monthlySummary);
    return [monthlySummary];
  }

  public async getAggregatedYearlyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: string
  ): Promise<IWeeklyTargetDocument[]> {
    console.log(`=== Getting Yearly Targets ===`);
    console.log(`userId: ${userId}`);
    console.log(`startDate: ${startDate}`);
    console.log(`endDate: ${endDate}`);
    console.log(`queryType: ${queryType}`);
    
    // Parse the provided date range
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    // Get all weeks in the specified date range
    const weeksInRange = DateUtils.getMonthWeeks(startDate, endDate);
    console.log(`Weeks in range: ${weeksInRange.length}`);
    console.log('Weeks:', weeksInRange);
    
    if (weeksInRange.length === 0) {
      console.log('No weeks found in the specified range');
      return [];
    }
    
    // Get weekly targets for each week in the range
    const weeklyTargets = await Promise.all(
      weeksInRange.map(week => 
        this.getWeeklyTarget(userId, week.weekStart, week.weekEnd, queryType)
      )
    );
    
    console.log(`Found ${weeklyTargets.length} weekly targets`);
    
    // Filter out targets that don't match the queryType (if specified)
    const filteredTargets = weeklyTargets.filter(target => 
      !queryType || target.queryType === queryType
    );
    
    console.log(`Filtered to ${filteredTargets.length} targets with queryType: ${queryType}`);
    
    // Group weekly targets by month and aggregate them
    const monthlyGroups = new Map<string, IWeeklyTargetDocument[]>();
    
    for (const target of filteredTargets) {
      const targetDate = new Date(target.startDate);
      const monthKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyGroups.has(monthKey)) {
        monthlyGroups.set(monthKey, []);
      }
      monthlyGroups.get(monthKey)!.push(target);
    }
    
    // Aggregate each month's weekly targets into monthly summaries
    const monthlyResults: IWeeklyTargetDocument[] = [];
    
    for (const [monthKey, weekTargets] of monthlyGroups) {
      if (weekTargets.length > 0) {
        const year = parseInt(monthKey.split('-')[0]);
        const month = parseInt(monthKey.split('-')[1]) - 1; // Month is 0-indexed
        
        // Calculate month start and end dates
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        
        const monthlySummary = this._aggregateTargets(
          weekTargets, 
          queryType, 
          userId, 
          monthStart.toISOString().split('T')[0],
          monthEnd.toISOString().split('T')[0]
        );
        
        monthlyResults.push(monthlySummary);
      }
    }
    
    // Sort by date
    monthlyResults.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    
    console.log(`Returning ${monthlyResults.length} monthly summaries`);
    return monthlyResults;
  }
}