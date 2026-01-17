# ryOS API Design Guide

This document outlines the patterns and conventions used in the ryOS API.

## Architecture Overview

The API uses Vercel serverless functions with two runtimes:
- **Edge Runtime**: Most endpoints (default, faster cold starts)
- **Node.js Runtime**: Endpoints requiring `bcrypt` (auth/login, auth/register, auth/password/set)

## File Structure

```
api/
├── _utils/                    # Shared utilities
│   ├── middleware.ts          # Main middleware (consolidated utilities)
│   ├── redis.ts               # Redis client factory
│   ├── constants.ts           # Centralized constants
│   ├── _cors.ts               # CORS handling
│   ├── _rate-limit.ts         # Rate limiting
│   ├── _validation.ts         # Input validation
│   └── auth/                  # Authentication utilities
│       ├── index.ts           # Main auth exports
│       ├── _validate.ts       # Token validation
│       ├── _tokens.ts         # Token management
│       ├── _extract.ts        # Request auth extraction
│       ├── _constants.ts      # Auth-specific constants
│       └── _types.ts          # TypeScript types
├── auth/                      # Authentication endpoints
├── rooms/                     # Chat room endpoints
├── song/                      # Music library endpoints
├── chat-rooms/                # Chat room helpers (internal)
└── ...                        # Other endpoints
```

## Common Patterns

### 1. Runtime Declaration

```typescript
// Edge runtime (default)
export const config = {
  runtime: "edge",
};
export const maxDuration = 60; // optional

// Node.js runtime (when bcrypt needed)
export const runtime = "nodejs";
export const maxDuration = 15;
```

### 2. Imports from Middleware

```typescript
import {
  // Redis
  createRedis,
  
  // CORS
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
  
  // Auth
  extractAuth,
  extractAuthNormalized,
  
  // Response helpers
  jsonResponse,
  errorResponse,
  successResponse,
  rateLimitResponse,
  
  // Rate limiting
  getClientIp,
  checkRateLimit,
  RATE_LIMITS,
  
  // Request helpers
  parseJsonBody,
  getQueryParam,
  
  // Request context (reduces boilerplate)
  createRequestContext,
  
  // Constants
  REDIS_PREFIXES,
  TTL,
  RATE_LIMIT_TIERS,
} from "./_utils/middleware.js";
```

### 3. Basic Handler Structure

```typescript
export default async function handler(req: Request) {
  const origin = getEffectiveOrigin(req);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["GET", "POST", "OPTIONS"], origin);
    if (preflight) return preflight;
    return new Response(null, { status: 204 });
  }

  // Check origin
  if (!isAllowedOrigin(origin)) {
    return errorResponse("Unauthorized", 403, origin);
  }

  // Method check
  if (req.method !== "GET" && req.method !== "POST") {
    return errorResponse("Method not allowed", 405, origin);
  }

  // Create Redis client
  const redis = createRedis();

  try {
    // Handler logic here
    return jsonResponse({ data: "example" }, 200, origin);
  } catch (error) {
    console.error("Error:", error);
    return errorResponse("Internal server error", 500, origin);
  }
}
```

### 4. Using Request Context (Recommended for Complex Handlers)

```typescript
export default async function handler(req: Request) {
  const ctx = await createRequestContext(req, { requireAuth: true });
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["POST", "OPTIONS"], ctx.origin);
    if (preflight) return preflight;
    return new Response(null, { status: 204 });
  }

  if (!ctx.originAllowed) {
    return errorResponse("Unauthorized", 403, ctx.origin);
  }

  if (!ctx.user) {
    return errorResponse("Authentication required", 401, ctx.origin);
  }

  ctx.log("Processing request for user", { username: ctx.user.username });

  // Handler logic using ctx.redis, ctx.user, etc.
}
```

### 5. Authentication

```typescript
import { validateAuthToken } from "./_utils/auth/index.js";

// Extract and validate auth
const authHeader = req.headers.get("authorization");
const usernameHeader = req.headers.get("x-username");
const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

const authResult = await validateAuthToken(redis, usernameHeader, token, {
  allowExpired: true,  // Allow tokens within grace period
});

if (!authResult.valid) {
  return errorResponse("Unauthorized", 401, origin);
}
```

### 6. Rate Limiting

```typescript
import { checkRateLimit, RATE_LIMITS } from "./_utils/middleware.js";

// Using preset configurations
const rlResult = await checkRateLimit(
  req,
  RATE_LIMITS.burst("my-endpoint"),
  user,  // optional authenticated user
  origin
);

if (!rlResult.allowed) {
  return rlResult.error!;
}

// Or use rateLimitResponse helper
const ip = getClientIp(req);
const rlKey = RateLimit.makeKey(["rl", "endpoint", "ip", ip]);
const result = await RateLimit.checkCounterLimit({
  key: rlKey,
  windowSeconds: 60,
  limit: 30,
});

if (!result.allowed) {
  return rateLimitResponse(origin, 30, result.resetSeconds ?? 60);
}
```

### 7. Response Helpers

```typescript
// Success with data
return jsonResponse({ items: data }, 200, origin);

// Success response with "success: true"
return successResponse({ message: "Created" }, 201, origin);

// Error response
return errorResponse("Not found", 404, origin);

// Error with code and details
return errorResponse(
  "Validation failed",
  400,
  origin,
  "VALIDATION_ERROR",
  { field: "email", issue: "invalid format" }
);

// Rate limit response
return rateLimitResponse(origin, limit, resetSeconds, "burst");
```

### 8. Admin Check

```typescript
import { isAdmin } from "./_utils/middleware.js";

// Check if user is admin (ryo) with valid token
const adminAccess = await isAdmin(redis, username, token);
if (!adminAccess) {
  return errorResponse("Forbidden - admin access required", 403, origin);
}
```

## Constants

Use centralized constants from `_utils/constants.ts`:

```typescript
import { REDIS_PREFIXES, TTL, RATE_LIMIT_TIERS } from "./_utils/constants.js";

// Redis keys
const userKey = `${REDIS_PREFIXES.users}${username}`;

// TTLs
await redis.set(key, value, { ex: TTL.user });

// Rate limit tiers
const limit = RATE_LIMIT_TIERS.burst.authenticated.limit;
```

## Best Practices

1. **Always validate origin** before processing requests
2. **Use response helpers** for consistent error formats
3. **Implement rate limiting** on all public endpoints
4. **Log with request IDs** for easier debugging
5. **Use createRedis()** instead of instantiating Redis directly
6. **Keep runtime declarations simple** - just `config.runtime` and `maxDuration`
7. **Validate all user input** using the validation utilities
8. **Handle errors gracefully** with try/catch blocks

## Error Response Format

All error responses follow this format:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",  // optional
  "details": { ... }                // optional validation errors
}
```

Rate limit errors include additional fields:

```json
{
  "error": "rate_limit_exceeded",
  "limit": 30,
  "retryAfter": 45,
  "scope": "burst"  // optional
}
```
