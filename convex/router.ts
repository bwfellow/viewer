import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// Webhook endpoint to receive logs from apps
http.route({
  path: "/webhook/logs",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.text();
      
      // Get API key from header or query parameter
      const apiKey = request.headers.get("x-api-key") || 
                    request.headers.get("authorization")?.replace("Bearer ", "") ||
                    new URL(request.url).searchParams.get("api_key");
      
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "API key required" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      
      // Process the log entry
      await ctx.runMutation(api.logs.processWebhookLog, {
        logData: body,
        apiKey,
      });
      
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error processing webhook:", error);
      return new Response(
        JSON.stringify({ error: "Failed to process webhook: " + error }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

export default http;
