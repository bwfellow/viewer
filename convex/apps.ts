import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// Create a new app
export const createApp = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    // Generate a unique API key
    const apiKey = `app_${Math.random().toString(36).substring(2)}`;

    const appId = await ctx.db.insert("apps", {
      name: args.name,
      description: args.description,
      apiKey,
      isActive: true,
      createdBy: userId,
      flags: [], // Initialize empty flags array
    });

    return { appId, apiKey };
  },
});

// Update an app
export const updateApp = mutation({
  args: {
    appId: v.id("apps"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    const app = await ctx.db.get(args.appId);
    if (!app || app.createdBy !== userId) {
      throw new Error("App not found or access denied");
    }

    const updates: any = {};
    if (args.name !== undefined) {
      if (!args.name.trim()) throw new Error("Name cannot be empty");
      updates.name = args.name;
    }
    if (args.description !== undefined) updates.description = args.description;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.appId, updates);
    return { success: true };
  },
});

// Add a flag to an app
export const addFlag = mutation({
  args: {
    appId: v.id("apps"),
    pattern: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    const app = await ctx.db.get(args.appId);
    if (!app || app.createdBy !== userId) {
      throw new Error("App not found or access denied");
    }

    const flags = app.flags || [];
    flags.push({
      pattern: args.pattern,
      name: args.name,
      isActive: true,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.appId, { flags });
    return { success: true };
  },
});

// Update a flag
export const updateFlag = mutation({
  args: {
    appId: v.id("apps"),
    flagIndex: v.number(),
    pattern: v.optional(v.string()),
    name: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    const app = await ctx.db.get(args.appId);
    if (!app || app.createdBy !== userId) {
      throw new Error("App not found or access denied");
    }

    const flags = app.flags || [];
    if (args.flagIndex < 0 || args.flagIndex >= flags.length) {
      throw new Error("Invalid flag index");
    }

    if (args.pattern !== undefined) flags[args.flagIndex].pattern = args.pattern;
    if (args.name !== undefined) flags[args.flagIndex].name = args.name;
    if (args.isActive !== undefined) flags[args.flagIndex].isActive = args.isActive;

    await ctx.db.patch(args.appId, { flags });
    return { success: true };
  },
});

// Delete a flag
export const deleteFlag = mutation({
  args: {
    appId: v.id("apps"),
    flagIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    const app = await ctx.db.get(args.appId);
    if (!app || app.createdBy !== userId) {
      throw new Error("App not found or access denied");
    }

    const flags = app.flags || [];
    if (args.flagIndex < 0 || args.flagIndex >= flags.length) {
      throw new Error("Invalid flag index");
    }

    flags.splice(args.flagIndex, 1);
    await ctx.db.patch(args.appId, { flags });
    return { success: true };
  },
});

// Get app by API key
export const getAppByApiKey = query({
  args: {
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("apps")
      .withIndex("by_api_key", (q) => q.eq("apiKey", args.apiKey))
      .unique();
  },
});

// Soft delete an app
export const deleteApp = mutation({
  args: {
    appId: v.id("apps"),
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

    // Create a backup of the app data
    const backup = {
      ...app,
      _backupType: "app_deletion",
      _backupTimestamp: Date.now(),
      _originalId: app._id,
    };

    // Store backup in a system log
    await ctx.db.insert("logs", {
      appId: args.appId,
      timestamp: Date.now(),
      level: "info",
      message: `App "${app.name}" deleted`,
      source: "system",
      metadata: {
        eventType: "app_deletion",
        backup,
      },
    });

    // Mark app as deleted
    await ctx.db.patch(args.appId, {
      isDeleted: true,
      deletedAt: Date.now(),
      isActive: false, // Automatically deactivate
    });

    // Archive logs by marking them as deleted
    const logs = await ctx.db
      .query("logs")
      .withIndex("by_app_and_timestamp", (q) => q.eq("appId", args.appId))
      .collect();

    for (const log of logs) {
      await ctx.db.patch(log._id, {
        metadata: {
          ...log.metadata,
          isDeleted: true,
          deletedAt: Date.now(),
        },
      });
    }

    return { success: true };
  },
});

// Permanently delete an app and its logs
export const permanentlyDeleteApp = mutation({
  args: {
    appId: v.id("apps"),
    confirmationPhrase: v.string(),
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

    // Require a specific confirmation phrase
    if (args.confirmationPhrase !== `delete-${app.name}-permanently`) {
      throw new Error("Invalid confirmation phrase");
    }

    // Delete all logs for this app
    const logs = await ctx.db
      .query("logs")
      .withIndex("by_app_and_timestamp", (q) => q.eq("appId", args.appId))
      .collect();

    for (const log of logs) {
      await ctx.db.delete(log._id);
    }

    // Delete the app
    await ctx.db.delete(args.appId);
    return { success: true };
  },
});

// Restore a deleted app
export const restoreApp = mutation({
  args: {
    appId: v.id("apps"),
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

    if (!app.isDeleted) {
      throw new Error("App is not deleted");
    }

    // Restore app
    await ctx.db.patch(args.appId, {
      isDeleted: false,
      deletedAt: undefined,
      // Note: Keep isActive as false so user can explicitly reactivate if desired
    });

    // Restore logs
    const logs = await ctx.db
      .query("logs")
      .withIndex("by_app_and_timestamp", (q) => q.eq("appId", args.appId))
      .collect();

    for (const log of logs) {
      if (log.metadata?.isDeleted) {
        await ctx.db.patch(log._id, {
          metadata: {
            ...log.metadata,
            isDeleted: undefined,
            deletedAt: undefined,
          },
        });
      }
    }

    return { success: true };
  },
});

// Get user's apps
export const getUserApps = query({
  args: {
    includeDeleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    let query = ctx.db
      .query("apps")
      .withIndex("by_created_by", (q) => q.eq("createdBy", userId));

    // Filter out deleted apps unless explicitly requested
    if (!args.includeDeleted) {
      query = query.filter((q) => q.or(q.eq(q.field("isDeleted"), false), q.eq(q.field("isDeleted"), undefined)));
    }

    return await query.collect();
  },
});