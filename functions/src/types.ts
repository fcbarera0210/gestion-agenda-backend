export interface BreakPeriod {
  start: string;
  end: string;
}

export interface DaySchedule {
  isActive: boolean;
  workHours: {
    start: string;
    end: string;
  };
  breaks?: BreakPeriod[];
}

export interface Professional {
  workSchedule?: Record<string, DaySchedule>;
}

export interface Service {
  duration: number;
}
