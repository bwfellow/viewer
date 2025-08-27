import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  apps: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    apiKey: v.string(), // unique API key for each app
    isActive: v.boolean(),
    createdBy: v.id("users"),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    flags: v.optional(v.array(v.object({
      pattern: v.string(), // e.g. "query interactions:list success"
      name: v.string(),    // display name for the flag
      isActive: v.boolean(),
      createdAt: v.number(),
    }))),
  })
    .index("by_api_key", ["apiKey"])
    .index("by_created_by", ["createdBy"]),
    
  logs: defineTable({
    appId: v.id("apps"), // which app this log belongs to
    timestamp: v.number(),
    level: v.string(), // "info", "warn", "error", "debug"
    message: v.string(),
    source: v.optional(v.string()), // function name or source
    requestId: v.optional(v.string()),
    userId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    rawData: v.optional(v.string()), // store original webhook payload
  })
    .index("by_app_and_timestamp", ["appId", "timestamp"])
    .index("by_app_and_level", ["appId", "level"])
    .index("by_app_and_source", ["appId", "source"])
    .index("by_timestamp", ["timestamp"])
    .index("by_level", ["level"]),

  // Lightweight summary table for reactive UI subscriptions
  logs_summary: defineTable({
    appId: v.id("apps"),
    timestamp: v.number(),
    level: v.string(),
    levelNum: v.number(), // DEBUG=10, INFO=20, WARN=30, ERROR=40
    messageShort: v.string(), // First 100 chars
    source: v.optional(v.string()),
    requestId: v.optional(v.string()),
    fullLogId: v.id("logs"), // Reference to full log
    hasMetadata: v.boolean(),
  })
    .index("by_app_and_timestamp", ["appId", "timestamp"])
    .index("by_timestamp", ["timestamp"])
    .index("by_level_num", ["levelNum"])
    .index("by_app_level_timestamp", ["appId", "levelNum", "timestamp"]),

  // Pre-aggregated metrics for cost-safe charts
  log_metrics: defineTable({
    appId: v.id("apps"),
    timestamp: v.number(), // Hour bucket start time
    period: v.string(), // "hour" or "day"
    totalLogs: v.number(),
    errorCount: v.number(),
    warnCount: v.number(),
    infoCount: v.number(),
    debugCount: v.number(),
    flaggedCount: v.number(),
    avgLogsPerMinute: v.number(),
  })
    .index("by_app_and_period", ["appId", "period", "timestamp"])
    .index("by_timestamp", ["timestamp"]),

  alerts: defineTable({
    appId: v.id("apps"),
    name: v.string(),
    condition: v.object({
      type: v.union(
        v.literal("error_rate"),
        v.literal("error_count"),
        v.literal("function_duration"),
        v.literal("no_logs")
      ),
      threshold: v.number(),
      timeWindow: v.number(), // minutes
      functionPattern: v.optional(v.string()),
    }),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    lastTriggered: v.union(v.number(), v.null()),
    triggerCount: v.number(),
  })
    .index("by_app", ["appId"])
    .index("by_created_by", ["createdBy"])
    .index("by_last_triggered", ["lastTriggered"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
