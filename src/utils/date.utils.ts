export interface IWeekInfo {
  year: number;
  weekNumber: number;
  startDate: Date;
  endDate: Date;
}

export class DateUtils {
  static getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Gets the week information for a given date
   * Week starts from Monday and ends on Sunday
   */
  static getWeekInfo(date: Date): IWeekInfo {
    const year = date.getFullYear();
    const weekNumber = this.getWeekNumber(date);
    
    // Get week start (Monday) and end (Sunday)
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    
    const startDate = new Date(date);
    startDate.setDate(diff);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    return {
      year,
      weekNumber,
      startDate,
      endDate
    };
  }

  /**
   * Gets the next week information
   */
  static getNextWeekInfo(currentWeekInfo: IWeekInfo): IWeekInfo {
    const nextMonday = new Date(currentWeekInfo.startDate);
    nextMonday.setDate(nextMonday.getDate() + 7);
    return this.getWeekInfo(nextMonday);
  }

  /**
   * Gets the previous week information
   */
  static getPreviousWeekInfo(currentWeekInfo: IWeekInfo): IWeekInfo {
    const previousMonday = new Date(currentWeekInfo.startDate);
    previousMonday.setDate(previousMonday.getDate() - 7);
    return this.getWeekInfo(previousMonday);
  }

  static getMonthStartEnd(year: number, month: number) {
    const startDate = new Date(year, month - 1, 1); // month is 1-based
    const endDate = new Date(year, month, 0); // Last day of the month
    return { startDate, endDate };
  }
} 