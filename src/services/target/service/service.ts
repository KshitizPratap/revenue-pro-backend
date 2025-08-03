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

  private validateQueryTypeChange(existingQueryType: string, newQueryType: string): boolean {
    console.log(`Validating query type change: ${existingQueryType} → ${newQueryType}`);
    
    // Allowed changes
    const allowedChanges: Record<string, string[]> = {
      'weekly': ['monthly', 'yearly'],
      'monthly': ['yearly'],
      'yearly': [] // No changes allowed from yearly
    };
    
    const allowedTargets = allowedChanges[existingQueryType] || [];
    const isAllowed = allowedTargets.includes(newQueryType);
    
    console.log(`Allowed targets for ${existingQueryType}:`, allowedTargets);
    console.log(`Change ${existingQueryType} → ${newQueryType} is ${isAllowed ? 'ALLOWED' : 'NOT ALLOWED'}`);
    
    return isAllowed;
  }

  private isDateInPastOrCurrent(targetDate: string, queryType: "weekly" | "monthly" | "yearly"): boolean {
    const now = new Date();
    const target = new Date(targetDate);
    
    switch (queryType) {
      case "weekly":
        // For weekly, check if the week has already started
        const weekStart = new Date(target);
        weekStart.setDate(target.getDate() - target.getDay() + 1); // Monday of the week
        return weekStart <= now;
        
      case "monthly":
        // For monthly, check if the month has already started
        const monthStart = new Date(target.getFullYear(), target.getMonth(), 1);
        return monthStart <= now;
        
      case "yearly":
        // For yearly, check if the year has already started
        const yearStart = new Date(target.getFullYear(), 0, 1);
        return yearStart <= now;
        
      default:
        return false;
    }
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

      // Check if the target date is in the past or current period
      if (this.isDateInPastOrCurrent(startDate, queryType as "weekly" | "monthly" | "yearly")) {
        throw new Error(`Cannot modify targets for past or current ${queryType} periods. Target date: ${startDate}`);
      }

      // Try to find an existing target
      const existingTarget = await this.targetRepository.findTargetByStartDate(
        userId,
        startDate,
        queryType
      );
      
      console.log(`Existing target found:`, !!existingTarget);
        
      let target: IWeeklyTargetDocument | null;
      if (existingTarget) {
        // Validate query type change if existing target has different queryType
        if (existingTarget.queryType !== queryType) {
          const isChangeAllowed = this.validateQueryTypeChange(existingTarget.queryType, queryType);
          if (!isChangeAllowed) {
            throw new Error(`Query type change from '${existingTarget.queryType}' to '${queryType}' is not allowed.`);
          }
        }
        
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
      
      // Check if the target date is in the past or current period
      if (this.isDateInPastOrCurrent(startDate, "monthly")) {
        console.log(`Target month is current or previous. Returning existing data without changes.`);
        
        // Get existing targets for this month
        const existingTargets = await this.getWeeklyTargetsInRange(userId, startDate, endDate, queryType);
        
        if (existingTargets.length > 0) {
          console.log(`Found ${existingTargets.length} existing targets for current/previous month`);
          // Return array of existing weekly targets
          return existingTargets;
        } else {
          console.log(`No existing targets found for current/previous month`);
          // Return empty array for current/previous month with no existing data
          return [];
        }
      }
      
      // For future months, proceed with the normal logic
      console.log(`Target month is future. Proceeding with week conversion.`);
      
      const weeksInMonth = DateUtils.getMonthWeeks(startDate, endDate);
      console.log(`Weeks found: ${weeksInMonth.length}`);
      console.log('Weeks:', JSON.stringify(weeksInMonth, null, 2));
      
      if (weeksInMonth.length === 0) {
        console.log('No weeks found, returning empty array');
        return [];
      }
      
      // Preserve the overall monthly revenue by distributing it equally across weeks
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
      
      // Return the array of weekly targets instead of aggregated monthly summary
      console.log(`Returning array of ${monthlyResults.length} weekly targets`);
      return monthlyResults;
    } catch (error) {
      console.error('Error in _upsertMonthlyTarget:', error);
      throw error;
    }
  }

  private async _upsertYearlyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    data: Partial<IWeeklyTarget>,
    queryType: string
  ): Promise<IWeeklyTargetDocument[][]> {
    try {
      console.log(`=== Processing yearly target ===`);
      console.log(`userId: ${userId}`);
      console.log(`startDate: ${startDate}`);
      console.log(`endDate: ${endDate}`);
      console.log(`queryType: ${queryType}`);
      console.log(`data:`, data);
      
      const year = new Date(startDate).getFullYear();
      const currentDate = new Date();
      const currentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      
      console.log(`Year: ${year}`);
      console.log(`Current month: ${currentMonth.toISOString()}`);
      console.log(`Yearly revenue: ${data.revenue}`);
      
      // Check if the target year is in the past or current
      if (this.isDateInPastOrCurrent(startDate, "yearly")) {
        console.log(`Target year is current or previous. Returning existing data without changes.`);
        
        // Get existing targets for this year
        const existingTargets = await this.getWeeklyTargetsInRange(userId, startDate, endDate, queryType);
        
        if (existingTargets.length > 0) {
          console.log(`Found ${existingTargets.length} existing targets for current/previous year`);
          // Return array of arrays (organized by months) of existing weekly targets
          const monthlyTargets: IWeeklyTargetDocument[][] = [];
          const targetsByMonth = new Map<string, IWeeklyTargetDocument[]>();
          
          for (const target of existingTargets) {
            const monthKey = new Date(target.startDate).getFullYear() + '-' + (new Date(target.startDate).getMonth() + 1);
            if (!targetsByMonth.has(monthKey)) {
              targetsByMonth.set(monthKey, []);
            }
            targetsByMonth.get(monthKey)!.push(target);
          }
          
          for (let month = 0; month < 12; month++) {
            const monthKey = year + '-' + (month + 1);
            monthlyTargets.push(targetsByMonth.get(monthKey) || []);
          }
          
          return monthlyTargets;
        } else {
          console.log(`No existing targets found for current/previous year`);
          // Return empty array of arrays for current/previous year with no existing data
          return Array(12).fill([]);
        }
      }
      
      // First pass: Calculate total revenue of current and previous months
      let totalCurrentPreviousRevenue = 0;
      const currentPreviousTargets: IWeeklyTargetDocument[] = [];
      
      for (let month = 0; month < 12; month++) {
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        
        // Check if this month is current or previous
        if (monthStart <= currentMonth) {
          console.log(`Calculating revenue for current/previous month ${month + 1}`);
          
          // Get existing targets for this month
          const existingTargets = await this.getWeeklyTargetsInRange(
            userId, 
            monthStart.toISOString().split('T')[0], 
            monthEnd.toISOString().split('T')[0], 
            queryType
          );
          
          if (existingTargets.length > 0) {
            console.log(`Found ${existingTargets.length} existing targets for month ${month + 1}`);
            // Sum up the revenue for this month
            const monthRevenue = existingTargets.reduce((sum, target) => sum + (target.revenue || 0), 0);
            totalCurrentPreviousRevenue += monthRevenue;
            console.log(`Month ${month + 1} revenue: ${monthRevenue}`);
            currentPreviousTargets.push(...existingTargets);
          } else {
            console.log(`No existing targets found for month ${month + 1}`);
            // Create zero-filled weekly targets for current/previous months
            const weeksInMonth = DateUtils.getMonthWeeks(
              monthStart.toISOString().split('T')[0], 
              monthEnd.toISOString().split('T')[0]
            );
            
            for (const week of weeksInMonth) {
              const zeroFilledTarget = await this.upsertWeeklyTarget(
                userId,
                week.weekStart,
                week.weekEnd,
                {
                  ...data,
                  revenue: 0, // Zero revenue for current/previous months
                  avgJobSize: data.avgJobSize || 0,
                  appointmentRate: data.appointmentRate || 0,
                  showRate: data.showRate || 0,
                  closeRate: data.closeRate || 0,
                  com: data.com || 0,
                },
                queryType
              );
              currentPreviousTargets.push(zeroFilledTarget);
            }
          }
        }
      }
      
      console.log(`Total current/previous months revenue: ${totalCurrentPreviousRevenue}`);
      
      // Calculate remaining revenue for future months
      const remainingRevenue = (data.revenue || 0) - totalCurrentPreviousRevenue;
      console.log(`Remaining revenue for future months: ${remainingRevenue}`);
      
      // Count future months and their total weeks
      let futureMonthsCount = 0;
      let totalFutureWeeks = 0;
      
      for (let month = 0; month < 12; month++) {
        const monthStart = new Date(year, month, 1);
        if (monthStart > currentMonth) {
          futureMonthsCount++;
          const monthEnd = new Date(year, month + 1, 0);
          const weeksInMonth = DateUtils.getMonthWeeks(
            monthStart.toISOString().split('T')[0], 
            monthEnd.toISOString().split('T')[0]
          );
          totalFutureWeeks += weeksInMonth.length;
        }
      }
      
      console.log(`Future months count: ${futureMonthsCount}`);
      console.log(`Total future weeks: ${totalFutureWeeks}`);
      
      // Calculate revenue per week for future months
      const revenuePerWeek = totalFutureWeeks > 0 ? remainingRevenue / totalFutureWeeks : 0;
      console.log(`Revenue per week for future months: ${revenuePerWeek}`);
      
      // Create array of arrays - one array per month
      const monthlyTargets: IWeeklyTargetDocument[][] = [];
      
      // Second pass: Process all months and organize by month
      for (let month = 0; month < 12; month++) {
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        const monthTargets: IWeeklyTargetDocument[] = [];
        
        if (monthStart <= currentMonth) {
          // Current/previous month: get existing targets
          const existingTargets = await this.getWeeklyTargetsInRange(
            userId, 
            monthStart.toISOString().split('T')[0], 
            monthEnd.toISOString().split('T')[0], 
            queryType
          );
          
          if (existingTargets.length > 0) {
            monthTargets.push(...existingTargets);
          } else {
            // Create zero-filled weekly targets for current/previous months
            const weeksInMonth = DateUtils.getMonthWeeks(
              monthStart.toISOString().split('T')[0], 
              monthEnd.toISOString().split('T')[0]
            );
            
            for (const week of weeksInMonth) {
              const zeroFilledTarget = await this.upsertWeeklyTarget(
                userId,
                week.weekStart,
                week.weekEnd,
                {
                  ...data,
                  revenue: 0, // Zero revenue for current/previous months
                  avgJobSize: data.avgJobSize || 0,
                  appointmentRate: data.appointmentRate || 0,
                  showRate: data.showRate || 0,
                  closeRate: data.closeRate || 0,
                  com: data.com || 0,
                },
                queryType
              );
              monthTargets.push(zeroFilledTarget);
            }
          }
        } else {
          // Future month: create weekly targets with calculated revenue
          console.log(`Processing future month ${month + 1}: ${monthStart.toISOString()} to ${monthEnd.toISOString()}`);
          
          const weeksInMonth = DateUtils.getMonthWeeks(
            monthStart.toISOString().split('T')[0], 
            monthEnd.toISOString().split('T')[0]
          );
          
          console.log(`Month ${month + 1} has ${weeksInMonth.length} weeks`);
          
          if (weeksInMonth.length > 0) {
            const monthlyData: Partial<IWeeklyTarget> = {
              ...data,
              revenue: revenuePerWeek,
              avgJobSize: data.avgJobSize || 0,
              appointmentRate: data.appointmentRate || 0,
              showRate: data.showRate || 0,
              closeRate: data.closeRate || 0,
              com: data.com || 0,
            };
            
            console.log(`Monthly data for future month ${month + 1}:`, monthlyData);
            
            // Create weekly targets for this month
            for (const week of weeksInMonth) {
              console.log(`Creating weekly target for week: ${week.weekStart} to ${week.weekEnd}`);
              const weeklyTarget = await this.upsertWeeklyTarget(
                userId,
                week.weekStart,
                week.weekEnd,
                monthlyData,
                queryType
              );
              monthTargets.push(weeklyTarget);
            }
          }
        }
        
        monthlyTargets.push(monthTargets);
      }
      
      console.log(`Total monthly arrays created: ${monthlyTargets.length}`);
      return monthlyTargets;
    } catch (error) {
      console.error('Error in _upsertYearlyTarget:', error);
      throw error;
    }
  }

  public async upsertTargetByPeriod(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: "weekly" | "monthly" | "yearly",
    data: Partial<IWeeklyTarget>
  ): Promise<IWeeklyTargetDocument | IWeeklyTargetDocument[] | IWeeklyTargetDocument[][]> {
    try {
      console.log(`=== upsertTargetByPeriod ===`);
      console.log(`userId: ${userId}`);
      console.log(`startDate: ${startDate}`);
      console.log(`endDate: ${endDate}`);
      console.log(`queryType: ${queryType}`);
      console.log(`data:`, data);
      
      // Check for existing targets and validate query type changes
      if (queryType === "weekly") {
        // For weekly, check the specific week
        const existingTarget = await this.targetRepository.findTargetByStartDate(
          userId,
          startDate,
          queryType
        );
        if (existingTarget && existingTarget.queryType !== queryType) {
          const isChangeAllowed = this.validateQueryTypeChange(existingTarget.queryType, queryType);
          if (!isChangeAllowed) {
            throw new Error(`Query type change from '${existingTarget.queryType}' to '${queryType}' is not allowed.`);
          }
        }
      } else if (queryType === "monthly" || queryType === "yearly") {
        // For monthly/yearly, check if any existing targets in the range have different queryType
        const existingTargets = await this.getWeeklyTargetsInRange(userId, startDate, endDate, "any");
        const differentQueryTypes = existingTargets.filter(target => target.queryType !== queryType);
        
        if (differentQueryTypes.length > 0) {
          // Check if any of the existing query types don't allow change to new query type
          for (const target of differentQueryTypes) {
            const isChangeAllowed = this.validateQueryTypeChange(target.queryType, queryType);
            if (!isChangeAllowed) {
              throw new Error(`Query type change from '${target.queryType}' to '${queryType}' is not allowed for existing targets.`);
            }
          }
        }
      }
      
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
          return this._upsertYearlyTarget(
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
    queryType: string = "monthly",
    originalQueryType?: string
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
        this.getWeeklyTarget(userId, week.weekStart, week.weekEnd, queryType === "any" ? "any" : queryType, originalQueryType)
      )
    );
    
    console.log(`Found ${weeklyTargets.length} weekly targets`);
    
    // Filter targets by queryType (unless queryType is "any")
    const filteredTargets = queryType === "any" 
      ? weeklyTargets 
      : weeklyTargets.filter(target => target.queryType === queryType);
    
    console.log(`Filtered to ${filteredTargets.length} targets with queryType: ${queryType}`);
    
    return filteredTargets;
  }

  public async getWeeklyTarget(
    userId: string,
    startDate: string,
    endDate?: string,
    queryType: string = "monthly",
    originalQueryType?: string
  ): Promise<IWeeklyTargetDocument> {
    console.log(`=== Getting Weekly Target ===`);
    console.log(`userId: ${userId}`);
    console.log(`startDate: ${startDate}`);
    console.log(`queryType: ${queryType}`);
    
    const weekInfo = DateUtils.getWeekDetails(startDate);
    console.log(`Week info:`, weekInfo);
    
    let target = null;
    
    if (queryType === "any") {
      // For "any" queryType, try to find target with any queryType
      console.log(`Looking for target with any queryType`);
      target = await this.targetRepository.findTargetByStartDate(
        userId,
        weekInfo.weekStart,
        "yearly"
      );
      
      if (!target) {
        target = await this.targetRepository.findTargetByStartDate(
          userId,
          weekInfo.weekStart,
          "monthly"
        );
      }
      
      if (!target) {
        target = await this.targetRepository.findTargetByStartDate(
          userId,
          weekInfo.weekStart,
          "weekly"
        );
      }
    } else {
      // First try to find target with the specified queryType
      target = await this.targetRepository.findTargetByStartDate(
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
        queryType: queryType === "any" ? "yearly" : queryType,
        year: weekInfo.year,
        weekNumber: weekInfo.weekNumber,
      } as unknown as IWeeklyTargetDocument;
      
      console.log(`Returning default target:`, defaultTarget);
      return defaultTarget;
    }
    
    // If queryType is "any", we should only return targets that match the original requested queryType
    if (queryType === "any" && originalQueryType) {
      // Only return the target if it matches the original requested queryType
      if (target.queryType === originalQueryType) {
        console.log(`Returning found target matching original queryType:`, target);
        return target;
      } else {
        // Return a default target with 0 values to indicate no matching target found
        console.log(`Target found but queryType doesn't match. Expected: ${originalQueryType}, Found: ${target.queryType}`);
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
          queryType: originalQueryType,
          year: weekInfo.year,
          weekNumber: weekInfo.weekNumber,
        } as unknown as IWeeklyTargetDocument;
        
        console.log(`Returning default target for non-matching queryType:`, defaultTarget);
        return defaultTarget;
      }
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

  public async getYearlyTargetsOrganizedByMonths(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: string
  ): Promise<IWeeklyTargetDocument[][]> {
    console.log(`=== Getting Yearly Targets Organized By Months ===`);
    console.log(`userId: ${userId}`);
    console.log(`startDate: ${startDate}`);
    console.log(`endDate: ${endDate}`);
    console.log(`queryType: ${queryType}`);
    
    // Parse start and end dates
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    // Get the first day of start month and last day of end month
    const startMonthFirstDay = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), 1);
    const endMonthLastDay = new Date(endDateObj.getFullYear(), endDateObj.getMonth() + 1, 0);
    
    console.log(`Start month first day: ${startMonthFirstDay.toISOString().split('T')[0]}`);
    console.log(`End month last day: ${endMonthLastDay.toISOString().split('T')[0]}`);
    
    // Get all weekly targets in the extended date range (to capture full weeks)
    // Use "any" to get all targets regardless of their stored queryType
    const allWeeklyTargets = await this.getWeeklyTargetsInRange(
      userId,
      startMonthFirstDay.toISOString().split('T')[0],
      endMonthLastDay.toISOString().split('T')[0],
      "any",
      queryType // Pass the original requested queryType
    );
    
    console.log(`Found ${allWeeklyTargets.length} weekly targets in extended range`);
    
    // Filter targets based on month boundaries
    const filteredTargets: IWeeklyTargetDocument[] = [];
    
    for (const target of allWeeklyTargets) {
      const targetStartDate = new Date(target.startDate);
      const targetEndDate = new Date(target.endDate);
      
      // For start month: only include weeks that start within the start month
      if (targetStartDate.getFullYear() === startDateObj.getFullYear() && 
          targetStartDate.getMonth() === startDateObj.getMonth()) {
        filteredTargets.push(target);
        console.log(`Including target for start month: ${target.startDate} to ${target.endDate}`);
      }
      // For end month: include weeks that start within the end month
      else if (targetStartDate.getFullYear() === endDateObj.getFullYear() && 
               targetStartDate.getMonth() === endDateObj.getMonth()) {
        filteredTargets.push(target);
        console.log(`Including target for end month: ${target.startDate} to ${target.endDate}`);
      }
      // For months in between: include all weeks
      else if (targetStartDate > startMonthFirstDay && targetStartDate < endMonthLastDay) {
        filteredTargets.push(target);
        console.log(`Including target for middle month: ${target.startDate} to ${target.endDate}`);
      }
    }
    
    console.log(`Filtered to ${filteredTargets.length} targets respecting month boundaries`);
    
    // Group weekly targets by month
    const monthlyGroups = new Map<string, IWeeklyTargetDocument[]>();
    
    for (const target of filteredTargets) {
      const targetDate = new Date(target.startDate);
      const monthKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyGroups.has(monthKey)) {
        monthlyGroups.set(monthKey, []);
      }
      monthlyGroups.get(monthKey)!.push(target);
    }
    
    // Convert to array of arrays, sorted by month
    const monthlyTargets: IWeeklyTargetDocument[][] = [];
    const sortedMonthKeys = Array.from(monthlyGroups.keys()).sort();
    
    for (const monthKey of sortedMonthKeys) {
      const weekTargets = monthlyGroups.get(monthKey)!;
      // Sort weekly targets by start date within each month
      weekTargets.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      monthlyTargets.push(weekTargets);
    }
    
    console.log(`Organized into ${monthlyTargets.length} months`);
    return monthlyTargets;
  }

  public async debugTargetsInDatabase(userId: string): Promise<IWeeklyTargetDocument[]> {
    console.log(`=== Service: debugTargetsInDatabase ===`);
    console.log(`Getting all targets for userId: ${userId}`);
    
    return this.targetRepository.debugAllTargetsForUser(userId);
  }
}