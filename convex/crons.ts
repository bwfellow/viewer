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
  { retentionDays: 30, batchSize: 1000 }
);

export default crons;
