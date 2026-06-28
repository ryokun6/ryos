---
name: write-tests
description: Write and run ryOS tests with Bun's native test runner (bun:test). Covers unit/wiring tests (no server) vs API integration tests (require the standalone API server), shared HTTP helpers, and the package.json suite commands. Use when adding tests, writing test coverage for a change, or running/triaging the test suite.
---

# Writing & Running ryOS Tests

ryOS uses **Bun's native test runner** (`bun:test`). Test files live in `tests/`, are named `test-*.test.ts`, and use `describe` / `test` / `expect`.

## Two Kinds of Tests

| Kind | What it covers | Needs API server? | Suite command |
|------|----------------|-------------------|---------------|
| Unit / wiring | Pure logic, Zod schemas, store reducers, helper functions, "is X wired to Y" checks | No | `bun run test:unit` |
| API integration | Real HTTP against `api/*` endpoints | **Yes** (`bun run dev:api`) | `bun run test:api` |

Prefer a **unit test** when the logic can be exercised without a server (most schema/util/store work). Add an **API integration test** when you need the real request → handler → Redis path.

## Quick Start Checklist

```
- [ ] 1. Decide: unit/wiring (no server) or API integration (needs server)
- [ ] 2. Create tests/test-<feature>.test.ts
- [ ] 3. Use describe / test / expect from "bun:test"
- [ ] 4. For API tests, use helpers from tests/test-utils.ts
- [ ] 5. For API or opt-in tests, add the file to `scripts/test-groups.ts`
- [ ] 6. Run `bun run test:registration`; iterate until green
- [ ] 7. Run it; iterate until green
```

## Unit / Wiring Test

No server required. Import the code under test directly. Schema tests are the highest-value, lowest-friction kind.

```typescript
import { describe, expect, test } from "bun:test";
import { tvControlSchema } from "../api/chat/tools/schemas";

describe("tvControlSchema", () => {
  test("accepts a valid 'list' call", () => {
    expect(tvControlSchema.safeParse({ action: "list" }).success).toBe(true);
  });

  test("rejects 'tune' with neither channelId nor channelNumber", () => {
    expect(tvControlSchema.safeParse({ action: "tune" }).success).toBe(false);
  });
});
```

Run a single file:

```bash
bun test tests/test-tv-control-schema.test.ts
```

## API Integration Test

Requires the standalone server running in a separate terminal:

```bash
# Terminal 1
bun run dev:api      # port 3000; exports TRUSTED_PROXY_COUNT=1 so spoofed-IP rate-limit tests work
# Terminal 2
bun run test:api     # or a single file: bun test tests/test-<feature>.test.ts
```

Use the shared HTTP helpers from `tests/test-utils.ts` — they set the required `Origin` header and auth:

```typescript
import { describe, test, expect } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  fetchWithAuth,
  ensureUserAuth,
  makeRateLimitBypassHeaders,
  getTokenFromAuthCookie,
} from "./test-utils";

describe("My feature", () => {
  test("requires auth → 401", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/my-feature`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("creates when authed", async () => {
    const token = await ensureUserAuth("testuser_feat", "testtest");
    const res = await fetchWithAuth(`${BASE_URL}/api/my-feature`, "testuser_feat", token!, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ name: "hi" }),
    });
    expect(res.status).toBe(201);
  });
});
```

### Helpers in `tests/test-utils.ts`

| Helper | Purpose |
|--------|---------|
| `BASE_URL` | `process.env.API_URL` or `http://localhost:3000` |
| `fetchWithOrigin(url, opts)` | adds `Origin: http://localhost:3000` |
| `fetchWithAuth(url, username, token, opts)` | adds Origin + `Authorization` + `X-Username` |
| `makeRateLimitBypassHeaders()` | `Content-Type` + random `X-Forwarded-For` to dodge per-IP limits |
| `ensureUserAuth(username, password)` | register-or-login, returns a token (or null) |
| `getTokenFromAuthCookie(res)` / `getAuthFromCookie(res)` | read token from the `ryos_auth` httpOnly cookie |

### Integration test conventions

- Generate fresh usernames per run to avoid cross-run collisions; reuse via `ensureUserAuth`.
- Always include `makeRateLimitBypassHeaders()` (or a unique IP) on rate-limited routes.
- Tolerate rate limiting where the suite expects it: `if (res.status === 429) return;` is an accepted skip pattern in existing suites.
- Auth endpoints set the token in the `ryos_auth` cookie, not the JSON body — read it via the cookie helpers.

## Registering New Test Files

Unit/wiring tests are discovered automatically by `bun run test:unit`.
Server-backed and opt-in suites are explicit in `scripts/test-groups.ts`:

- Unit/wiring → no manual registration; `test:unit` runs every discovered test except API/opt-in files.
- API integration → append to `API_TEST_FILES`.
- Opt-in/local-service suites → append to `OPT_IN_TEST_FILES`.
- Optionally add a focused `"test:<feature>"` script for fast local runs.
- Run `bun run test:registration` after adding or renaming tests.

`bun test` (no args / `"test"`) runs everything, including API suites, so it needs the server too.

## Running Subsets

```bash
bun run test:unit                       # all no-server suites
bun run test:api                        # all API suites (server required)
bun test tests/test-foo.test.ts         # one file
bun test --filter 'pusher'              # by name pattern (see test:pusher-regression etc.)
```

See `package.json` for targeted suites (`test:ai`, `test:song`, `test:new-api`, `test:sync-v2`, `test:chat-regression`, …).

## When to Add Tests (match repo conventions)

- Adding/altering a Zod schema, util, store reducer, or API contract → add or extend a test.
- Touching code that already has a sibling `tests/test-*.test.ts` → update it.
- Do **not** build large new test infrastructure unrelated to the change unless asked.
