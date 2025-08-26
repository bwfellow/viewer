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

// Add a GET handler for testing the webhook endpoint
http.route({
  path: "/webhook/logs",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const apiKey = url.searchParams.get("api_key");
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          error: "API key required",
          message: "Add ?api_key=your_api_key to the URL or use x-api-key header"
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Verify the API key exists
    const app = await ctx.runQuery(api.apps.getAppByApiKey, { apiKey });
    if (!app) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid API key",
          message: "The provided API key does not match any active app"
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Webhook endpoint is working!",
        app: { name: app.name, isActive: app.isActive },
        instructions: "Send POST requests to this endpoint with log data in the body"
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }),
});

export default http;
