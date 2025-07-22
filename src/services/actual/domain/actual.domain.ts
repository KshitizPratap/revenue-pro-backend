export interface IMonthlyActual {
  month: number;
  testingBudgetSpent: number;
  awarenessBrandingBudgetSpent: number;
  leadGenerationBudgetSpent: number;
  revenue: number;
  jobsBooked: number;
  estimatesRan: number;
  estimatesSet: number;
}

export interface IActual {
  year: number;
  monthly: IMonthlyActual[];
  totalTestingBudget: number;
  totalBrandingBudget: number;
  totalLeadGenBudget: number;
  totalRevenue: number;
  totalJobsBooked: number;
  totalEstimatesRan: number;
  totalEstimatesSet: number;
}

export interface IWeeklyActual {
  userId: string;
  startDate: string;
  endDate: string;
  testingBudgetSpent: number;
  awarenessBrandingBudgetSpent: number;
  leadGenerationBudgetSpent: number;
  revenue: number;
  jobsBooked: number;
  estimatesRan: number;
  estimatesSet: number;
}

export interface IActualQuery {
  userId: string;
  startDate: Date;
  endDate: Date;
}


export interface IWeeklyActualDocument extends IWeeklyActual, Document {}