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
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
            },
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
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
        },
      });
    } catch (error) {
      console.error("Error processing webhook:", error);
      return new Response(
        JSON.stringify({ error: "Failed to process webhook: " + error }),
        {
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
          },
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
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
          },
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
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
          },
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
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
        },
      }
    );
  }),
});

// Add OPTIONS handler for CORS preflight requests
http.route({
  path: "/webhook/logs",
  method: "OPTIONS",
  handler: httpAction(async (_, request) => {
    // Make sure the necessary headers are present
    const headers = request.headers;
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null
    ) {
      return new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }
    return new Response(null, { status: 200 });
  }),
});

export default http;
