import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check alerts every 5 minutes
crons.interval(
  "check alerts",
  { minutes: 5 },
  internal.alerts.checkAlerts,
);

// Cleanup old logs daily at 2 AM
crons.daily(
  "cleanup old logs",
  { hourUTC: 2, minuteUTC: 0 },
  internal.logs.cleanupOldLogs,
  { retentionDays: 30 }
);

// Aggregate metrics every hour at 5 minutes past the hour
crons.hourly(
  "aggregate hourly metrics",
  { minuteUTC: 5 },
  internal.metrics.aggregateHourlyMetrics,
  {}
);

// Cleanup old metrics weekly at 3 AM on Sunday
crons.weekly(
  "cleanup old metrics",
  { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
  internal.metrics.cleanupOldMetrics,
  { retentionDays: 90 }
);

export default crons;
