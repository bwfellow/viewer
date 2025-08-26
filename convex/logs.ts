import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";

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
        throw new Error("Invalid API key or app is inactive");
      }

      // Split by newlines and parse each line as a separate JSON object
      const logLines = args.logData.trim().split('\n');
      const events = [];
      
      for (const line of logLines) {
        if (line.trim()) {
          try {
            const logEntry = JSON.parse(line);
            if (Array.isArray(logEntry)) {
              events.push(...logEntry);
            } else {
              events.push(logEntry);
            }
          } catch (error) {
            console.error('Failed to parse log line:', error);
            console.error('Problematic line:', line);
            // Continue processing other lines even if one fails
          }
        }
      }

      // Check if any events match the app's flags
      if (app.flags?.length) {
        for (const event of events) {
          const logString = `${event.function?.type || ''} ${event.function?.path || ''} ${event.status || ''}`.toLowerCase().trim();
          
          for (const flag of app.flags) {
            if (flag.isActive && logString.includes(flag.pattern.toLowerCase())) {
              // Create a flagged copy of the event
              const flaggedEvent = {
                ...event,
                topic: 'flagged',
                flag: flag.name,
                originalTopic: event.topic,
              };
              events.push(flaggedEvent);
            }
          }
        }
      }
      
      for (const event of events) {
        const processedLog = processConvexLogEvent(event, app._id);
        if (processedLog) {
          await ctx.db.insert("logs", processedLog);
        }
      }
    } catch (error) {
      console.error("Failed to process log entry:", error);
      throw new Error("Failed to process log entry: " + error);
    }
  },
});

// Process different types of Convex log events
function processConvexLogEvent(event: any, appId: any) {
  const baseLog = {
    appId,
    timestamp: event.timestamp || Date.now(),
    rawData: JSON.stringify(event),
  };

  switch (event.topic) {
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
        message: event.error_message || 
          `${event.function?.type || 'function'} ${event.function?.path || 'unknown'} ${event.status}`,
        source: event.function?.path,
        requestId: event.function?.request_id,
        metadata: {
          ...event.function,
          duration: event.execution_time_ms,
          status: event.status,
          error: event.error_message,
          mutationQueueLength: event.mutation_queue_length,
          mutationRetryCount: event.mutation_retry_count,
          usage: event.usage,
          occInfo: event.occ_info,
          schedulerInfo: event.scheduler_info,
        },
      };

    case 'verification':
      return {
        ...baseLog,
        level: 'info',
        message: event.message || "Log stream verification",
        source: 'system',
        metadata: event,
      };

    case 'scheduler_stats':
      return {
        ...baseLog,
        level: 'info',
        message: `Scheduler stats: ${event.num_running_jobs} running jobs, ${event.lag_seconds}s lag`,
        source: 'scheduler',
        metadata: event,
      };

    case 'audit_log':
      return {
        ...baseLog,
        level: 'info',
        message: `Audit log: ${event.audit_log_action}`,
        source: 'audit',
        metadata: event,
      };

    default:
      // Handle custom or unknown event types
      return {
        ...baseLog,
        level: event.level || event.log_level?.toLowerCase() || 'info',
        message: event.message || event.msg || `Unknown event type: ${event.topic}`,
        source: event.source || event.function?.path || event.topic,
        requestId: event.request_id || event.requestId || event.function?.request_id,
        userId: event.user_id || event.userId,
        metadata: event,
      };
  }
}

// Get paginated logs with optional filtering
export const getLogs = query({
  args: {
    paginationOpts: paginationOptsValidator,
    appId: v.optional(v.id("apps")),
    level: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    // If appId is specified, verify user owns the app
    if (args.appId) {
      const app = await ctx.db.get(args.appId);
      if (!app || app.createdBy !== userId) {
        throw new Error("App not found or access denied");
      }

      // Query logs for specific app
      if (args.level) {
        return await ctx.db
          .query("logs")
          .withIndex("by_app_and_level", (q) => q.eq("appId", args.appId!).eq("level", args.level!))
          .order("desc")
          .paginate(args.paginationOpts);
      } else if (args.source) {
        return await ctx.db
          .query("logs")
          .withIndex("by_app_and_source", (q) => q.eq("appId", args.appId!).eq("source", args.source!))
          .order("desc")
          .paginate(args.paginationOpts);
      } else {
        return await ctx.db
          .query("logs")
          .withIndex("by_app_and_timestamp", (q) => q.eq("appId", args.appId!))
          .order("desc")
          .paginate(args.paginationOpts);
      }
    } else {
      // Query logs for all user's apps
      const userApps = await ctx.db
        .query("apps")
        .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
        .collect();
      
      const appIds = userApps.map(app => app._id);
      
      // Get logs from all user's apps
      const allLogs = await ctx.db.query("logs").collect();
      const userLogs = allLogs.filter(log => appIds.includes(log.appId));
      
      // Apply filters
      let filteredLogs = userLogs;
      if (args.level) {
        filteredLogs = filteredLogs.filter(log => log.level === args.level);
      }
      if (args.source) {
        filteredLogs = filteredLogs.filter(log => log.source === args.source);
      }
      
      // Sort by timestamp desc
      filteredLogs.sort((a, b) => b.timestamp - a.timestamp);
      
      // Manual pagination
      const startIndex = 0; // For simplicity, starting from 0
      const endIndex = Math.min(startIndex + args.paginationOpts.numItems, filteredLogs.length);
      const page = filteredLogs.slice(startIndex, endIndex);
      
      return {
        page,
        isDone: endIndex >= filteredLogs.length,
        continueCursor: endIndex < filteredLogs.length ? "more" : null,
      };
    }
  },
});

// Search logs with full-text search and advanced filtering
export const searchLogs = query({
  args: {
    paginationOpts: paginationOptsValidator,
    appId: v.optional(v.id("apps")),
    searchTerm: v.optional(v.string()),
    level: v.optional(v.string()),
    source: v.optional(v.string()),
    dateRange: v.optional(v.object({
      start: v.number(),
      end: v.number(),
    })),
    eventType: v.optional(v.string()),
  },
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
    
    const appIds = userApps.map(app => app._id);

    // If specific app is requested, verify ownership
    if (args.appId && !appIds.includes(args.appId)) {
      throw new Error("App not found or access denied");
    }

    // Get all logs for user's apps
    const allLogs = await ctx.db.query("logs").collect();
    let filteredLogs = allLogs.filter(log => 
      args.appId ? log.appId === args.appId : appIds.includes(log.appId)
    );

    // Apply filters
    if (args.level) {
      filteredLogs = filteredLogs.filter(log => log.level === args.level);
    }

    if (args.source) {
      filteredLogs = filteredLogs.filter(log => log.source === args.source);
    }

    if (args.eventType) {
      filteredLogs = filteredLogs.filter(log => 
        log.metadata?.eventType === args.eventType
      );
    }

    if (args.dateRange) {
      filteredLogs = filteredLogs.filter(log => 
        log.timestamp >= args.dateRange!.start && 
        log.timestamp <= args.dateRange!.end
      );
    }

    // Apply search term (full-text search)
    if (args.searchTerm) {
      const searchLower = args.searchTerm.toLowerCase();
      filteredLogs = filteredLogs.filter(log => 
        log.message.toLowerCase().includes(searchLower) ||
        log.source?.toLowerCase().includes(searchLower) ||
        log.requestId?.toLowerCase().includes(searchLower) ||
        log.metadata?.functionName?.toLowerCase().includes(searchLower) ||
        log.metadata?.error?.toLowerCase().includes(searchLower) ||
        log.rawData?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by timestamp desc
    filteredLogs.sort((a, b) => b.timestamp - a.timestamp);

    // Manual pagination
    const startIndex = 0;
    const endIndex = Math.min(startIndex + args.paginationOpts.numItems, filteredLogs.length);
    const page = filteredLogs.slice(startIndex, endIndex);

    return {
      page,
      isDone: endIndex >= filteredLogs.length,
      continueCursor: endIndex < filteredLogs.length ? "more" : null,
      totalResults: filteredLogs.length,
    };
  },
});

// Get unique sources for filtering
export const getLogSources = query({
  args: {
    appId: v.optional(v.id("apps")),
  },
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
    
    const appIds = userApps.map(app => app._id);

    // If specific app is requested, verify ownership
    if (args.appId && !appIds.includes(args.appId)) {
      throw new Error("App not found or access denied");
    }

    // Get all logs for user's apps
    const allLogs = await ctx.db.query("logs").collect();
    const filteredLogs = allLogs.filter(log => 
      args.appId ? log.appId === args.appId : appIds.includes(log.appId)
    );

    // Extract unique sources
    const sources = new Set<string>();
    filteredLogs.forEach(log => {
      if (log.source) {
        sources.add(log.source);
      }
    });

    return Array.from(sources).sort();
  },
});

// Get unique event types for filtering
export const getEventTypes = query({
  args: {
    appId: v.optional(v.id("apps")),
  },
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
    
    const appIds = userApps.map(app => app._id);

    // If specific app is requested, verify ownership
    if (args.appId && !appIds.includes(args.appId)) {
      throw new Error("App not found or access denied");
    }

    // Get all logs for user's apps
    const allLogs = await ctx.db.query("logs").collect();
    const filteredLogs = allLogs.filter(log => 
      args.appId ? log.appId === args.appId : appIds.includes(log.appId)
    );

    // Extract unique event types
    const eventTypes = new Set<string>();
    filteredLogs.forEach(log => {
      if (log.metadata?.eventType) {
        eventTypes.add(log.metadata.eventType);
      }
    });

    return Array.from(eventTypes).sort();
  },
});

// Get log statistics for an app or all apps
export const getLogStats = query({
  args: {
    appId: v.optional(v.id("apps")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    let logs;
    
    if (args.appId) {
      // Verify user owns the app
      const app = await ctx.db.get(args.appId);
      if (!app || app.createdBy !== userId) {
        throw new Error("App not found or access denied");
      }
      
      logs = await ctx.db
        .query("logs")
        .withIndex("by_app_and_timestamp", (q) => q.eq("appId", args.appId!))
        .collect();
    } else {
      // Get stats for all user's apps
      const userApps = await ctx.db
        .query("apps")
        .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
        .collect();
      
      const appIds = userApps.map(app => app._id);
      const allLogs = await ctx.db.query("logs").collect();
      logs = allLogs.filter(log => appIds.includes(log.appId));
    }
    
    const stats = {
      total: logs.length,
      byLevel: {} as Record<string, number>,
      recentCount: 0,
      byApp: {} as Record<string, number>,
    };
    
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    for (const log of logs) {
      // Count by level
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
      
      // Count by app
      stats.byApp[log.appId] = (stats.byApp[log.appId] || 0) + 1;
      
      // Count recent logs (last hour)
      if (log.timestamp > oneHourAgo) {
        stats.recentCount++;
      }
    }
    
    return stats;
  },
});

// Clear logs for an app
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
      
      const logs = await ctx.db
        .query("logs")
        .withIndex("by_app_and_timestamp", (q) => q.eq("appId", args.appId!))
        .collect();
      
      for (const log of logs) {
        await ctx.db.delete(log._id);
      }
    } else {
      // Clear logs for all user's apps
      const userApps = await ctx.db
        .query("apps")
        .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
        .collect();
      
      for (const app of userApps) {
        const logs = await ctx.db
          .query("logs")
          .withIndex("by_app_and_timestamp", (q) => q.eq("appId", app._id))
          .collect();
        
        for (const log of logs) {
          await ctx.db.delete(log._id);
        }
      }
    }
  },
});

// Automatic log retention and cleanup
export const cleanupOldLogs = internalMutation({
  args: {
    retentionDays: v.optional(v.number()), // Default 30 days
    batchSize: v.optional(v.number()), // Default 100 logs per batch
  },
  handler: async (ctx, args) => {
    const retentionDays = args.retentionDays || 30;
    const batchSize = args.batchSize || 100;
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    // Get old logs
    const oldLogs = await ctx.db
      .query("logs")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoffTime))
      .take(batchSize);

    // Delete old logs
    for (const log of oldLogs) {
      await ctx.db.delete(log._id);
    }

    return {
      deletedCount: oldLogs.length,
      hasMore: oldLogs.length === batchSize,
    };
  },
});

// Get storage usage statistics
export const getStorageStats = query({
  args: {
    appId: v.optional(v.id("apps")),
  },
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    // Get user's apps
    const userApps = await ctx.db
      .query("apps")
      .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
      .collect();
    
    const appIds = userApps.map(app => app._id);

    // Get logs for the app or all user's apps
    const allLogs = await ctx.db.query("logs").collect();
    const userLogs = allLogs.filter(log => 
      args.appId ? log.appId === args.appId : appIds.includes(log.appId)
    );

    // Calculate storage usage
    let totalSize = 0;
    const now = Date.now();
    const periods = {
      last24h: now - (24 * 60 * 60 * 1000),
      last7d: now - (7 * 24 * 60 * 60 * 1000),
      last30d: now - (30 * 24 * 60 * 60 * 1000),
    };

    const stats = {
      totalLogs: userLogs.length,
      totalSizeBytes: 0,
      logsByPeriod: {
        last24h: 0,
        last7d: 0,
        last30d: 0,
        older: 0,
      },
      sizeByPeriod: {
        last24h: 0,
        last7d: 0,
        last30d: 0,
        older: 0,
      },
      oldestLogTimestamp: null as number | null,
      newestLogTimestamp: null as number | null,
    };

    for (const log of userLogs) {
      const logSize = JSON.stringify(log).length;
      totalSize += logSize;

      // Update oldest/newest timestamps
      if (!stats.oldestLogTimestamp || log.timestamp < stats.oldestLogTimestamp) {
        stats.oldestLogTimestamp = log.timestamp;
      }
      if (!stats.newestLogTimestamp || log.timestamp > stats.newestLogTimestamp) {
        stats.newestLogTimestamp = log.timestamp;
      }

      // Categorize by time period
      if (log.timestamp > periods.last24h) {
        stats.logsByPeriod.last24h++;
        stats.sizeByPeriod.last24h += logSize;
      } else if (log.timestamp > periods.last7d) {
        stats.logsByPeriod.last7d++;
        stats.sizeByPeriod.last7d += logSize;
      } else if (log.timestamp > periods.last30d) {
        stats.logsByPeriod.last30d++;
        stats.sizeByPeriod.last30d += logSize;
      } else {
        stats.logsByPeriod.older++;
        stats.sizeByPeriod.older += logSize;
      }
    }

    stats.totalSizeBytes = totalSize;

    return stats;
  },
});

// Public cleanup function that users can call
export const cleanupOldLogsManual = mutation({
  args: {
    retentionDays: v.optional(v.number()), // Default 30 days
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    const retentionDays = args.retentionDays || 30;
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    // Get user's apps
    const userApps = await ctx.db
      .query("apps")
      .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
      .collect();
    
    const appIds = userApps.map(app => app._id);

    // Get old logs for user's apps
    const allLogs = await ctx.db.query("logs").collect();
    const oldLogs = allLogs.filter(log => 
      appIds.includes(log.appId) && log.timestamp < cutoffTime
    ).slice(0, 100); // Limit to 100 at a time

    // Delete old logs
    for (const log of oldLogs) {
      await ctx.db.delete(log._id);
    }

    return {
      deletedCount: oldLogs.length,
      hasMore: oldLogs.length === 100,
    };
  },
});
