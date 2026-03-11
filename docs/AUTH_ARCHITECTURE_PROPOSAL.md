# Auth Flow Architecture — Cookie-Only Refactor (Implemented)

This document describes the auth architecture refactor from dual-mode
(in-memory token + cookie) to cookie-only. All changes described below
have been implemented.

---

## Before → After

| Area | Before | After |
|------|--------|-------|
| Client auth state | `authToken: string \| null` (3 modes: real token, `__cookie_session__`, null) | `isAuthenticated: boolean` |
| Login/register response body | `{ token, username }` | `{ username }` (token only in cookie) |
| API request headers | Conditional `Authorization: Bearer` + `X-Username` | None — cookie-only |
| Auth extraction (server) | Header-first, cookie-fallback | Cookie-first, header-fallback (legacy) |
| Client token refresh | Hourly hook + localStorage timestamps + proactive rotation | Removed — server refreshes TTL on every request |
| Token verify endpoint | Auth via `Authorization` header (middleware) | Accepts `{ username, token }` in POST body |
| Applet auth bridge | Forwards token + patches Authorization header | Sets `credentials: "include"` on applet fetch |

## Legacy Migration (Preserved)

The one-time legacy token → cookie migration path is preserved:

1. On rehydration, `consumeLegacyAuthToken()` reads and deletes `_auth_recovery_key_` from localStorage
2. If a legacy token exists, `restoreSessionFromCookie()` sends it as `Authorization: Bearer` to `GET /api/auth/session`
3. The server validates the token, sets the httpOnly cookie, and returns `{ authenticated: true }`
4. The client sets `isAuthenticated = true`

This path is self-cleaning (the localStorage key is deleted after read) and will naturally stop being exercised as users migrate.

## Server Changes

### `api/_utils/auth/_extract.ts`
Cookie-first extraction: parses `ryos_auth` cookie first, falls back to
`Authorization` header only for legacy migration and programmatic clients.

### `api/auth/login.ts`
Response body no longer includes `token`. Returns `{ username }` only.
Cookie is set via `Set-Cookie` header as before.

### `api/auth/register.ts`
Same — token removed from response body. Returns `{ user: { username } }`.

### `api/auth/token/verify.ts`
Changed from `auth: "required"` to `auth: "optional"` + `parseJsonBody: true`.
Accepts `{ username, token }` in POST body for cookie-only clients that
need to verify and adopt a token from another device.

### `api/auth/token/refresh.ts`
Response body changed from `{ token }` to `{ refreshed: true }`. New token
is only in the cookie.

## Client Changes

### `src/api/core.ts`
- Removed `COOKIE_SESSION_MARKER`, `isRealToken()`, `ApiAuthContext`
- `buildHeaders()` no longer adds auth headers
- `apiRequest()` dropped `auth` parameter

### `src/api/auth.ts`
- Response types updated (no `token` field)
- `verifyAuthToken()` sends token in POST body instead of auth header
- `logoutUser()` takes no parameters (cookie handles auth)
- `loginWithPassword()` no longer sends `oldToken`

### `src/api/rooms.ts`
- All functions dropped `auth` parameter (cookie handles auth)

### `src/stores/useChatsStore.ts`
- `authToken: string | null` → `isAuthenticated: boolean`
- `setAuthToken()` → `setAuthenticated()`
- Removed: `ensureAuthToken`, `refreshAuthToken`, `checkAndRefreshTokenIfNeeded`
- Removed: `buildOptionalAuthHeaders`, `TOKEN_REFRESH_THRESHOLD`, `TOKEN_LAST_REFRESH_KEY`
- Removed: `saveTokenRefreshTime`, `getTokenRefreshTime`
- Simplified `makeAuthenticatedRequest` — no retry/refresh, just 401 → force logout
- `logout()` no longer builds auth headers
- `createUser()` sets `isAuthenticated: true` instead of storing token
- All room/message API calls rely on cookies (no auth headers)

### `src/hooks/useAuth.ts`
- Returns `isAuthenticated` instead of `authToken`
- Login sets `isAuthenticated = true` + `username` (no token storage)
- Token verify uses body-based API, sets `isAuthenticated = true` on success

### `src/apps/chats/hooks/useTokenRefresh.ts`
Gutted to no-op stubs (`useTokenRefresh` and `useTokenAge`). Server
manages token/cookie TTL automatically on every authenticated request.

### `src/utils/appletAuthBridge.ts`
Simplified: no longer forwards tokens or builds Authorization headers.
Patches applet fetch to include `credentials: "include"` for cookie auth.

### All other component/hook files
~25 files updated to use `isAuthenticated` instead of `authToken`, and to
stop building `Authorization`/`X-Username` headers on API requests.

## What Stays the Same

- Redis token storage: `chat:token:user:{username}:{token}` with 90-day TTL
- Cookie format: `ryos_auth={username}:{token}`, HttpOnly, Path=/api, SameSite=Lax
- Password hashing: bcrypt in Redis
- Rate limiting: per-IP counters on register/login/refresh
- `apiHandler` wrapper: CORS, auth modes, body parsing
- Server-side TTL refresh: on every `validateAuth()` call
- Grace period: 30-day window for recently-rotated tokens
