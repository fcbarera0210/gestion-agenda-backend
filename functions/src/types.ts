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
  slotStep?: number;
}

export interface Service {
  duration: number;
  slotStep?: number;
}
