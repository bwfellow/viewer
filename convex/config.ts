import { query } from "./_generated/server";
import { v } from "convex/values";

// Get the Convex deployment URL for webhook testing
export const getWebhookUrl = query({
  args: {},
  returns: v.string(),
  handler: async (ctx, args) => {
    // In Convex, we can determine the deployment URL from the environment
    // This will return the correct .convex.site URL for the current deployment
    const deploymentUrl = process.env.CONVEX_SITE_URL || "https://dutiful-dodo-553.convex.site";
    return deploymentUrl;
  },
});
