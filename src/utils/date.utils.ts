import {
  startOfWeek,
  endOfWeek,
  getISOWeek,
  parseISO,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  eachWeekOfInterval,
  getDay,
} from "date-fns";

export interface IWeekInfo {
  year: number;
  weekNumber: number;
  startDate: Date;
  endDate: Date;
}

export class DateUtils {
  /**
   * Gets the week information for a given date
   * Week starts from Monday and ends on Sunday
   */
  static getWeekInfo(date: Date): IWeekInfo {
    const start = startOfWeek(date, { weekStartsOn: 1 }); // Monday
    const end = endOfWeek(date, { weekStartsOn: 1 }); // Sunday

    return {
      year: start.getFullYear(),
      weekNumber: getISOWeek(start),
      startDate: start,
      endDate: end,
    };
  }

  /**
   * Gets the weeks that belong to a given month based on the majority-day rule.
   * A week belongs to the month that contains the majority of its days (4 or more).
   */
  static getWeeksInMonth(year: number, month: number): IWeekInfo[] {
    const firstDayOfMonth = startOfMonth(new Date(year, month - 1, 1));
    const lastDayOfMonth = endOfMonth(firstDayOfMonth);

    const weeks = eachWeekOfInterval(
      {
        start: startOfWeek(firstDayOfMonth, { weekStartsOn: 1 }),
        end: endOfWeek(lastDayOfMonth, { weekStartsOn: 1 }),
      },
      { weekStartsOn: 1 }
    );

    const result: IWeekInfo[] = [];
    for (const weekStart of weeks) {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      let daysInMonth = 0;
      for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);
        if (isSameMonth(day, firstDayOfMonth)) {
          daysInMonth++;
        }
      }

      if (daysInMonth >= 4) {
        result.push(DateUtils.getWeekInfo(weekStart));
      }
    }
    return result;
  }
} 