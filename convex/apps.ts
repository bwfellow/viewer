import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// Generate a random API key
function generateApiKey(): string {
  return 'app_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Create a new app
export const createApp = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated to create an app");
    }

    const apiKey = generateApiKey();
    
    return await ctx.db.insert("apps", {
      name: args.name,
      description: args.description,
      apiKey,
      isActive: true,
      createdBy: userId,
    });
  },
});

// Get all apps for the current user
export const getUserApps = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    return await ctx.db
      .query("apps")
      .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
      .collect();
  },
});

// Get app by API key (for webhook authentication)
export const getAppByApiKey = query({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("apps")
      .withIndex("by_api_key", (q) => q.eq("apiKey", args.apiKey))
      .unique();
  },
});

// Update app
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
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.appId, updates);
  },
});

// Delete app
export const deleteApp = mutation({
  args: { appId: v.id("apps") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    const app = await ctx.db.get(args.appId);
    if (!app || app.createdBy !== userId) {
      throw new Error("App not found or access denied");
    }

    // Delete all logs for this app first
    const logs = await ctx.db
      .query("logs")
      .withIndex("by_app_and_timestamp", (q) => q.eq("appId", args.appId))
      .collect();
    
    for (const log of logs) {
      await ctx.db.delete(log._id);
    }

    // Delete the app
    await ctx.db.delete(args.appId);
  },
});

// Regenerate API key
export const regenerateApiKey = mutation({
  args: { appId: v.id("apps") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be authenticated");
    }

    const app = await ctx.db.get(args.appId);
    if (!app || app.createdBy !== userId) {
      throw new Error("App not found or access denied");
    }

    const newApiKey = generateApiKey();
    await ctx.db.patch(args.appId, { apiKey: newApiKey });
    
    return newApiKey;
  },
});
