export interface DashboardBucket {
  start_date: string;
  reading_time: number;
  audiovisual_time: number;
}

/** Durations and daily average are in seconds; dates are UTC. */
export interface DashboardStatistics {
  total_immersion_time: number;
  current_streak: number;
  reading_time: number;
  audiovisual_time: number;
  average_time: number;
  breakdown: DashboardBucket[];
}
