export interface IMonthlyTarget {
    month: number;
    leads: number;
    revenue: number;
    avgJobSize: number;
  }
  
  export interface ITarget {
    year: number;
    appointmentRate: number;
    showRate: number;
    closeRate: number;
    monthly: IMonthlyTarget[];
    adSpendBudget: number;
    costPerLead: number;
    costPerEstimateSet: number;
    costPerJobBooked: number;
  }

export interface IWeeklyTarget {
  userId: string;
  startDate: Date;
  endDate: Date;
  year: number;
  weekNumber: number;
  leads: number;
  revenue: number;
  avgJobSize: number;
  appointmentRate: number;
  showRate: number;
  closeRate: number;
  adSpendBudget: number;
  costPerLead: number;
  costPerEstimateSet: number;
  costPerJobBooked: number;
}

export interface ITargetQuery {
  userId: string;
  startDate: Date;
  endDate: Date;
}