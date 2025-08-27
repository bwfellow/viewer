# Building Webhooks with Convex Log Viewer

This guide explains how to build and integrate webhooks based on the Convex Log Viewer implementation. The system demonstrates a complete webhook architecture for receiving, processing, and visualizing log data from multiple Convex applications.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Webhook Receiver Implementation](#webhook-receiver-implementation)
3. [Setting Up Log Streams from Convex Apps](#setting-up-log-streams-from-convex-apps)
4. [Security and Authentication](#security-and-authentication)
5. [Data Processing and Storage](#data-processing-and-storage)
6. [Testing Webhooks](#testing-webhooks)
7. [Monitoring and Debugging](#monitoring-and-debugging)
8. [Best Practices](#best-practices)

## Architecture Overview

The Convex Log Viewer implements a centralized monitoring system that receives log data from multiple Convex applications via webhooks:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Convex App 1  │    │   Convex App 2  │    │   Convex App N  │
│                 │    │                 │    │                 │
│ Log Stream ─────┼────┼─────────────────┼────┼─────────────────┤
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │  Webhook Endpoint       │
                    │  /webhook/logs          │
                    └─────────────────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │  Log Processing         │
                    │  - Parse NDJSON         │
                    │  - Validate API Key     │
                    │  - Process Events       │
                    └─────────────────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │  Database Storage       │
                    │  - Apps                 │
                    │  - Logs                 │
                    │  - Alerts               │
                    └─────────────────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │  Dashboard UI           │
                    │  - Real-time stats      │
                    │  - Charts & Analytics   │
                    │  - Log Viewer           │
                    └─────────────────────────┘
```

## Webhook Receiver Implementation

### 1. HTTP Router Setup

The webhook endpoint is defined using Convex's HTTP router:

```typescript
// convex/router.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/webhook/logs",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // CORS headers for cross-origin requests
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    try {
      // Extract API key from headers or query params
      const apiKey = request.headers.get("x-api-key") || 
                    new URL(request.url).searchParams.get("api_key");

      if (!apiKey) {
        return new Response(JSON.stringify({ error: "API key required" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Get request body
      const body = await request.text();
      
      // Process the webhook
      await ctx.runMutation(api.logs.processWebhookLog, {
        apiKey,
        logData: body,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });

    } catch (error) {
      console.error("Error processing webhook:", error);
      return new Response(JSON.stringify({ error: "Processing failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }),
});

// Handle CORS preflight requests
http.route({
  path: "/webhook/logs",
  method: "OPTIONS",
  handler: httpAction(async (ctx, request) => {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }),
});

export default http;
```

### 2. Log Processing Logic

The core webhook processing handles NDJSON format and various log event types:

```typescript
// convex/logs.ts
export const processWebhookLog = mutation({
  args: {
    apiKey: v.string(),
    logData: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify API key and get app
    const app = await ctx.db
      .query("apps")
      .filter((q) => q.eq(q.field("apiKey"), args.apiKey))
      .first();

    if (!app) {
      throw new Error("Invalid API key");
    }

    // Parse NDJSON (Newline Delimited JSON)
    const logLines = args.logData.trim().split('\n');
    const events = [];
    
    for (const line of logLines) {
      if (line.trim()) {
        try {
          const logEntry = JSON.parse(line);
          if (Array.isArray(logEntry)) {
            events.push(...logEntry);
          } else {
            events.push(logEntry);
          }
        } catch (error) {
          console.error('Failed to parse log line:', error);
          // Continue processing other lines
        }
      }
    }

    // Process each event
    for (const event of events) {
      const processedLog = processConvexLogEvent(event, app._id);
      if (processedLog) {
        await ctx.db.insert("logs", processedLog);
      }
    }

    // Check for custom flags
    if (app.flags?.length) {
      for (const event of events) {
        const logString = `${event.function?.type || ''} ${event.function?.path || ''} ${event.status || ''}`.toLowerCase().trim();
        
        for (const flag of app.flags) {
          if (flag.isActive && logString.includes(flag.pattern.toLowerCase())) {
            // Create flagged event
            const flaggedEvent = {
              ...event,
              topic: 'flagged',
              flag: flag.name,
              originalTopic: event.topic,
            };
            const flaggedLog = processConvexLogEvent(flaggedEvent, app._id);
            if (flaggedLog) {
              await ctx.db.insert("logs", flaggedLog);
            }
          }
        }
      }
    }
  },
});
```

### 3. Event Processing

Different log event types are handled with specific processing logic:

```typescript
function processConvexLogEvent(event: any, appId: Id<"apps">) {
  const baseLog = {
    appId,
    timestamp: event.timestamp || Date.now(),
    level: "info",
    message: "",
    rawData: JSON.stringify(event),
  };

  switch (event.topic) {
    case 'verification':
      return {
        ...baseLog,
        level: "info",
        message: event.message || "Webhook verification",
        metadata: {
          deploymentName: event.convex?.deployment_name,
          deploymentType: event.convex?.deployment_type,
          projectName: event.convex?.project_name,
        },
      };

    case 'console':
      return {
        ...baseLog,
        level: event.log_level?.toLowerCase() || 'info',
        message: event.message || "Console log",
        source: event.function?.path,
        requestId: event.function?.request_id,
        metadata: {
          ...event.function,
          isTruncated: event.is_truncated,
          systemCode: event.system_code,
        },
      };

    case 'function_execution':
      return {
        ...baseLog,
        level: event.status === 'success' ? 'info' : 'error',
        message: `Function ${event.function?.path} ${event.status}`,
        source: event.function?.path,
        requestId: event.function?.request_id,
        metadata: {
          ...event.function,
          status: event.status,
          cached: event.cached,
          usage: event.usage,
          executionTime: event.execution_time_ms,
        },
      };

    // Add more event types as needed
    default:
      return {
        ...baseLog,
        message: `Unknown event type: ${event.topic}`,
        metadata: event,
      };
  }
}
```

## Setting Up Log Streams from Convex Apps

### 1. Configure Log Streams in Convex Dashboard

1. Go to your Convex project dashboard
2. Navigate to Settings → Integrations → Log Streams
3. Add a new webhook endpoint:
   - **URL**: `https://your-log-viewer.convex.site/webhook/logs`
   - **Method**: POST
   - **Headers**: `x-api-key: your_app_api_key`

### 2. Programmatic Setup (if available)

```javascript
// Using Convex CLI or API
convex logs:stream:create \
  --url "https://your-log-viewer.convex.site/webhook/logs" \
  --headers "x-api-key=your_app_api_key" \
  --topics "console,function_execution,audit_log"
```

### 3. Testing the Connection

Use the built-in webhook test functionality:

```typescript
// Frontend test function
const testWebhook = async (apiKey: string) => {
  const testPayload = {
    topic: "verification",
    timestamp: Date.now(),
    message: "Test webhook from dashboard",
    convex: {
      deployment_name: "test-deployment",
      deployment_type: "dev",
      project_name: "test-project"
    }
  };

  try {
    const response = await fetch(`${webhookUrl}/webhook/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(testPayload),
      mode: 'cors',
    });

    if (response.ok) {
      console.log('Webhook test successful');
    } else {
      console.error('Webhook test failed:', await response.text());
    }
  } catch (error) {
    console.error('Webhook test error:', error);
  }
};
```

## Security and Authentication

### 1. API Key Authentication

Each app gets a unique API key for authentication:

```typescript
// Generate secure API key
function generateApiKey(): string {
  return `app_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
}

// Validate API key in webhook
const app = await ctx.db
  .query("apps")
  .filter((q) => q.eq(q.field("apiKey"), apiKey))
  .first();

if (!app || !app.isActive) {
  throw new Error("Invalid or inactive API key");
}
```

### 2. CORS Configuration

Proper CORS headers for cross-origin webhook calls:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Or specific domains
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
  "Access-Control-Max-Age": "86400",
};
```

### 3. Rate Limiting (Optional)

Implement rate limiting for webhook endpoints:

```typescript
// Simple in-memory rate limiting
const rateLimiter = new Map();

function checkRateLimit(apiKey: string): boolean {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 1000;

  if (!rateLimiter.has(apiKey)) {
    rateLimiter.set(apiKey, { count: 1, resetTime: now + windowMs });
    return true;
  }

  const limit = rateLimiter.get(apiKey);
  if (now > limit.resetTime) {
    limit.count = 1;
    limit.resetTime = now + windowMs;
    return true;
  }

  if (limit.count >= maxRequests) {
    return false;
  }

  limit.count++;
  return true;
}
```

## Data Processing and Storage

### 1. Schema Design

```typescript
// convex/schema.ts
export default defineSchema({
  apps: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    apiKey: v.string(),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    flags: v.optional(v.array(v.object({
      pattern: v.string(),
      name: v.string(),
      isActive: v.boolean(),
      createdAt: v.number(),
    }))),
  }).index("by_created_by", ["createdBy"]),

  logs: defineTable({
    appId: v.id("apps"),
    timestamp: v.number(),
    level: v.string(),
    message: v.string(),
    source: v.optional(v.string()),
    requestId: v.optional(v.string()),
    userId: v.optional(v.string()),
    metadata: v.optional(v.any()), // Flexible for various log types
    rawData: v.optional(v.string()),
  })
    .index("by_app_and_timestamp", ["appId", "timestamp"])
    .index("by_timestamp", ["timestamp"])
    .index("by_level", ["level"]),
});
```

### 2. Data Validation and Sanitization

```typescript
function sanitizeLogData(data: any): any {
  // Remove sensitive information
  const sanitized = { ...data };
  
  // Remove potential sensitive fields
  delete sanitized.password;
  delete sanitized.token;
  delete sanitized.secret;
  delete sanitized.key;
  
  // Truncate large messages
  if (sanitized.message && sanitized.message.length > 10000) {
    sanitized.message = sanitized.message.substring(0, 10000) + '... [truncated]';
  }
  
  return sanitized;
}
```

### 3. Batch Processing

For high-volume webhooks, implement batch processing:

```typescript
const logBatch = [];
const BATCH_SIZE = 100;

export const processWebhookLogBatch = mutation({
  args: {
    logs: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    for (const log of args.logs) {
      await ctx.db.insert("logs", log);
    }
  },
});

// In your webhook handler
if (logBatch.length >= BATCH_SIZE) {
  await ctx.runMutation(api.logs.processWebhookLogBatch, {
    logs: logBatch.splice(0, BATCH_SIZE),
  });
}
```

## Testing Webhooks

### 1. Unit Testing

```typescript
// Test webhook processing
import { expect, test } from "vitest";

test("processes webhook log correctly", async () => {
  const testEvent = {
    topic: "console",
    timestamp: Date.now(),
    log_level: "info",
    message: "Test log message",
    function: {
      path: "test:function",
      request_id: "test-123",
    },
  };

  const result = processConvexLogEvent(testEvent, "app_123" as Id<"apps">);
  
  expect(result.level).toBe("info");
  expect(result.message).toBe("Test log message");
  expect(result.source).toBe("test:function");
});
```

### 2. Integration Testing

```typescript
// Test full webhook flow
test("webhook endpoint processes logs", async () => {
  const response = await fetch("/webhook/logs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "test_api_key",
    },
    body: JSON.stringify({
      topic: "verification",
      message: "Test webhook",
    }),
  });

  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.success).toBe(true);
});
```

### 3. Load Testing

```bash
# Using curl for basic load testing
for i in {1..100}; do
  curl -X POST "https://your-app.convex.site/webhook/logs" \
    -H "Content-Type: application/json" \
    -H "x-api-key: your_test_key" \
    -d '{"topic":"test","message":"Load test '$i'"}' &
done
wait
```

## Monitoring and Debugging

### 1. Logging and Metrics

```typescript
// Add comprehensive logging
export const processWebhookLog = mutation({
  handler: async (ctx, args) => {
    const startTime = Date.now();
    
    try {
      console.log(`Processing webhook for API key: ${args.apiKey.substring(0, 8)}...`);
      
      // Process logs...
      
      const processingTime = Date.now() - startTime;
      console.log(`Webhook processed successfully in ${processingTime}ms`);
      
    } catch (error) {
      console.error(`Webhook processing failed:`, error);
      throw error;
    }
  },
});
```

### 2. Health Checks

```typescript
// Health check endpoint
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    return new Response(JSON.stringify({
      status: "healthy",
      timestamp: Date.now(),
      version: "1.0.0",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});
```

### 3. Error Tracking

```typescript
// Structured error logging
function logError(error: Error, context: any) {
  console.error(JSON.stringify({
    error: error.message,
    stack: error.stack,
    context,
    timestamp: Date.now(),
  }));
}
```

## Best Practices

### 1. Webhook Design

- **Idempotency**: Design webhooks to handle duplicate deliveries gracefully
- **Timeout Handling**: Set appropriate timeouts for webhook processing
- **Retry Logic**: Implement exponential backoff for failed webhook deliveries
- **Payload Validation**: Always validate incoming webhook payloads

### 2. Security

- **Use HTTPS**: Always use HTTPS for webhook endpoints
- **Validate Signatures**: Implement webhook signature validation when possible
- **Rate Limiting**: Protect against abuse with rate limiting
- **Input Sanitization**: Sanitize all input data

### 3. Performance

- **Async Processing**: Use background jobs for heavy processing
- **Database Indexing**: Create appropriate database indexes for queries
- **Caching**: Cache frequently accessed data
- **Batch Operations**: Process multiple items in batches when possible

### 4. Reliability

- **Error Handling**: Implement comprehensive error handling
- **Monitoring**: Monitor webhook success/failure rates
- **Alerting**: Set up alerts for webhook failures
- **Backup Processing**: Have fallback mechanisms for critical data

### 5. Documentation

- **API Documentation**: Document webhook payload formats
- **Integration Guide**: Provide clear setup instructions
- **Troubleshooting**: Include common issues and solutions
- **Examples**: Provide working code examples

## Example Implementation Checklist

- [ ] HTTP router with POST endpoint
- [ ] CORS headers for cross-origin requests
- [ ] API key authentication
- [ ] NDJSON payload parsing
- [ ] Event type processing
- [ ] Database schema design
- [ ] Error handling and logging
- [ ] Rate limiting (optional)
- [ ] Health check endpoint
- [ ] Testing suite
- [ ] Documentation
- [ ] Monitoring and alerting

This implementation provides a solid foundation for building webhook-based integrations with Convex applications, offering real-time log processing, visualization, and monitoring capabilities.
