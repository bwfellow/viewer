import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

// Aggregate hourly metrics for cost-safe charting
export const aggregateHourlyMetrics = internalMutation({
  args: {
    targetHour: v.optional(v.number()), // Specific hour to process, defaults to last hour
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const targetTime = args.targetHour || (now - (60 * 60 * 1000)); // Default to last hour
    const hourStart = Math.floor(targetTime / (60 * 60 * 1000)) * (60 * 60 * 1000);
    const hourEnd = hourStart + (60 * 60 * 1000);
    
    console.log(`Aggregating metrics for hour: ${new Date(hourStart).toISOString()}`);
    
    // Get all active apps
    const apps = await ctx.db
      .query("apps")
      .filter(q => q.eq(q.field("isActive"), true))
      .collect();
    
    let processedApps = 0;
    
    for (const app of apps) {
      // Check if we already have metrics for this hour
      const existingMetric = await ctx.db
        .query("log_metrics")
        .withIndex("by_app_and_period", q =>
          q.eq("appId", app._id)
           .eq("period", "hour")
           .eq("timestamp", hourStart)
        )
        .first();
      
      if (existingMetric) {
        console.log(`Metrics already exist for ${app.name} at ${new Date(hourStart).toISOString()}`);
        continue;
      }
      
      // Use logs_summary for lightweight aggregation
      const hourLogs = await ctx.db
        .query("logs_summary")
        .withIndex("by_app_and_timestamp", q => 
          q.eq("appId", app._id)
           .gte("timestamp", hourStart)
           .lt("timestamp", hourEnd)
        )
        .collect();
      
      // Calculate metrics
      const totalLogs = hourLogs.length;
      const errorCount = hourLogs.filter(l => l.level === "error").length;
      const warnCount = hourLogs.filter(l => l.level === "warn").length;
      const infoCount = hourLogs.filter(l => l.level === "info").length;
      const debugCount = hourLogs.filter(l => l.level === "debug").length;
      
      // Count flagged logs (look for logs with "🚩" in messageShort)
      const flaggedCount = hourLogs.filter(l => l.messageShort.includes("🚩")).length;
      
      // Calculate average logs per minute
      const avgLogsPerMinute = totalLogs / 60; // 60 minutes in an hour
      
      const metrics = {
        appId: app._id,
        timestamp: hourStart,
        period: "hour",
        totalLogs,
        errorCount,
        warnCount,
        infoCount,
        debugCount,
        flaggedCount,
        avgLogsPerMinute: Math.round(avgLogsPerMinute * 100) / 100, // Round to 2 decimals
      };
      
      await ctx.db.insert("log_metrics", metrics);
      processedApps++;
      
      console.log(`Aggregated metrics for ${app.name}: ${totalLogs} logs, ${errorCount} errors`);
    }
    
    console.log(`Processed ${processedApps} apps for hour ${new Date(hourStart).toISOString()}`);
    
    return {
      processedApps,
      hourStart,
      hourEnd,
    };
  },
});

// Get chart data for an app (cost-safe using pre-aggregated metrics)
export const getAppChartData = query({
  args: { 
    appId: v.id("apps"),
    hours: v.optional(v.number()), // Default 24 hours
    period: v.optional(v.string()), // "hour" or "day", default "hour"
  },
  handler: async (ctx, { appId, hours = 24, period = "hour" }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    // Verify user owns the app
    const app = await ctx.db.get(appId);
    if (!app || app.createdBy !== userId) {
      throw new Error("App not found or access denied");
    }

    const now = Date.now();
    const since = now - (hours * 60 * 60 * 1000);
    
    // Get pre-aggregated metrics (very lightweight!)
    const metrics = await ctx.db
      .query("log_metrics")
      .withIndex("by_app_and_period", q =>
        q.eq("appId", appId)
         .eq("period", period)
         .gte("timestamp", since)
      )
      .order("asc")
      .collect();
    
    return metrics.map(metric => ({
      timestamp: metric.timestamp,
      hour: new Date(metric.timestamp).getHours(),
      label: new Date(metric.timestamp).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        hour12: true 
      }),
      totalLogs: metric.totalLogs,
      errorCount: metric.errorCount,
      warnCount: metric.warnCount,
      infoCount: metric.infoCount,
      debugCount: metric.debugCount,
      flaggedCount: metric.flaggedCount,
      avgLogsPerMinute: metric.avgLogsPerMinute,
      errorRate: metric.totalLogs > 0 ? Math.round((metric.errorCount / metric.totalLogs) * 100) : 0,
    }));
  },
});

// Get chart data for all user's apps (for overview charts)
export const getAllAppsChartData = query({
  args: { 
    hours: v.optional(v.number()), // Default 24 hours
  },
  handler: async (ctx, { hours = 24 }) => {
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
    const now = Date.now();
    const since = now - (hours * 60 * 60 * 1000);
    
    // Get metrics for all user's apps
    const allMetrics = await ctx.db
      .query("log_metrics")
      .withIndex("by_timestamp", q => q.gte("timestamp", since))
      .filter(q => q.eq(q.field("period"), "hour"))
      .collect();
    
    // Filter to user's apps only
    const userMetrics = allMetrics.filter(metric => 
      appIds.includes(metric.appId)
    );
    
    // Group by timestamp and aggregate across all apps
    const aggregatedData: Record<number, any> = {};
    
    userMetrics.forEach(metric => {
      if (!aggregatedData[metric.timestamp]) {
        aggregatedData[metric.timestamp] = {
          timestamp: metric.timestamp,
          hour: new Date(metric.timestamp).getHours(),
          label: new Date(metric.timestamp).toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            hour12: true 
          }),
          totalLogs: 0,
          errorCount: 0,
          warnCount: 0,
          infoCount: 0,
          debugCount: 0,
          flaggedCount: 0,
          avgLogsPerMinute: 0,
        };
      }
      
      aggregatedData[metric.timestamp].totalLogs += metric.totalLogs;
      aggregatedData[metric.timestamp].errorCount += metric.errorCount;
      aggregatedData[metric.timestamp].warnCount += metric.warnCount;
      aggregatedData[metric.timestamp].infoCount += metric.infoCount;
      aggregatedData[metric.timestamp].debugCount += metric.debugCount;
      aggregatedData[metric.timestamp].flaggedCount += metric.flaggedCount;
      aggregatedData[metric.timestamp].avgLogsPerMinute += metric.avgLogsPerMinute;
    });
    
    // Convert to array and sort by timestamp
    return Object.values(aggregatedData)
      .sort((a: any, b: any) => a.timestamp - b.timestamp)
      .map((data: any) => ({
        ...data,
        errorRate: data.totalLogs > 0 ? Math.round((data.errorCount / data.totalLogs) * 100) : 0,
      }));
  },
});

// Cleanup old metrics to prevent table growth
export const cleanupOldMetrics = internalMutation({
  args: {
    retentionDays: v.optional(v.number()), // Default 90 days for metrics
  },
  handler: async (ctx, args) => {
    const retentionDays = args.retentionDays || 90;
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    // Get old metrics (limit to 100 at a time)
    const oldMetrics = await ctx.db
      .query("log_metrics")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoffTime))
      .take(100);

    // Delete old metrics
    for (const metric of oldMetrics) {
      await ctx.db.delete(metric._id);
    }

    return {
      deletedCount: oldMetrics.length,
      hasMore: oldMetrics.length === 100,
    };
  },
});

// Manual trigger for metrics aggregation (for testing)
export const triggerMetricsAggregation = internalMutation({
  args: {
    hoursBack: v.optional(v.number()), // How many hours back to process
  },
  handler: async (ctx, args): Promise<any[]> => {
    const hoursBack = args.hoursBack || 1;
    const results: any[] = [];
    
    for (let i = 0; i < hoursBack; i++) {
      const targetHour = Date.now() - (i * 60 * 60 * 1000);
      const result: any = await ctx.runMutation(internal.metrics.aggregateHourlyMetrics, {
        targetHour,
      });
      results.push(result);
    }
    
    return results;
  },
});
