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

// Get user's apps
export const getUserApps = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    return await ctx.db
      .query("apps")
      .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
      .collect();
  },
});