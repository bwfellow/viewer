import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check alerts every 5 minutes
crons.interval(
  "check alerts",
  { minutes: 5 },
  internal.alerts.checkAlerts,
  {}
);

// Cleanup old logs every 6 hours (using differential retention: 72h for normal logs, 2 weeks for errors)
crons.interval(
  "cleanup old logs",
  { hours: 6 },
  internal.logs.cleanupOldLogs,
  {}
);

// Aggregate metrics every hour at 5 minutes past the hour
crons.interval(
  "aggregate hourly metrics",
  { hours: 1 },
  internal.metrics.aggregateHourlyMetrics,
  {}
);

// Cleanup old metrics once per day (every 24 hours)
crons.interval(
  "cleanup old metrics",
  { hours: 24 },
  internal.metrics.cleanupOldMetrics,
  { retentionDays: 90 }
);

export default crons;
