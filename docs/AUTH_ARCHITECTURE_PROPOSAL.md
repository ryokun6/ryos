# Auth Flow Architecture — Current State & Proposed Simplification

## Table of Contents

- [Current Architecture](#current-architecture)
- [Problems & Complexity](#problems--complexity)
- [Proposed Architecture](#proposed-architecture)
- [Migration Plan](#migration-plan)
- [File-by-File Changes](#file-by-file-changes)

---

## Current Architecture

### Overview

The auth system uses **opaque tokens** stored in Redis, delivered to the browser via **httpOnly cookies** and/or **Authorization headers**. A legacy migration path converts localStorage-based tokens into cookies on first load after the upgrade.

### Server-Side Components

```
api/_utils/auth/
├── _constants.ts    — TTLs, key prefixes (90-day token, 30-day grace)
├── _types.ts        — TokenInfo, AuthValidationResult, ExtractedAuth, etc.
├── _tokens.ts       — generate, store, delete, scan tokens (Redis CRUD)
├── _validate.ts     — validateAuth (active check + grace-period fallback)
├── _extract.ts      — extractAuth (Authorization header → cookie fallback)
├── _password.ts     — bcrypt hash/verify (Node-only)
├── _password-storage.ts — Redis get/set for password hashes (Edge-safe)
└── index.ts         — barrel re-exports

api/_utils/
├── _cookie.ts       — build/parse ryos_auth cookie
├── request-auth.ts  — resolveRequestAuth (extract → validate → return user)
└── api-handler.ts   — wrapper: CORS, auth modes (none/optional/required), body parsing

api/auth/
├── register.ts      — POST: create user OR login existing (if password matches)
├── login.ts         — POST: password auth, optional old-token rotation
├── logout.ts        — POST: delete token, clear cookie
├── logout-all.ts    — POST: delete all user tokens, clear cookie
├── session.ts       — GET: validate cookie/header, refresh cookie (migration entry point)
├── tokens.ts        — GET: list active tokens
├── token/verify.ts  — POST: verify token, set cookie
├── token/refresh.ts — POST: old → new token rotation, set cookie
├── password/check.ts— GET: has user set a password?
└── password/set.ts  — POST: set/update password
```

### Client-Side Components

```
src/api/core.ts           — COOKIE_SESSION_MARKER, isRealToken(), apiRequest()
src/api/auth.ts           — loginWithPassword(), verifyAuthToken(), registerUser(), logoutUser()
src/stores/useChatsStore  — authToken state, legacy migration in onRehydrateStorage
src/hooks/useAuth.ts      — login/signup/logout UI handlers
src/apps/chats/hooks/useTokenRefresh.ts — hourly token-age check
src/utils/appletAuthBridge.ts — iframe auth forwarding via postMessage
```

### Auth Flow Diagram (Current)

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Zustand Store (in-memory):                                      │
│    authToken = "abc123..."        ← real token (post-login)      │
│              | "__cookie_session__" ← cookie-only mode            │
│              | null                ← unauthenticated              │
│    username  = "alice"                                           │
│                                                                  │
│  localStorage:                                                   │
│    _usr_recovery_key_        → username (plain text)              │
│    _auth_recovery_key_       → legacy btoa(reversed(token))      │
│    _token_refresh_time_alice → last refresh timestamp            │
│                                                                  │
│  API Requests:                                                   │
│    Mode A (real token):   Authorization: Bearer abc123...        │
│                           X-Username: alice                      │
│                           + cookies (credentials: include)       │
│                                                                  │
│    Mode B (cookie-only):  No auth headers                        │
│                           cookies sent automatically             │
│                                                                  │
└──────────────────┬───────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                        SERVER (API)                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  extractAuth(req):                                               │
│    1. Check Authorization header + X-Username                    │
│       - Skip if token is "null", "undefined", "__cookie_session__"│
│    2. Fall back to ryos_auth cookie                              │
│                                                                  │
│  validateAuth(redis, username, token):                            │
│    1. Check active key: chat:token:user:{user}:{token}           │
│       - If found: refresh TTL, return valid                      │
│    2. If allowExpired: check grace key chat:token:last:{user}    │
│       - If match within 30 days: return valid+expired            │
│                                                                  │
│  Cookie: ryos_auth={username}:{token}                            │
│    HttpOnly, Path=/api, SameSite=Lax, Secure (prod), 90d TTL    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Token Lifecycle (Current)

```
Register/Login:
  Server → generates token → stores in Redis (90d TTL)
        → sets httpOnly cookie
        → returns token in JSON body
  Client → stores token in memory (authToken = "abc123...")
        → saves refresh timestamp to localStorage

Subsequent requests:
  Client → sends Bearer header (if real token) + cookies
  Server → prefers header, falls back to cookie
        → validates against Redis, refreshes TTL

Refresh (client-initiated, after 83 days):
  Client → POST /api/auth/token/refresh with username + oldToken (or cookie)
  Server → validates old token, stores grace record, deletes old, creates new
        → sets new cookie, returns new token
  Client → stores new token in memory

Session restore (page reload):
  Client → reads username from localStorage recovery key
        → calls GET /api/auth/session (cookies sent automatically)
        → on success: sets authToken = COOKIE_SESSION_MARKER

Legacy migration (first load after upgrade):
  Client → reads _auth_recovery_key_ from localStorage, decodes
        → sends as Authorization header to GET /api/auth/session
        → server validates, sets cookie
        → client clears legacy key, sets authToken = COOKIE_SESSION_MARKER
```

---

## Problems & Complexity

### 1. Dual Authentication Modes on the Client

The client maintains two distinct auth modes: **real token** (in-memory) and **cookie-only** (`COOKIE_SESSION_MARKER`). This creates branching logic throughout:

- `isRealToken()` checks scattered across `core.ts`, `useChatsStore.ts`, `useAuth.ts`
- `buildOptionalAuthHeaders()` — duplicated pattern in store and API layer
- `apiRequest()` conditionally adds Authorization header based on token type
- `refreshAuthToken()` sends token in body or relies on cookie depending on mode
- `checkAndRefreshTokenIfNeeded()` skips entirely for cookie sessions
- `appletAuthBridge.ts` has special handling for `__cookie_session__`

**The root cause**: Login/register return the token in the JSON body AND set the cookie. The client stores both, creating a state where it has a real token AND a cookie. After reload, only the cookie survives (since `authToken` isn't persisted), so the client switches to `COOKIE_SESSION_MARKER` mode.

### 2. Client-Side Token Refresh Is Unnecessary

The server already refreshes the Redis TTL on every successful `validateAuth()` call. It also refreshes the cookie `Max-Age` on `/api/auth/session`. So long as the user visits the site within 90 days, everything stays alive automatically.

The client-side refresh infrastructure exists because:
- After login, the client holds a real token and tracks its age in localStorage
- After 83 days, it proactively rotates the token via `/api/auth/token/refresh`
- This is only relevant for real-token mode; cookie sessions skip it

If we go cookie-only, the server handles all TTL management implicitly.

### 3. Grace Period Adds Marginal Value

The 30-day grace window (`chat:token:last:{username}`) allows recently-deleted tokens to pass validation with `allowExpired: true`. This was designed for smooth token rotation, but:
- In cookie-only mode, token rotation is handled by the server transparently
- The grace record stores only the **last** deleted token per user — multiple rotations overwrite it
- Endpoints that use `allowExpiredAuth: true` (session, verify, logout, refresh) could handle staleness more simply

### 4. Register-as-Login Is Confusing

`POST /api/auth/register` silently logs in existing users if the password matches, returning 200 instead of 201. This makes the endpoint semantics unclear and error handling harder on the client. The client already has separate login and register flows in the UI.

### 5. Token Deletion by Redis SCAN Is Expensive

`deleteToken()` scans all keys matching `chat:token:user:*:{token}` to find and delete a token when only the token value is known (no username context). This is O(N) over all token keys in Redis.

### 6. Dead Code & Redundancy

- `ensureAuthToken()` in the store is a no-op for cookie sessions
- `tokenExists()` in `_validate.ts` references undeclared `normalizedUsername`
- `_token_refresh_time_` localStorage keys accumulate per-user and are never cleaned up except on logout
- The `useTokenAge()` hook is only used in a debug component
- `performReset()` in control panels preserves `_auth_recovery_key_` even though migration already consumed it

---

## Proposed Architecture

### Core Principle: Cookie-Only for Browser Clients

All browser auth uses the httpOnly cookie exclusively. The server never returns tokens in JSON response bodies. The client never stores or sends tokens — it's all transparent via `credentials: "include"`.

### Proposed Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Zustand Store (in-memory):                                      │
│    isAuthenticated = true/false                                  │
│    username        = "alice" | null                              │
│                                                                  │
│  localStorage:                                                   │
│    _usr_recovery_key_ → username (plain text, for session hint)  │
│                                                                  │
│  ALL API Requests:                                               │
│    credentials: "include" (cookies sent automatically)           │
│    No Authorization header, no X-Username header                 │
│                                                                  │
└──────────────────┬───────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                        SERVER (API)                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  extractAuth(req):                                               │
│    1. Parse ryos_auth cookie → { username, token }               │
│    2. (Legacy only) Fall back to Authorization header            │
│                                                                  │
│  Login/Register responses:                                       │
│    → Set-Cookie: ryos_auth=...                                   │
│    → JSON body: { username } (NO token in body)                  │
│                                                                  │
│  Token TTL refresh:                                              │
│    → Automatic on every authenticated request (already exists)   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### What Changes

| Area | Current | Proposed |
|------|---------|----------|
| **Client auth state** | `authToken` (real token / COOKIE_SESSION_MARKER / null) | `isAuthenticated` (boolean) |
| **Login/register response** | Returns `{ token, username }` | Returns `{ username }` (token only in cookie) |
| **API request headers** | Conditionally adds Bearer + X-Username | Never sends auth headers (cookie-only) |
| **Client token refresh** | Hourly check, localStorage timestamp tracking | Removed — server refreshes TTL on every request |
| **`/api/auth/token/refresh`** | Accepts body params or cookie | Cookie-only — rotates token in cookie transparently |
| **`COOKIE_SESSION_MARKER`** | Sentinel for cookie-only mode | Removed — only mode is cookie |
| **`isRealToken()`** | Used throughout for branching | Removed |
| **`buildOptionalAuthHeaders()`** | Conditionally builds auth headers | Removed |
| **Grace period** | 30-day window for expired tokens | Keep for refresh endpoint only, simplify to single-purpose |
| **Applet auth bridge** | Forwards token or checks for marker | Cookie passthrough for same-origin; explicit token grant for cross-origin |
| **Legacy migration** | Consumes `_auth_recovery_key_`, sends as Bearer | Keep as-is (one-time migration, self-cleaning) |

### What Stays the Same

- **Server token storage**: Redis keys `chat:token:user:{username}:{token}` with 90-day TTL
- **Cookie format**: `ryos_auth={username}:{token}`, HttpOnly, Path=/api, SameSite=Lax
- **Password hashing**: bcrypt, stored in Redis
- **Rate limiting**: Per-IP counters on register/login/refresh
- **`apiHandler` wrapper**: CORS, auth modes, body parsing
- **Legacy migration code**: Kept but clearly isolated (runs once per user, self-cleans)

### Proposed Server Auth Extraction (Priority Change)

```typescript
// PROPOSED: Cookie-first, header as legacy fallback only
export function extractAuth(request: VercelRequest): ExtractedAuth {
  // Primary: httpOnly cookie (all browser clients)
  const cookieAuth = parseAuthCookie(request.headers.cookie);
  if (cookieAuth) {
    return { username: cookieAuth.username, token: cookieAuth.token };
  }

  // Legacy fallback: Authorization header (migration & programmatic clients)
  const authHeader = getHeader(request, "authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    if (token && token !== "null" && token !== "undefined" && token !== "__cookie_session__") {
      const username = getHeader(request, "x-username");
      return { username, token };
    }
  }

  return { username: null, token: null };
}
```

### Proposed Login Response

```typescript
// CURRENT: Returns token in body + sets cookie
res.setHeader("Set-Cookie", buildSetAuthCookie(username, token));
res.status(200).json({ token, username });

// PROPOSED: Token only in cookie, body has username only
res.setHeader("Set-Cookie", buildSetAuthCookie(username, token));
res.status(200).json({ username });
```

### Proposed Client State

```typescript
// CURRENT
interface ChatsStoreState {
  authToken: string | null;  // real token | "__cookie_session__" | null
  username: string | null;
  // ...
}

// PROPOSED
interface ChatsStoreState {
  isAuthenticated: boolean;
  username: string | null;
  // ...
}
```

### Proposed Client Login Flow

```typescript
// CURRENT
const data = await response.json(); // { token: "abc...", username: "alice" }
set({ authToken: data.token, username: data.username });

// PROPOSED
const data = await response.json(); // { username: "alice" }
set({ isAuthenticated: true, username: data.username });
// Cookie is set by the server response automatically
```

### Proposed Session Restore

```typescript
// CURRENT (onRehydrateStorage)
const legacyToken = state.authToken || consumeLegacyAuthToken() || null;
state.authToken = null;
if (state.username) {
  restoreSessionFromCookie(state.username, legacyToken);
}
// → on success: store.setAuthToken(COOKIE_SESSION_MARKER)

// PROPOSED (onRehydrateStorage)
const legacyToken = consumeLegacyAuthToken() || null;
if (state.username) {
  restoreSession(state.username, legacyToken);
}
// → on success: store.setState({ isAuthenticated: true })
```

### Applet Auth Bridge

For same-origin applet iframes, cookies are sent automatically. The bridge only needs to communicate the `username` (not the token):

```typescript
// PROPOSED: Bridge only sends username for display/attribution
// Token auth is handled by cookies automatically
window.parent.postMessage({ type: CHANNEL, action: "request" }, PARENT_ORIGIN);
// Response: { username: "alice" } — no token
// Applet's fetch to /api/applet-ai uses cookies (same origin)
```

For cross-origin applets (if needed in the future), a scoped short-lived token could be minted server-side.

---

## Migration Plan

### Phase 1: Server — Stop Returning Tokens in Bodies (Backward-Compatible)

1. **Login/Register**: Keep setting cookie. Add a new field `cookieAuth: true` to the response. Continue returning `token` in body (for backward compat during rollout).
2. **Session endpoint**: No change needed (already cookie-focused).
3. **Auth extraction**: Flip priority to cookie-first, header-fallback.
4. **Refresh endpoint**: Accept cookie-only (already partially supported). Still return new token in body during transition.

### Phase 2: Client — Switch to Cookie-Only

1. Replace `authToken` with `isAuthenticated: boolean` in the store.
2. Remove `COOKIE_SESSION_MARKER`, `isRealToken()`, `buildOptionalAuthHeaders()`.
3. Remove `useTokenRefresh` hook and `checkAndRefreshTokenIfNeeded()`.
4. Remove `_token_refresh_time_` localStorage usage.
5. Simplify `apiRequest` — remove conditional auth header logic.
6. Update `useAuth` handlers to not store tokens.
7. Update applet bridge to cookie-only.
8. **Keep** legacy migration code in `onRehydrateStorage` (consumes `_auth_recovery_key_`, sends as header to session endpoint one last time).

### Phase 3: Server — Remove Token from Response Bodies

1. Login/Register: Remove `token` field from JSON responses.
2. Refresh: Return success status only, no token in body.
3. Verify: Response unchanged (already returns `{ valid, username }`).

### Phase 4: Cleanup (After Sufficient Rollout Time)

1. Remove `_auth_recovery_key_` migration code (after ~6 months, all legacy tokens will have expired or migrated).
2. Remove Authorization header fallback from `extractAuth` (or keep for programmatic API clients).
3. Remove `ensureAuthToken()` action from store.
4. Clean up `tokenExists()` bug (references undeclared `normalizedUsername`).
5. Remove `performReset()` preservation of `_auth_recovery_key_`.

---

## File-by-File Changes

### Server

| File | Change |
|------|--------|
| `api/_utils/auth/_extract.ts` | Flip to cookie-first, header-fallback |
| `api/_utils/_cookie.ts` | No change |
| `api/_utils/request-auth.ts` | No change |
| `api/_utils/api-handler.ts` | No change |
| `api/auth/login.ts` | Phase 1: add `cookieAuth: true`; Phase 3: remove `token` from body |
| `api/auth/register.ts` | Same as login |
| `api/auth/token/refresh.ts` | Phase 3: remove `token` from body; keep cookie set |
| `api/auth/token/verify.ts` | No change (already returns `valid` + `username`) |
| `api/auth/session.ts` | No change |
| `api/auth/logout.ts` | No change |
| `api/auth/tokens.ts` | No change |
| `api/_utils/auth/_validate.ts` | Fix `tokenExists()` bug (`normalizedUsername` → `username.toLowerCase()`) |
| `api/_utils/auth/_tokens.ts` | Consider adding `deleteTokenForUser(redis, username, token)` to avoid SCAN |

### Client

| File | Change |
|------|--------|
| `src/api/core.ts` | Remove `COOKIE_SESSION_MARKER`, `isRealToken()`; simplify `buildHeaders()` to never add auth headers |
| `src/api/auth.ts` | Update response types (no `token` field) |
| `src/stores/useChatsStore.ts` | Replace `authToken` with `isAuthenticated`; remove refresh logic, `buildOptionalAuthHeaders()`, `ensureAuthToken()`, `saveTokenRefreshTime()`; keep legacy migration in onRehydrateStorage |
| `src/hooks/useAuth.ts` | Simplify — no token storage, no `isRealToken` checks |
| `src/apps/chats/hooks/useTokenRefresh.ts` | Delete file |
| `src/utils/appletAuthBridge.ts` | Simplify — only forward username, rely on cookies |
| `src/apps/control-panels/hooks/useControlPanelsLogic.ts` | Phase 4: stop preserving `_auth_recovery_key_` |

### Tests

| File | Change |
|------|--------|
| `tests/test-auth.test.ts` (if exists) | Update expectations for login/register responses |
| New: `tests/test-cookie-auth.test.ts` | Verify cookie-only auth works end-to-end |

---

## Summary of Wins

| Metric | Current | Proposed |
|--------|---------|----------|
| Client auth modes | 3 (real token, cookie marker, null) | 2 (authenticated, not) |
| Client auth state fields | `authToken` + `username` | `isAuthenticated` + `username` |
| Auth header logic | Conditional per-request | None (cookies only) |
| Token refresh infrastructure | Hook + localStorage + hourly interval | None (server-managed) |
| Sentinel values | `__cookie_session__`, `"null"`, `"undefined"` | None |
| `isRealToken()` call sites | ~12 | 0 |
| `buildOptionalAuthHeaders()` call sites | ~8 | 0 |
| Files touched by auth branching | ~10 | ~3 (store, API core, applet bridge) |
| Legacy migration | Supported | Still supported (isolated, self-cleaning) |
