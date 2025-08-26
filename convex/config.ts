import { query } from "./_generated/server";
import { v } from "convex/values";

// Get the Convex deployment URL for webhook testing
export const getWebhookUrl = query({
  args: {},
  returns: v.string(),
  handler: async (ctx, args) => {
    // According to the Convex docs, HTTP actions are exposed at:
    // https://<your deployment name>.convex.site
    // We'll use the deployment name from the README which shows "dutiful-dodo-553"
    return "https://dutiful-dodo-553.convex.site";
  },
});
