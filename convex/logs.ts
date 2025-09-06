import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Helper function to convert log level to number for efficient filtering
function levelToNum(level: string): number {
  switch (level.toLowerCase()) {
    case 'debug': return 10;
    case 'info': return 20;
    case 'warn': return 30;
    case 'error': return 40;
    default: return 20;
  }
}

// Helper function to process and insert a single event (memory efficient)
async function processAndInsertEvent(ctx: any, event: any, app: any) {
  const processedLog = processConvexLogEvent(event, app._id);
  if (processedLog) {
    // Insert the full log
    const fullLogId = await ctx.db.insert("logs", processedLog);
    
    // Insert lightweight summary for reactive UI
    await ctx.db.insert("logs_summary", {
      appId: processedLog.appId,
      timestamp: processedLog.timestamp,
      level: processedLog.level,
      levelNum: levelToNum(processedLog.level),
      messageShort: processedLog.message.substring(0, 100),
      source: processedLog.source,
      requestId: processedLog.requestId || undefined,
      fullLogId,
      hasMetadata: !!processedLog.metadata,
    });
  }
}

// Process incoming webhook log data from Convex Log Streams
export const processWebhookLog = mutation({
  args: {
    logData: v.string(),
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Find the app by API key
      const app = await ctx.db
        .query("apps")
        .withIndex("by_api_key", (q) => q.eq("apiKey", args.apiKey))
        .unique();

      if (!app || !app.isActive) {
        throw new Error("Invalid or inactive API key");
      }

      // Parse NDJSON (Newline Delimited JSON) - MEMORY SAFE
      const logLines = args.logData.trim().split('\n');
      
      // Limit processing to prevent memory overflow
      const MAX_EVENTS_PER_BATCH = 100; // Prevent memory issues
      let processedCount = 0;
      let skippedCount = 0;
      
      console.log(`Processing webhook with ${logLines.length} lines`);
      
      for (const line of logLines) {
        if (!line.trim()) continue;
        
        // Memory safety: Stop if we've processed too many events
        if (processedCount >= MAX_EVENTS_PER_BATCH) {
          skippedCount++;
          continue;
        }
        
        try {
          const logEntry = JSON.parse(line);
          const events = Array.isArray(logEntry) ? logEntry : [logEntry];
          
          for (const event of events) {
            if (processedCount >= MAX_EVENTS_PER_BATCH) {
              skippedCount++;
              continue;
            }
            
            // Process the original event
            await processAndInsertEvent(ctx, event, app);
            processedCount++;
            
            // Check for flags and create flagged events
            if (app.flags?.length) {
              const logString = `${event.function?.type || ''} ${event.function?.path || ''} ${event.status || ''}`.toLowerCase().trim();
              
              for (const flag of app.flags) {
                if (flag.isActive && logString.includes(flag.pattern.toLowerCase())) {
                  // Create and process flagged event
                  const flaggedEvent = {
                    ...event,
                    topic: 'flagged',
                    flag: flag.name,
                    originalTopic: event.topic,
                  };
                  await processAndInsertEvent(ctx, flaggedEvent, app);
                  processedCount++;
                }
              }
            }
          }
        } catch (error) {
          console.error('Failed to parse log line:', error);
          // Continue processing other lines
        }
      }
      
      console.log(`Processed ${processedCount} events, skipped ${skippedCount} due to batch limit`);
    } catch (error) {
      console.error("Failed to process log entry:", error);
      throw new Error("Failed to process log entry: " + error);
    }
  },
});

// Helper function to process different types of Convex log events
function processConvexLogEvent(event: any, appId: any) {
  const baseLog = {
    appId,
    timestamp: event.timestamp || Date.now(),
    level: "info",
    message: "",
    rawData: JSON.stringify(event),
  };

  switch (event.topic) {
    case 'verification':
      return {
        ...baseLog,
        level: "info",
        message: event.message || "Webhook verification",
        source: event.convex?.deployment_name,
        requestId: undefined,
        metadata: {
          deploymentName: event.convex?.deployment_name,
          deploymentType: event.convex?.deployment_type,
          projectName: event.convex?.project_name,
        },
      };

    case 'console':
      return {
        ...baseLog,
        level: event.log_level?.toLowerCase() || 'info',
        message: event.message || "Console log",
        source: event.function?.path,
        requestId: event.function?.request_id,
        metadata: {
          ...event.function,
          isTruncated: event.is_truncated,
          systemCode: event.system_code,
        },
      };

    case 'function_execution':
      return {
        ...baseLog,
        level: event.status === 'success' ? 'info' : 'error',
        message: `Function ${event.function?.path} ${event.status}`,
        source: event.function?.path,
        requestId: event.function?.request_id,
        metadata: {
          ...event.function,
          status: event.status,
          cached: event.cached,
          usage: event.usage,
          executionTime: event.execution_time_ms,
        },
      };

    case 'flagged':
      return {
        ...baseLog,
        level: 'warn',
        message: `🚩 ${event.flag}: ${event.function?.path} ${event.status}`,
        source: event.function?.path,
        requestId: event.function?.request_id,
        metadata: {
          flag: event.flag,
          originalTopic: event.originalTopic,
          ...event.function,
          status: event.status,
        },
      };

    default:
      return {
        ...baseLog,
        message: `${event.topic}: ${event.message || JSON.stringify(event)}`,
        source: event.source || event.function?.path || event.topic,
        requestId: event.request_id || event.requestId || event.function?.request_id,
        userId: event.user_id || event.userId,
        metadata: event,
      };
  }
}

// OPTIMIZED QUERIES FOR REDUCED BANDWIDTH

// Lightweight tail query for live view - only last 5-15 minutes, WARN+ by default
export const tail = query({
  args: { 
    appId: v.optional(v.id("apps")),
    since: v.number(), 
    limit: v.optional(v.number()), 
    minLevel: v.optional(v.string()) 
  },
  handler: async (ctx, { appId, since, limit = 150, minLevel = "warn" }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    const minLevelNum = levelToNum(minLevel);
    
    // Get user's apps if no specific app provided
    let appIds: string[] = [];
    if (appId) {
      // Verify user owns this app
      const app = await ctx.db.get(appId);
      if (!app || app.createdBy !== userId) {
        throw new Error("App not found or access denied");
      }
      appIds = [appId];
    } else {
      const userApps = await ctx.db
        .query("apps")
        .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
        .collect();
      appIds = userApps.map(app => app._id);
    }

    // Use logs_summary for lightweight subscriptions
    const summaries = await ctx.db
      .query("logs_summary")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", since))
      .filter((q) => 
        q.and(
          q.gte(q.field("levelNum"), minLevelNum),
          appIds.length === 1 ? q.eq(q.field("appId"), appIds[0]) : q.or(...appIds.map(id => q.eq(q.field("appId"), id)))
        )
      )
      .order("desc")
      .take(limit);

    return summaries;
  },
});

// Get full log details on demand (when user clicks)
export const getFullLog = query({
  args: { logId: v.id("logs") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    const log = await ctx.db.get(args.logId);
    if (!log) {
      return null;
    }

    // Verify user owns the app this log belongs to
    const app = await ctx.db.get(log.appId);
    if (!app || app.createdBy !== userId) {
      throw new Error("Access denied");
    }

    return log;
  },
});

// Paginated historical logs using summaries
export const pageLogsBefore = query({
  args: { 
    appId: v.optional(v.id("apps")),
    before: v.number(), 
    cursor: v.optional(v.string()), 
    pageSize: v.optional(v.number()),
    minLevel: v.optional(v.string())
  },
  handler: async (ctx, { appId, before, cursor, pageSize = 100, minLevel = "info" }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    const minLevelNum = levelToNum(minLevel);

    // Get user's apps if no specific app provided
    let appIds: string[] = [];
    if (appId) {
      const app = await ctx.db.get(appId);
      if (!app || app.createdBy !== userId) {
        throw new Error("App not found or access denied");
      }
      appIds = [appId];
    } else {
      const userApps = await ctx.db
        .query("apps")
        .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
        .collect();
      appIds = userApps.map(app => app._id);
    }

    return await ctx.db
      .query("logs_summary")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", before))
      .filter((q) => 
        q.and(
          q.gte(q.field("levelNum"), minLevelNum),
          appIds.length === 1 ? q.eq(q.field("appId"), appIds[0]) : q.or(...appIds.map(id => q.eq(q.field("appId"), id)))
        )
      )
      .order("desc")
      .paginate({ cursor: cursor || null, numItems: pageSize });
  },
});

// Clear logs for an app (or all apps if no appId provided)
export const clearLogs = mutation({
  args: {
    appId: v.optional(v.id("apps")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    if (args.appId) {
      // Verify user owns the app
      const app = await ctx.db.get(args.appId);
      if (!app || app.createdBy !== userId) {
        throw new Error("App not found or access denied");
      }

      // Delete all logs for this app
      const logs = await ctx.db
        .query("logs")
        .withIndex("by_app_and_timestamp", (q) => q.eq("appId", args.appId!))
        .collect();
      
      const summaries = await ctx.db
        .query("logs_summary")
        .withIndex("by_app_and_timestamp", (q) => q.eq("appId", args.appId!))
        .collect();

      for (const log of logs) {
        await ctx.db.delete(log._id);
      }
      for (const summary of summaries) {
        await ctx.db.delete(summary._id);
      }
    } else {
      // Clear all logs for user's apps - use indexed queries instead of collect()
      const userApps = await ctx.db
        .query("apps")
        .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
        .collect();
      
      // Delete logs and summaries for each app individually using indexes
      for (const app of userApps) {
        const logs = await ctx.db
          .query("logs")
          .withIndex("by_app_and_timestamp", (q) => q.eq("appId", app._id))
          .collect();
        
        const summaries = await ctx.db
          .query("logs_summary")
          .withIndex("by_app_and_timestamp", (q) => q.eq("appId", app._id))
          .collect();

        for (const log of logs) {
          await ctx.db.delete(log._id);
        }
        for (const summary of summaries) {
          await ctx.db.delete(summary._id);
        }
      }
    }
  },
});

// Internal cleanup function for old logs with differential retention
export const cleanupOldLogs = internalMutation({
  args: {},
  returns: v.object({
    deletedLogs: v.number(),
    deletedSummaries: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // Different retention periods
    const normalLogRetentionHours = 72; // 3 days for normal logs
    const errorLogRetentionDays = 14; // 2 weeks for error logs
    
    const normalCutoffTime = Date.now() - (normalLogRetentionHours * 60 * 60 * 1000);
    const errorCutoffTime = Date.now() - (errorLogRetentionDays * 24 * 60 * 60 * 1000);

    // Get old normal logs (non-error logs older than 72 hours)
    const oldNormalLogs = await ctx.db
      .query("logs")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", normalCutoffTime))
      .filter((q) => q.neq(q.field("level"), "error"))
      .take(50);

    // Get old error logs (error logs older than 2 weeks)
    const oldErrorLogs = await ctx.db
      .query("logs")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", errorCutoffTime))
      .filter((q) => q.eq(q.field("level"), "error"))
      .take(50);

    // Get corresponding old summaries for normal logs
    const oldNormalSummaries = await ctx.db
      .query("logs_summary")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", normalCutoffTime))
      .filter((q) => q.neq(q.field("level"), "error"))
      .take(50);

    // Get corresponding old summaries for error logs
    const oldErrorSummaries = await ctx.db
      .query("logs_summary")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", errorCutoffTime))
      .filter((q) => q.eq(q.field("level"), "error"))
      .take(50);

    // Delete old logs and summaries
    const allOldLogs = [...oldNormalLogs, ...oldErrorLogs];
    const allOldSummaries = [...oldNormalSummaries, ...oldErrorSummaries];

    for (const log of allOldLogs) {
      await ctx.db.delete(log._id);
    }
    for (const summary of allOldSummaries) {
      await ctx.db.delete(summary._id);
    }

    return {
      deletedLogs: allOldLogs.length,
      deletedSummaries: allOldSummaries.length,
      hasMore: allOldLogs.length === 100 || allOldSummaries.length === 100,
    };
  },
});

// Public cleanup function that users can call with differential retention
export const cleanupOldLogsManual = mutation({
  args: {},
  returns: v.object({
    deletedCount: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    // Different retention periods
    const normalLogRetentionHours = 72; // 3 days for normal logs
    const errorLogRetentionDays = 14; // 2 weeks for error logs
    
    const normalCutoffTime = Date.now() - (normalLogRetentionHours * 60 * 60 * 1000);
    const errorCutoffTime = Date.now() - (errorLogRetentionDays * 24 * 60 * 60 * 1000);

    // Get user's apps
    const userApps = await ctx.db
      .query("apps")
      .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
      .collect();

    let deletedLogs = 0;
    let deletedSummaries = 0;
    
    for (const app of userApps) {
      // Get old normal logs for this app
      const oldNormalLogsForApp = await ctx.db
        .query("logs")
        .withIndex("by_app_and_timestamp", (q) => 
          q.eq("appId", app._id).lt("timestamp", normalCutoffTime)
        )
        .filter((q) => q.neq(q.field("level"), "error"))
        .take(25);

      // Get old error logs for this app
      const oldErrorLogsForApp = await ctx.db
        .query("logs")
        .withIndex("by_app_and_timestamp", (q) => 
          q.eq("appId", app._id).lt("timestamp", errorCutoffTime)
        )
        .filter((q) => q.eq(q.field("level"), "error"))
        .take(25);

      // Get old normal summaries for this app
      const oldNormalSummariesForApp = await ctx.db
        .query("logs_summary")
        .withIndex("by_app_and_timestamp", (q) => 
          q.eq("appId", app._id).lt("timestamp", normalCutoffTime)
        )
        .filter((q) => q.neq(q.field("level"), "error"))
        .take(25);

      // Get old error summaries for this app
      const oldErrorSummariesForApp = await ctx.db
        .query("logs_summary")
        .withIndex("by_app_and_timestamp", (q) => 
          q.eq("appId", app._id).lt("timestamp", errorCutoffTime)
        )
        .filter((q) => q.eq(q.field("level"), "error"))
        .take(25);

      // Delete old logs and summaries for this app
      const allOldLogs = [...oldNormalLogsForApp, ...oldErrorLogsForApp];
      const allOldSummaries = [...oldNormalSummariesForApp, ...oldErrorSummariesForApp];

      for (const log of allOldLogs) {
        await ctx.db.delete(log._id);
        deletedLogs++;
      }
      for (const summary of allOldSummaries) {
        await ctx.db.delete(summary._id);
        deletedSummaries++;
      }
    }

    return {
      deletedCount: deletedLogs + deletedSummaries,
      hasMore: deletedLogs >= (userApps.length * 25) || deletedSummaries >= (userApps.length * 25),
    };
  },
});

// Efficient function to get log statistics for dashboard using counting instead of collecting
export const getLogStats = query({
  args: {},
  returns: v.object({
    totalLogs: v.number(),
    totalSummaries: v.number(),
    errorLogs: v.number(),
    normalLogsOlderThan72Hours: v.number(),
    errorLogsOlderThan2Weeks: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    // Get user's apps
    const userApps = await ctx.db
      .query("apps")
      .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
      .collect();
    
    if (userApps.length === 0) {
      return {
        totalLogs: 0,
        totalSummaries: 0,
        errorLogs: 0,
        normalLogsOlderThan72Hours: 0,
        errorLogsOlderThan2Weeks: 0,
      };
    }

    // Calculate cutoff times
    const normalCutoffTime = Date.now() - (72 * 60 * 60 * 1000); // 72 hours
    const errorCutoffTime = Date.now() - (14 * 24 * 60 * 60 * 1000); // 2 weeks

    let totalLogs = 0;
    let totalSummaries = 0;
    let errorLogs = 0;
    let normalLogsOlderThan72Hours = 0;
    let errorLogsOlderThan2Weeks = 0;

    // Process each app individually to avoid loading too much data at once
    for (const app of userApps.slice(0, 10)) { // Limit to first 10 apps for performance
      // Count using efficient queries that don't load full documents
      
      // Count total logs using take() to avoid loading all into memory
      const logCount = await ctx.db
        .query("logs")
        .withIndex("by_app_and_timestamp", (q) => q.eq("appId", app._id))
        .take(1000); // Take sample to estimate
      totalLogs += logCount.length;

      // Count total summaries (lighter weight)
      const summaryCount = await ctx.db
        .query("logs_summary")
        .withIndex("by_app_and_timestamp", (q) => q.eq("appId", app._id))
        .take(1000);
      totalSummaries += summaryCount.length;

      // Count error logs using level index
      const errorLogCount = await ctx.db
        .query("logs_summary")
        .withIndex("by_app_and_timestamp", (q) => q.eq("appId", app._id))
        .filter((q) => q.eq(q.field("level"), "error"))
        .take(500);
      errorLogs += errorLogCount.length;

      // Count old normal logs (older than 72 hours, not errors)
      const oldNormalCount = await ctx.db
        .query("logs_summary")
        .withIndex("by_app_and_timestamp", (q) => 
          q.eq("appId", app._id).lt("timestamp", normalCutoffTime)
        )
        .filter((q) => q.neq(q.field("level"), "error"))
        .take(500);
      normalLogsOlderThan72Hours += oldNormalCount.length;

      // Count old error logs (older than 2 weeks)
      const oldErrorCount = await ctx.db
        .query("logs_summary")
        .withIndex("by_app_and_timestamp", (q) => 
          q.eq("appId", app._id).lt("timestamp", errorCutoffTime)
        )
        .filter((q) => q.eq(q.field("level"), "error"))
        .take(500);
      errorLogsOlderThan2Weeks += oldErrorCount.length;
    }

    // Add note if there are more apps
    const hasMoreApps = userApps.length > 10;

    return {
      totalLogs: hasMoreApps ? totalLogs * 2 : totalLogs, // Rough estimate if more apps
      totalSummaries: hasMoreApps ? totalSummaries * 2 : totalSummaries,
      errorLogs: hasMoreApps ? errorLogs * 2 : errorLogs,
      normalLogsOlderThan72Hours: hasMoreApps ? normalLogsOlderThan72Hours * 2 : normalLogsOlderThan72Hours,
      errorLogsOlderThan2Weeks: hasMoreApps ? errorLogsOlderThan2Weeks * 2 : errorLogsOlderThan2Weeks,
    };
  },
});

// Superadmin function to completely wipe all log data
export const superAdminWipeAllLogs = mutation({
  args: {
    confirmationCode: v.string(),
  },
  returns: v.object({
    deletedLogs: v.number(),
    deletedSummaries: v.number(),
    deletedMetrics: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    // For now, allowing all authenticated users access to superadmin functions
    // In production, you should implement proper role-based access control

    // Require confirmation code
    if (args.confirmationCode !== "WIPE_ALL_LOGS_CONFIRM") {
      throw new Error("Invalid confirmation code");
    }

    // Get all logs, summaries, and metrics
    const allLogs = await ctx.db
      .query("logs")
      .collect();

    const allSummaries = await ctx.db
      .query("logs_summary")
      .collect();

    const allMetrics = await ctx.db
      .query("log_metrics")
      .collect();

    // Delete everything
    for (const log of allLogs) {
      await ctx.db.delete(log._id);
    }
    
    for (const summary of allSummaries) {
      await ctx.db.delete(summary._id);
    }

    for (const metric of allMetrics) {
      await ctx.db.delete(metric._id);
    }

    return {
      deletedLogs: allLogs.length,
      deletedSummaries: allSummaries.length,
      deletedMetrics: allMetrics.length,
    };
  },
});
