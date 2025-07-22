import {
  startOfWeek,
  endOfWeek,
  getISOWeek,
  startOfMonth,
  endOfMonth,
  eachWeekOfInterval,
  isSameMonth,
  addDays,
} from "date-fns";

export interface IWeekInfo {
  year: number;
  weekNumber: number;
  startDate: Date;
  endDate: Date;
}

type WeekRange = {
  year: number;
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
};

export class DateUtils {
  static getWeekDetails(dateStr: string): WeekRange {
    const inputDate = new Date(dateStr);

    // Move to Monday of that week
    const monday = new Date(inputDate);
    const day = inputDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const diffToMonday = (day + 6) % 7;
    monday.setDate(inputDate.getDate() - diffToMonday);

    // Calculate week start and end
    const weekStart = new Date(monday);
    const weekEnd = new Date(monday);
    weekEnd.setDate(weekStart.getDate() + 6);

    return {
      year: weekStart.getFullYear(),
      weekNumber: this.getISOWeekNumber(weekStart),
      weekStart: weekStart.toISOString().split("T")[0],
      weekEnd: weekEnd.toISOString().split("T")[0],
    };
  }

  static getISOWeekNumber(date: Date): number {
    const temp = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    );
    const day = temp.getUTCDay() || 7; // Make Sunday (0) become 7
    temp.setUTCDate(temp.getUTCDate() + 4 - day); // nearest Thursday
    const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((+temp - +yearStart) / 86400000 + 1) / 7);
    return weekNo;
  }

  static getMonthWeeks(startDateStr: string, endDateStr: string): WeekRange[] {
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    const targetMonth = startDate.getMonth() + 1; // 1-12

    const current = new Date(startDate);
    current.setDate(current.getDate() - ((current.getDay() + 6) % 7)); // move to Monday

    const result: WeekRange[] = [];

    while (current <= endDate) {
      let daysInTargetMonth = 0;
      const weekDates: Date[] = [];

      for (let i = 0; i < 7; i++) {
        const day = new Date(current);
        day.setDate(current.getDate() + i);
        weekDates.push(day);

        if (day.getMonth() + 1 === targetMonth) {
          daysInTargetMonth++;
        }
      }

      if (daysInTargetMonth >= 4) {
        const weekStart = weekDates[0];
        const weekEnd = weekDates[6];

        result.push({
          year: weekStart.getFullYear(),
          weekNumber: this.getISOWeekNumber(weekStart),
          weekStart: weekStart.toISOString().split("T")[0],
          weekEnd: weekEnd.toISOString().split("T")[0],
        });
      }

      current.setDate(current.getDate() + 7); // move to next Monday
    }

    return result;
  }

  static getYearWeeks(year: number): WeekRange[] {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    return this.getMonthWeeks(start.toISOString(), end.toISOString());
  }
}
