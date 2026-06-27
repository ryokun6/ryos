---
name: write-api-route
description: Create or modify ryOS backend API routes under api/ using the shared apiHandler wrapper, request-auth, Redis, rate limiting, and CORS conventions. Use when adding an endpoint, writing a serverless/Bun API handler, wiring auth or rate limits, or working with anything under the api/ directory.
---

# Writing ryOS API Routes

ryOS API routes are Node-style handlers under `api/`. They run on Vercel **and** the standalone Bun server (`scripts/api-standalone-server.ts`). The canonical reference is `docs/8.10-api-design-guide.md` — read it for the full contract. This skill is the practical checklist.

## Quick Start Checklist

```
- [ ] 1. Pick the path: api/<feature>/index.ts (collection) or api/<feature>/[id].ts (item)
- [ ] 2. Declare runtime + maxDuration
- [ ] 3. Wrap the handler in apiHandler({ methods, auth, ... })
- [ ] 4. Validate input (Zod via bodySchema, or _utils/_validation.ts helpers)
- [ ] 5. Rate-limit public / expensive routes (_utils/_rate-limit.ts)
- [ ] 6. Use shared constants/keys (_utils/constants.ts, REDIS_PREFIXES)
- [ ] 7. Return explicit JSON; errors as { error: "..." }
- [ ] 8. Add structured logs (logger.info / branch decisions)
- [ ] 9. Write/extend an integration test in tests/ (requires `bun run dev:api`)
- [ ] 10. Update the matching docs/8.*.md if the contract changed
```

## File & Naming Conventions

```text
api/
├── _utils/                 # globally shared helpers (api-handler, redis, request-auth, ...)
├── <feature>/
│   ├── index.ts            # collection route (GET list / POST create)
│   ├── [id].ts             # item route (path param :id)
│   ├── [id]/messages.ts    # nested dynamic routes
│   └── _helpers/           # feature-private helpers (_constants.ts, _types.ts, ...)
```

- `_utils/` = global utilities; feature `_helpers/` = domain-specific internals.
- `_*.ts` / `_helpers/` are private modules (not routes).
- Use `index.ts` for collections, `[id].ts` and nested folders for path params.
- **Import shared modules with the `.js` extension** (e.g. `from "../_utils/api-handler.js"`) — required for the Node/Vercel ESM build even though the source is `.ts`.

## Primary Pattern: `apiHandler`

Prefer `apiHandler` for all new JSON endpoints. It centralizes CORS/preflight, origin allowlisting, method checks, Redis injection, auth resolution, body parsing/validation, analytics, and a 500 fallback.

```typescript
import { apiHandler } from "../_utils/api-handler.js";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30; // seconds; tune per endpoint

const bodySchema = z.object({
  name: z.string().min(1).max(100),
});

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",        // "none" | "optional" | "required" | "admin"
    parseJsonBody: true,     // implied when bodySchema is set
    bodySchema,              // 400 { error: "validation_error", issues } on failure
    // allowExpiredAuth: false,
    // contentType: "application/json", // pass null to disable the default header
    // analytics: true,
  },
  async ({ req, res, redis, logger, startTime, origin, user, body }) => {
    // `user` is the authenticated user (never null when auth: "required"/"admin")
    // `body` is the parsed + validated payload (typed from bodySchema)
    logger.info("creating thing", { username: user!.username });

    // ...business logic against redis...

    logger.response(201, Date.now() - startTime);
    res.status(201).json({ success: true });
  }
);
```

### Handler context

`apiHandler` passes `{ req, res, redis, logger, startTime, origin, user, body }`:

- `redis` — client from `createRedis()` (Upstash REST or standard Redis backend).
- `logger` — request-scoped logger; `request()` is already called for you.
- `user` — `null` unless authenticated; guaranteed non-null for `auth: "required"`/`"admin"`.
- `body` — `null` unless `parseJsonBody`/`bodySchema`; typed when `bodySchema` is set.

## Auth

Auth is unified through `_utils/request-auth.ts` (`resolveRequestAuth`). Set `auth` on `apiHandler`:

- `"none"` — public.
- `"optional"` — anonymous allowed, but credentials are validated if present.
- `"required"` — needs **both** `Authorization: Bearer <token>` and `X-Username: <username>`. Partial creds → `400`; bad pair → `401`.
- `"admin"` — required auth AND `username === "ryo"`, else `403`.

For non-`apiHandler` routes (e.g. multipart uploads), call `resolveRequestAuth()` directly to keep behavior aligned.

## Rate Limiting

Apply to public and expensive routes using `_utils/_rate-limit.ts`:

```typescript
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";

const ip = getClientIp(req);
const key = RateLimit.makeKey(["rl", "feature", "burst", "ip", ip]);
const result = await RateLimit.checkCounterLimit({ key, windowSeconds: 60, limit: 30 });

if (!result.allowed) {
  res.setHeader("Retry-After", String(result.resetSeconds));
  return res.status(429).json({
    error: "rate_limit_exceeded",
    limit: result.limit,
    retryAfter: result.resetSeconds,
  });
}
```

`getClientIp` respects `TRUSTED_PROXY_COUNT` on non-Vercel deploys. Prefer tiers from `RATE_LIMIT_TIERS` in `_utils/constants.ts` over magic numbers.

## Response & Error Shape

- Success: explicit payloads (`{ success: true }`, `{ data: ... }`).
- Client errors: `400/401/403/404/405/429` with JSON `{ error: "..." }` (extra fields ok if additive).
- Server errors: `500 { error: "..." }` — `apiHandler` provides this automatically for thrown errors.
- Streaming: use SSE helpers in `_utils/_sse.ts`; set stream headers and emit structured events (`start`, `line`, `complete`, `error`).

## Shared Utilities (use before hand-rolling)

| Module | Use |
|--------|-----|
| `_utils/_validation.ts` | username/room/message validation, profanity filter, HTML escaping |
| `_utils/_ssrf.ts` | `validatePublicUrl()`, `safeFetchWithRedirects()` for untrusted URLs |
| `_utils/_sse.ts` | SSE streaming helpers |
| `_utils/redis.ts` | `createRedis()` client factory |
| `_utils/storage.ts` | switchable object storage (Vercel Blob / S3) |
| `_utils/constants.ts` | `REDIS_PREFIXES`, `TTL`, `RATE_LIMIT_TIERS`, `PASSWORD`, `VALIDATION`, `TOKEN` |
| `_utils/_logging.ts` | `initLogger()` (only needed for manual handlers) |

Always key Redis entries with `REDIS_PREFIXES` + shared `TTL` rather than hardcoding strings.

## Manual Handlers (when `apiHandler` doesn't fit)

Some endpoints (e.g. multipart `/api/audio-transcribe`) keep explicit handlers. Mirror the shared behavior manually:

```typescript
import { getEffectiveOrigin, isAllowedOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";
import { resolveRequestAuth } from "../_utils/request-auth.js";

const origin = getEffectiveOrigin(req);
setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });
if (req.method === "OPTIONS") return res.status(204).end();
if (!isAllowedOrigin(origin)) return res.status(403).json({ error: "Unauthorized" });
// method checks → initLogger() + timing logs → resolveRequestAuth() for auth routes
```

## Testing

API integration tests require the standalone server running:

```bash
# Terminal 1
bun run dev:api          # exports TRUSTED_PROXY_COUNT=1 for spoofed-IP rate-limit tests
# Terminal 2
bun run test:api         # or: bun test tests/test-<feature>.test.ts
```

Use helpers from `tests/test-utils.ts`: `fetchWithOrigin`, `fetchWithAuth`, `ensureUserAuth`, `makeRateLimitBypassHeaders` (random IP to dodge rate limits). Add the new suite to the `test:api` script in `package.json` if you created a new file. For pure schema/validation logic, a no-server unit test (see the `write-tests` skill) is often enough.

## Best Practices

1. Prefer `apiHandler`; keep auth semantics via `request-auth`.
2. Validate ALL user input before use (Zod `bodySchema` is preferred).
3. Rate-limit public/expensive routes.
4. Keep response shapes stable, explicit, and backward-compatible.
5. Use SSRF-safe fetch for untrusted URLs.
6. Log request/response and key branch decisions.
7. Update `docs/8.*.md` whenever a request/response contract changes.
