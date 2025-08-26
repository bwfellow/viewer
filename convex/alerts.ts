import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// Alert configuration
export const createAlert = mutation({
  args: {
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
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    // Verify user owns the app
    const app = await ctx.db.get(args.appId);
    if (!app || app.createdBy !== userId) {
      throw new Error("App not found or access denied");
    }

    return await ctx.db.insert("alerts", {
      appId: args.appId,
      name: args.name,
      condition: args.condition,
      isActive: args.isActive ?? true,
      createdBy: userId,
      lastTriggered: null,
      triggerCount: 0,
    });
  },
});

// Get alerts for user's apps
export const getUserAlerts = query({
  args: {
    appId: v.optional(v.id("apps")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    // Get user's apps
    const userApps = await ctx.db
      .query("apps")
      .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
      .collect();
    
    const appIds = userApps.map(app => app._id);

    // Get alerts
    const allAlerts = await ctx.db.query("alerts").collect();
    const userAlerts = allAlerts.filter(alert => 
      args.appId ? alert.appId === args.appId : appIds.includes(alert.appId)
    );

    return userAlerts;
  },
});

// Update alert
export const updateAlert = mutation({
  args: {
    alertId: v.id("alerts"),
    name: v.optional(v.string()),
    condition: v.optional(v.object({
      type: v.union(
        v.literal("error_rate"),
        v.literal("error_count"),
        v.literal("function_duration"),
        v.literal("no_logs")
      ),
      threshold: v.number(),
      timeWindow: v.number(),
      functionPattern: v.optional(v.string()),
    })),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    const alert = await ctx.db.get(args.alertId);
    if (!alert || alert.createdBy !== userId) {
      throw new Error("Alert not found or access denied");
    }

    const updates: any = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.condition !== undefined) updates.condition = args.condition;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.alertId, updates);
  },
});

// Delete alert
export const deleteAlert = mutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    const alert = await ctx.db.get(args.alertId);
    if (!alert || alert.createdBy !== userId) {
      throw new Error("Alert not found or access denied");
    }

    await ctx.db.delete(args.alertId);
  },
});

// Check alerts (internal function to be called periodically)
export const checkAlerts = internalMutation({
  handler: async (ctx) => {
    const alerts = await ctx.db.query("alerts").collect();
    const activeAlerts = alerts.filter(alert => alert.isActive);

    const now = Date.now();
    const triggeredAlerts = [];

    for (const alert of activeAlerts) {
      const timeWindowMs = alert.condition.timeWindow * 60 * 1000;
      const startTime = now - timeWindowMs;

      // Get logs for this app in the time window
      const logs = await ctx.db
        .query("logs")
        .withIndex("by_app_and_timestamp", (q) => 
          q.eq("appId", alert.appId).gte("timestamp", startTime)
        )
        .collect();

      let shouldTrigger = false;

      switch (alert.condition.type) {
        case "error_count":
          const errorLogs = logs.filter(log => log.level === "error");
          shouldTrigger = errorLogs.length >= alert.condition.threshold;
          break;

        case "error_rate":
          const totalLogs = logs.length;
          const errorCount = logs.filter(log => log.level === "error").length;
          const errorRate = totalLogs > 0 ? (errorCount / totalLogs) * 100 : 0;
          shouldTrigger = errorRate >= alert.condition.threshold;
          break;

        case "function_duration":
          if (alert.condition.functionPattern) {
            const functionLogs = logs.filter(log => 
              log.source?.includes(alert.condition.functionPattern!) &&
              log.metadata?.duration
            );
            const slowLogs = functionLogs.filter(log => 
              log.metadata!.duration! >= alert.condition.threshold
            );
            shouldTrigger = slowLogs.length > 0;
          }
          break;

        case "no_logs":
          shouldTrigger = logs.length === 0;
          break;
      }

      if (shouldTrigger) {
        // Update alert trigger info
        await ctx.db.patch(alert._id, {
          lastTriggered: now,
          triggerCount: alert.triggerCount + 1,
        });

        triggeredAlerts.push({
          alert,
          context: {
            logCount: logs.length,
            errorCount: logs.filter(log => log.level === "error").length,
            timeWindow: alert.condition.timeWindow,
          }
        });
      }
    }

    return triggeredAlerts;
  },
});

// Get recent alert triggers
export const getAlertHistory = query({
  args: {
    appId: v.optional(v.id("apps")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const limit = args.limit || 50;

    // Get user's apps
    const userApps = await ctx.db
      .query("apps")
      .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
      .collect();
    
    const appIds = userApps.map(app => app._id);

    // Get alerts with recent triggers
    const allAlerts = await ctx.db.query("alerts").collect();
    const userAlerts = allAlerts.filter(alert => 
      args.appId ? alert.appId === args.appId : appIds.includes(alert.appId)
    );

    // Filter and sort by last triggered
    const triggeredAlerts = userAlerts
      .filter(alert => alert.lastTriggered)
      .sort((a, b) => b.lastTriggered! - a.lastTriggered!)
      .slice(0, limit);

    return triggeredAlerts;
  },
});
