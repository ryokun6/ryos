import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createRedis } from "../../../api/_utils/redis";
import {
  getStoredUserRecord,
  setStoredUserRecord,
  setUserEmailIndex,
  purgeUserAccount,
} from "../../../api/_utils/auth/index";
import { redisKeys } from "../../../src/shared/redisKeys";
import { getLinkedGoogleAccountByUsername } from "../../../api/_utils/google-oauth";
import type { GoogleOAuthPostMessage } from "../../../src/shared/contracts/google";
import { createContactFromDraft } from "../../../src/utils/contacts";
import {
  BASE_URL,
  ensureUserAuth,
  fetchWithAuth,
  fetchWithOrigin,
  getTokenFromAuthCookie,
  makeRateLimitBypassHeaders,
} from "../../helpers/test-utils";

const GOOGLE_MOCK_PORT = Number(process.env.GOOGLE_TEST_API_PORT || 3898);
const TEST_BASE_URL = process.env.API_URL || BASE_URL;
const RUN_ID = `${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`;

interface MockOAuthCodeGrant {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
  scopes: string[];
  refreshToken?: string;
  expiresIn?: number;
}

const codeGrants = new Map<string, MockOAuthCodeGrant>();
const accessTokens = new Map<
  string,
  {
    sub: string;
    email: string;
    emailVerified: boolean;
    name: string;
    picture: string | null;
    scopes: string[];
  }
>();
const refreshTokens = new Map<
  string,
  {
    sub: string;
    email: string;
    emailVerified: boolean;
    name: string;
    picture: string | null;
    scopes: string[];
  }
>();

const calendarEventsById = new Map<string, Record<string, unknown>>();
let calendarExpireSyncTokens = new Set<string>();

const peopleByResource = new Map<string, Record<string, unknown>>();
let peopleExpireSyncTokens = new Set<string>();
let forceNextContactUpdateStaleEtag = false;
const revokedTokens: string[] = [];

let mockServer: ReturnType<typeof Bun.serve> | null = null;
const createdUsernames = new Set<string>();
const createdGoogleSubs = new Set<string>();

function extractCallbackPayload(html: string): GoogleOAuthPostMessage {
  const match = /var payload = (\{[^\n]+\});/.exec(html);
  if (!match) {
    throw new Error(`Could not extract Google callback payload from HTML:\n${html.slice(0, 400)}`);
  }
  const normalizedJson = match[1]!
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u0026/g, "&");
  return JSON.parse(normalizedJson) as GoogleOAuthPostMessage;
}

beforeAll(() => {
  mockServer = Bun.serve({
    port: GOOGLE_MOCK_PORT,
    fetch: async (request) => {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // OAuth token exchange & refresh
      if (pathname === "/token" && request.method === "POST") {
        const raw = await request.text();
        const params = new URLSearchParams(raw);
        const grantType = params.get("grant_type");

        if (grantType === "authorization_code") {
          const code = params.get("code") || "";
          const verifier = params.get("code_verifier") || "";
          if (!verifier || verifier.length < 20) {
            return Response.json(
              { error: "invalid_grant", error_description: "Missing PKCE verifier" },
              { status: 400 }
            );
          }
          const grant = codeGrants.get(code);
          if (!grant) {
            return Response.json({ error: "invalid_grant" }, { status: 400 });
          }
          codeGrants.delete(code);

          const accessToken = `ya29.mock_${crypto.randomUUID()}`;
          accessTokens.set(accessToken, {
            sub: grant.sub,
            email: grant.email,
            emailVerified: grant.emailVerified,
            name: grant.name,
            picture: grant.picture,
            scopes: grant.scopes,
          });
          if (grant.refreshToken) {
            refreshTokens.set(grant.refreshToken, {
              sub: grant.sub,
              email: grant.email,
              emailVerified: grant.emailVerified,
              name: grant.name,
              picture: grant.picture,
              scopes: grant.scopes,
            });
          }

          return Response.json({
            access_token: accessToken,
            expires_in: grant.expiresIn ?? 3600,
            scope: grant.scopes.join(" "),
            token_type: "Bearer",
            ...(grant.refreshToken ? { refresh_token: grant.refreshToken } : {}),
          });
        }

        if (grantType === "refresh_token") {
          const rt = params.get("refresh_token") || "";
          const grant = refreshTokens.get(rt);
          if (!grant) {
            return Response.json({ error: "invalid_grant" }, { status: 400 });
          }
          const freshAccess = `ya29.refreshed_${crypto.randomUUID()}`;
          accessTokens.set(freshAccess, grant);
          return Response.json({
            access_token: freshAccess,
            expires_in: 3600,
            scope: grant.scopes.join(" "),
            token_type: "Bearer",
          });
        }

        return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
      }

      // OIDC UserInfo
      if (pathname === "/v1/userinfo" && request.method === "GET") {
        const authHeader = request.headers.get("authorization") || "";
        const token = authHeader.replace(/^Bearer\s+/i, "");
        const profile = accessTokens.get(token);
        if (!profile) {
          return Response.json({ error: "invalid_token" }, { status: 401 });
        }
        return Response.json({
          sub: profile.sub,
          email: profile.email,
          email_verified: profile.emailVerified,
          name: profile.name,
          picture: profile.picture,
        });
      }

      // Token revoke
      if (pathname === "/revoke" && request.method === "POST") {
        const raw = await request.text();
        const params = new URLSearchParams(raw);
        const tok = params.get("token");
        if (tok) revokedTokens.push(tok);
        return Response.json({ ok: true });
      }

      // Google Calendar v3 list & create
      if (pathname === "/calendar/v3/calendars/primary/events") {
        const authHeader = request.headers.get("authorization") || "";
        const token = authHeader.replace(/^Bearer\s+/i, "");
        if (!accessTokens.has(token)) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        if (request.method === "GET") {
          const syncToken = url.searchParams.get("syncToken");
          if (syncToken && calendarExpireSyncTokens.has(syncToken)) {
            calendarExpireSyncTokens.delete(syncToken);
            return Response.json({ error: { code: 410, message: "Sync token expired" } }, { status: 410 });
          }
          const items = [...calendarEventsById.values()];
          return Response.json({
            items: syncToken
              ? items.filter((item) => Boolean(item._changedSinceLastSync))
              : items.filter((item) => item.status !== "cancelled"),
            nextSyncToken: `cal_sync_${Date.now()}`,
          });
        }

        if (request.method === "POST") {
          const body = (await request.json()) as Record<string, unknown>;
          const id = `gevt_${crypto.randomUUID().slice(0, 8)}`;
          const nowIso = new Date().toISOString();
          const saved: Record<string, unknown> = {
            ...body,
            id,
            etag: `"etag_${id}_1"`,
            status: "confirmed",
            created: nowIso,
            updated: nowIso,
          };
          calendarEventsById.set(id, saved);
          return Response.json(saved);
        }
      }

      // Google Calendar v3 PATCH & DELETE single event
      if (pathname.startsWith("/calendar/v3/calendars/primary/events/")) {
        const eventId = decodeURIComponent(
          pathname.slice("/calendar/v3/calendars/primary/events/".length)
        );
        if (request.method === "PATCH") {
          const existing = calendarEventsById.get(eventId);
          if (!existing) {
            return Response.json({ error: "not_found" }, { status: 404 });
          }
          const patch = (await request.json()) as Record<string, unknown>;
          const updated: Record<string, unknown> = {
            ...existing,
            ...patch,
            id: eventId,
            etag: `"etag_${eventId}_2"`,
            updated: new Date().toISOString(),
          };
          calendarEventsById.set(eventId, updated);
          return Response.json(updated);
        }
        if (request.method === "DELETE") {
          calendarEventsById.delete(eventId);
          return new Response(null, { status: 204 });
        }
      }

      // Google People v1 connections.list
      if (pathname === "/v1/people/me/connections" && request.method === "GET") {
        const authHeader = request.headers.get("authorization") || "";
        const token = authHeader.replace(/^Bearer\s+/i, "");
        if (!accessTokens.has(token)) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const syncToken = url.searchParams.get("syncToken");
        if (syncToken && peopleExpireSyncTokens.has(syncToken)) {
          peopleExpireSyncTokens.delete(syncToken);
          return Response.json(
            { error: { code: 400, status: "FAILED_PRECONDITION", message: "EXPIRED_SYNC_TOKEN" } },
            { status: 400 }
          );
        }
        const allPeople = [...peopleByResource.values()];
        return Response.json({
          connections: syncToken
            ? allPeople.filter((p) => Boolean(p._changedSinceLastSync))
            : allPeople.filter((p) => !(p.metadata as { deleted?: boolean } | undefined)?.deleted),
          nextSyncToken: `ppl_sync_${Date.now()}`,
        });
      }

      // Google People v1 createContact
      if (pathname === "/v1/people:createContact" && request.method === "POST") {
        const body = (await request.json()) as Record<string, unknown>;
        const resourceName = `people/c_${crypto.randomUUID().slice(0, 8)}`;
        const nowIso = new Date().toISOString();
        const saved: Record<string, unknown> = {
          ...body,
          resourceName,
          etag: `%etag_${resourceName}_1`,
          metadata: {
            sources: [{ type: "CONTACT", updateTime: nowIso }],
          },
        };
        peopleByResource.set(resourceName, saved);
        return Response.json(saved);
      }

      // Google People v1 get / updateContact / deleteContact
      if (pathname.startsWith("/v1/people/")) {
        const rest = pathname.slice("/v1/".length); // e.g. people/c_123:updateContact
        if (rest.endsWith(":deleteContact") && request.method === "DELETE") {
          const resourceName = decodeURIComponent(
            rest.slice(0, -":deleteContact".length)
          );
          peopleByResource.delete(resourceName);
          return Response.json({});
        }
        if (rest.endsWith(":updateContact") && request.method === "PATCH") {
          const resourceName = decodeURIComponent(
            rest.slice(0, -":updateContact".length)
          );
          const existing = peopleByResource.get(resourceName);
          if (!existing) {
            return Response.json({ error: "not_found" }, { status: 404 });
          }
          const body = (await request.json()) as Record<string, unknown>;
          if (forceNextContactUpdateStaleEtag) {
            forceNextContactUpdateStaleEtag = false;
            existing.etag = `%etag_${resourceName}_fresh`;
            return Response.json(
              { error: { code: 400, message: "Etag mismatch" } },
              { status: 400 }
            );
          }
          if (body.etag && body.etag !== existing.etag) {
            return Response.json(
              { error: { code: 400, message: "Etag mismatch" } },
              { status: 400 }
            );
          }
          const updated: Record<string, unknown> = {
            ...existing,
            ...body,
            resourceName,
            etag: `%etag_${resourceName}_updated`,
            metadata: {
              sources: [{ type: "CONTACT", updateTime: new Date().toISOString() }],
            },
          };
          peopleByResource.set(resourceName, updated);
          return Response.json(updated);
        }
        if (request.method === "GET") {
          const resourceName = decodeURIComponent(rest);
          const existing = peopleByResource.get(resourceName);
          if (!existing) {
            return Response.json({ error: "not_found" }, { status: 404 });
          }
          return Response.json(existing);
        }
      }

      return Response.json({ error: `Unhandled mock path ${request.method} ${pathname}` }, { status: 404 });
    },
  });
});

afterAll(async () => {
  mockServer?.stop(true);
  try {
    const redis = createRedis();
    await Promise.all([
      ...[...createdGoogleSubs].map((sub) =>
        redis.del(redisKeys.integration.googleUsernameBySub(sub)).catch(() => {})
      ),
      ...[...createdUsernames].map((uname) =>
        purgeUserAccount(redis, uname).catch(() => {})
      ),
    ]);
  } catch {
    // Best-effort test cleanup
  }
}, 30_000);

describe("Google Sign-In, Account Linking & Two-Way Sync API", () => {
  test("GET /api/google/status returns unlinked for anonymous and new users", async () => {
    const anonRes = await fetchWithOrigin(`${TEST_BASE_URL}/api/google/status`, {
      method: "GET",
      headers: makeRateLimitBypassHeaders(),
    });
    expect(anonRes.status).toBe(200);
    const anonData = await anonRes.json();
    expect(anonData.configured).toBe(true);
    expect(anonData.linked).toBe(false);
    expect(anonData.account).toBeNull();
  });

  test("1A brand-new Google sign-in -> needs_username -> complete-signup (with collision retry) -> passwordless lifecycle -> returning Google login", async () => {
    const takenUsername = `gtaken_${RUN_ID}`;
    createdUsernames.add(takenUsername);
    const takenToken = await ensureUserAuth(takenUsername, "existing-pass-123");
    expect(takenToken).toBeTruthy();

    const newUsername = `gnew_${RUN_ID}`;
    createdUsernames.add(newUsername);
    const googleSub = `gsub_new_${RUN_ID}`;
    createdGoogleSubs.add(googleSub);

    // 1. Start Google Sign-In (2A basic scopes only: openid email profile)
    const startRes = await fetchWithOrigin(`${TEST_BASE_URL}/api/auth/google/start`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ mode: "signin", returnMode: "popup" }),
    });
    expect(startRes.status).toBe(200);
    const { authUrl } = (await startRes.json()) as { authUrl: string };
    const parsedAuthUrl = new URL(authUrl);
    expect(parsedAuthUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsedAuthUrl.searchParams.get("scope")).toBe("openid email profile");
    expect(parsedAuthUrl.searchParams.get("access_type")).toBeNull();
    const state = parsedAuthUrl.searchParams.get("state")!;
    expect(state).toBeTruthy();

    // 2. Callback with brand-new Google sub -> returns needs_username HTML payload
    const code1 = `code_${crypto.randomUUID()}`;
    codeGrants.set(code1, {
      sub: googleSub,
      email: `${takenUsername}@gmail.com`, // Collides with takenUsername -> suggests alternative!
      emailVerified: true,
      name: "New Google User",
      picture: "https://example.com/avatar.png",
      scopes: ["openid", "email", "profile"],
    });

    const cbRes = await fetchWithOrigin(
      `${TEST_BASE_URL}/api/auth/google/callback?code=${encodeURIComponent(code1)}&state=${encodeURIComponent(state)}`,
      { method: "GET", headers: makeRateLimitBypassHeaders() }
    );
    expect(cbRes.status).toBe(200);
    const cbPayload = extractCallbackPayload(await cbRes.text());
    expect(cbPayload.status).toBe("needs_username");
    if (cbPayload.status !== "needs_username") throw new Error("Expected needs_username");
    expect(cbPayload.suggestedUsername).not.toBe(takenUsername);

    // 3. Collision attempt on complete-signup returns 409 WITHOUT burning pendingToken
    const collisionRes = await fetchWithOrigin(
      `${TEST_BASE_URL}/api/auth/google/complete-signup`,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          pendingToken: cbPayload.pendingToken,
          username: takenUsername,
        }),
      }
    );
    expect(collisionRes.status).toBe(409);

    // 4. Retry with same pendingToken + available username succeeds & sets auth cookie
    const completeRes = await fetchWithOrigin(
      `${TEST_BASE_URL}/api/auth/google/complete-signup`,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          pendingToken: cbPayload.pendingToken,
          username: newUsername,
        }),
      }
    );
    expect(completeRes.status).toBe(201);
    const authToken = getTokenFromAuthCookie(completeRes);
    expect(authToken).toBeTruthy();

    // 5. Session reports hasPassword: false
    const sessionRes = await fetchWithAuth(
      `${TEST_BASE_URL}/api/auth/session`,
      newUsername,
      authToken!,
      { method: "GET", headers: makeRateLimitBypassHeaders() }
    );
    expect(sessionRes.status).toBe(200);
    const sessionData = await sessionRes.json();
    expect(sessionData.authenticated).toBe(true);
    expect(sessionData.hasPassword).toBe(false);

    // 6. Disconnecting Google while passwordless is blocked with 400 PASSWORD_REQUIRED_BEFORE_DISCONNECT
    const prematureDisconnect = await fetchWithAuth(
      `${TEST_BASE_URL}/api/google/disconnect`,
      newUsername,
      authToken!,
      { method: "POST", headers: makeRateLimitBypassHeaders() }
    );
    expect(prematureDisconnect.status).toBe(400);
    const prematureBody = await prematureDisconnect.json();
    expect(prematureBody.code).toBe("PASSWORD_REQUIRED_BEFORE_DISCONNECT");

    // 7. Passwordless email/set does NOT demand currentPassword (200 if mail sent, 502/503 if Resend unconfigured/sandbox)
    const emailSetRes = await fetchWithAuth(
      `${TEST_BASE_URL}/api/auth/email/set`,
      newUsername,
      authToken!,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ email: `${newUsername}@example.com` }),
      }
    );
    expect([200, 502, 503]).toContain(emailSetRes.status);

    // 8. Passwordless password/set sets initial password without currentPassword
    const setPwRes = await fetchWithAuth(
      `${TEST_BASE_URL}/api/auth/password/set`,
      newUsername,
      authToken!,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ password: "new-secure-password-123" }),
      }
    );
    expect(setPwRes.status).toBe(200);
    const rotatedToken = getTokenFromAuthCookie(setPwRes) || authToken!;

    // Subsequent password change WITHOUT currentPassword now fails 400
    const missingCurrentPwRes = await fetchWithAuth(
      `${TEST_BASE_URL}/api/auth/password/set`,
      newUsername,
      rotatedToken,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ password: "another-password-456" }),
      }
    );
    expect(missingCurrentPwRes.status).toBe(400);

    // 9. Returning Google Sign-In with same sub logs straight into newUsername
    const returnStart = await fetchWithOrigin(`${TEST_BASE_URL}/api/auth/google/start`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ mode: "signin", returnMode: "popup" }),
    });
    const returnState = new URL((await returnStart.json()).authUrl).searchParams.get(
      "state"
    )!;
    const code2 = `code_${crypto.randomUUID()}`;
    codeGrants.set(code2, {
      sub: googleSub,
      email: `${takenUsername}@gmail.com`,
      emailVerified: true,
      name: "New Google User",
      picture: null,
      scopes: ["openid", "email", "profile"],
    });
    const returnCb = await fetchWithOrigin(
      `${TEST_BASE_URL}/api/auth/google/callback?code=${encodeURIComponent(code2)}&state=${encodeURIComponent(returnState)}`,
      { method: "GET", headers: makeRateLimitBypassHeaders() }
    );
    expect(returnCb.status).toBe(200);
    const returnPayload = extractCallbackPayload(await returnCb.text());
    expect(returnPayload.status).toBe("authenticated");
    if (returnPayload.status === "authenticated") {
      expect(returnPayload.username).toBe(newUsername);
    }
  }, 30_000);

  test("1A verified recovery email auto-links existing account, while unverified email does NOT auto-link", async () => {
    const existingUser = `gverified_${RUN_ID}`;
    createdUsernames.add(existingUser);
    const tok = await ensureUserAuth(existingUser, "existing-pass-123");
    expect(tok).toBeTruthy();

    const verifiedEmail = `${existingUser}@verified.example.com`;
    const redis = createRedis();
    const currentRecord = (await getStoredUserRecord(redis, existingUser)) || {
      username: existingUser,
    };
    await setStoredUserRecord(redis, existingUser, {
      ...currentRecord,
      email: verifiedEmail,
      emailVerified: true,
      emailUpdatedAt: Date.now(),
    });
    await setUserEmailIndex(redis, verifiedEmail, existingUser);

    // First try with email_verified: false -> must NOT auto-link into existingUser!
    const unverifiedSub = `gsub_unver_${RUN_ID}`;
    createdGoogleSubs.add(unverifiedSub);
    const startUnver = await fetchWithOrigin(`${TEST_BASE_URL}/api/auth/google/start`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ mode: "signin", returnMode: "popup" }),
    });
    const stateUnver = new URL((await startUnver.json()).authUrl).searchParams.get("state")!;
    const codeUnver = `code_${crypto.randomUUID()}`;
    codeGrants.set(codeUnver, {
      sub: unverifiedSub,
      email: verifiedEmail,
      emailVerified: false,
      name: "Unverified Match",
      picture: null,
      scopes: ["openid", "email", "profile"],
    });
    const cbUnver = await fetchWithOrigin(
      `${TEST_BASE_URL}/api/auth/google/callback?code=${encodeURIComponent(codeUnver)}&state=${encodeURIComponent(stateUnver)}`,
      { method: "GET", headers: makeRateLimitBypassHeaders() }
    );
    const unverPayload = extractCallbackPayload(await cbUnver.text());
    expect(unverPayload.status).toBe("needs_username");

    // Now try with email_verified: true -> auto-links & logs into existingUser!
    const verifiedSub = `gsub_ver_${RUN_ID}`;
    createdGoogleSubs.add(verifiedSub);
    const startVer = await fetchWithOrigin(`${TEST_BASE_URL}/api/auth/google/start`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ mode: "signin", returnMode: "popup" }),
    });
    const stateVer = new URL((await startVer.json()).authUrl).searchParams.get("state")!;
    const codeVer = `code_${crypto.randomUUID()}`;
    codeGrants.set(codeVer, {
      sub: verifiedSub,
      email: verifiedEmail,
      emailVerified: true,
      name: "Verified Match",
      picture: "https://example.com/v.png",
      scopes: ["openid", "email", "profile"],
    });
    const cbVer = await fetchWithOrigin(
      `${TEST_BASE_URL}/api/auth/google/callback?code=${encodeURIComponent(codeVer)}&state=${encodeURIComponent(stateVer)}`,
      { method: "GET", headers: makeRateLimitBypassHeaders() }
    );
    const verPayload = extractCallbackPayload(await cbVer.text());
    expect(verPayload.status).toBe("authenticated");
    if (verPayload.status === "authenticated") {
      expect(verPayload.username).toBe(existingUser);
      expect(verPayload.autoLinked).toBe(true);
    }
    expect(getTokenFromAuthCookie(cbVer)).toBeTruthy();
  }, 30_000);

  test("passwordless Google-created account can self-delete cleanly and purges Google link keys", async () => {
    const delUser = `gdel_${RUN_ID}`;
    createdUsernames.add(delUser);
    const delSub = `gsub_del_${RUN_ID}`;
    createdGoogleSubs.add(delSub);

    const startRes = await fetchWithOrigin(`${TEST_BASE_URL}/api/auth/google/start`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ mode: "signin", returnMode: "popup" }),
    });
    const state = new URL((await startRes.json()).authUrl).searchParams.get("state")!;
    const code = `code_${crypto.randomUUID()}`;
    codeGrants.set(code, {
      sub: delSub,
      email: `${delUser}@example.com`,
      emailVerified: true,
      name: "Delete Me",
      picture: null,
      scopes: ["openid", "email", "profile"],
    });
    const cbRes = await fetchWithOrigin(
      `${TEST_BASE_URL}/api/auth/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
      { method: "GET", headers: makeRateLimitBypassHeaders() }
    );
    const payload = extractCallbackPayload(await cbRes.text());
    if (payload.status !== "needs_username") throw new Error("Expected needs_username");

    const signupRes = await fetchWithOrigin(
      `${TEST_BASE_URL}/api/auth/google/complete-signup`,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ pendingToken: payload.pendingToken, username: delUser }),
      }
    );
    expect(signupRes.status).toBe(201);
    const tok = getTokenFromAuthCookie(signupRes)!;

    const deleteRes = await fetchWithAuth(
      `${TEST_BASE_URL}/api/auth/account/delete`,
      delUser,
      tok,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ confirm: true, confirmUsername: delUser }),
      }
    );
    expect(deleteRes.status).toBe(200);

    const redis = createRedis();
    expect(await redis.get(redisKeys.integration.googleAccountByUsername(delUser))).toBeNull();
    expect(await redis.get(redisKeys.integration.googleUsernameBySub(delSub))).toBeNull();
  }, 30_000);

  test("2A incremental scopes, Calendar two-way sync (incl. 410 fallback), Contacts two-way sync (incl. stale etag & expired syncToken), token refresh, and disconnect", async () => {
    const syncUser = `gsync_${RUN_ID}`;
    createdUsernames.add(syncUser);
    const syncSub = `gsub_sync_${RUN_ID}`;
    createdGoogleSubs.add(syncSub);
    const token = (await ensureUserAuth(syncUser, "sync-user-pass-123"))!;
    expect(token).toBeTruthy();

    // 1. Link Google account with basic scopes first (2A)
    const linkStart = await fetchWithAuth(
      `${TEST_BASE_URL}/api/auth/google/start`,
      syncUser,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ mode: "link", returnMode: "popup" }),
      }
    );
    expect(linkStart.status).toBe(200);
    const linkState = new URL((await linkStart.json()).authUrl).searchParams.get("state")!;
    const linkCode = `code_${crypto.randomUUID()}`;
    codeGrants.set(linkCode, {
      sub: syncSub,
      email: `${syncUser}@gmail.com`,
      emailVerified: true,
      name: "Sync User",
      picture: null,
      scopes: ["openid", "email", "profile"],
    });
    const linkCb = await fetchWithOrigin(
      `${TEST_BASE_URL}/api/auth/google/callback?code=${encodeURIComponent(linkCode)}&state=${encodeURIComponent(linkState)}`,
      { method: "GET", headers: makeRateLimitBypassHeaders() }
    );
    expect(extractCallbackPayload(await linkCb.text()).status).toBe("linked");

    // Calling calendar sync BEFORE granting calendar scope returns 403 missing_scope
    const missingScopeRes = await fetchWithAuth(
      `${TEST_BASE_URL}/api/google/calendar/sync`,
      syncUser,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ timeZone: "America/Los_Angeles" }),
      }
    );
    expect(missingScopeRes.status).toBe(403);

    // 2. Request 2A incremental offline scopes for Calendar + Contacts
    const scopesStart = await fetchWithAuth(
      `${TEST_BASE_URL}/api/auth/google/start`,
      syncUser,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          mode: "scopes",
          features: ["calendar", "contacts"],
          returnMode: "popup",
        }),
      }
    );
    expect(scopesStart.status).toBe(200);
    const scopesUrl = new URL((await scopesStart.json()).authUrl);
    expect(scopesUrl.searchParams.get("access_type")).toBe("offline");
    expect(scopesUrl.searchParams.get("include_granted_scopes")).toBe("true");
    const scopesState = scopesUrl.searchParams.get("state")!;

    const fullScopes = [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/contacts",
    ];
    const scopesCode = `code_${crypto.randomUUID()}`;
    const refreshToken = `1//mock_refresh_${RUN_ID}`;
    codeGrants.set(scopesCode, {
      sub: syncSub,
      email: `${syncUser}@gmail.com`,
      emailVerified: true,
      name: "Sync User",
      picture: null,
      scopes: fullScopes,
      refreshToken,
      expiresIn: 1, // Force immediate token expiry so sync exercises refresh_token!
    });
    const scopesCb = await fetchWithOrigin(
      `${TEST_BASE_URL}/api/auth/google/callback?code=${encodeURIComponent(scopesCode)}&state=${encodeURIComponent(scopesState)}`,
      { method: "GET", headers: makeRateLimitBypassHeaders() }
    );
    const scopesPayload = extractCallbackPayload(await scopesCb.text());
    expect(scopesPayload.status).toBe("scopes_granted");

    // 3. Seed one remote Google Calendar event & run initial two-way Calendar sync (push + pull + refresh_token)
    calendarEventsById.clear();
    calendarEventsById.set("remote_evt_1", {
      id: "remote_evt_1",
      summary: "Remote Standup",
      start: { date: "2026-11-24" },
      end: { date: "2026-11-25" },
      status: "confirmed",
      updated: "2026-11-23T12:00:00.000Z",
    });

    const calSync1 = await fetchWithAuth(
      `${TEST_BASE_URL}/api/google/calendar/sync`,
      syncUser,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          timeZone: "America/Los_Angeles",
          upserts: [
            {
              id: "local_evt_1",
              title: "Created in ryOS",
              date: "2026-11-26",
              startTime: "09:00",
              endTime: "10:00",
              color: "blue",
              calendarId: "home",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        }),
      }
    );
    expect(calSync1.status).toBe(200);
    const calData1 = await calSync1.json();
    expect(calData1.fullSync).toBe(true);
    expect(calData1.pushed).toHaveLength(1);
    expect(calData1.pushed[0].event.googleEventId).toBeTruthy();
    expect(
      calData1.remoteUpserts.some(
        (e: { googleEventId?: string }) => e.googleEventId === "remote_evt_1"
      )
    ).toBe(true);

    // 4. Expire Calendar syncToken -> 410 Gone triggers automatic full-resync + PATCH + DELETE
    const redis = createRedis();
    const storedAfterCal1 = (await getLinkedGoogleAccountByUsername(
      redis,
      syncUser
    ))!;
    calendarExpireSyncTokens.add(storedAfterCal1.calendarSyncToken!);

    const createdGoogleEvent = calData1.pushed[0].event;
    const calSync2 = await fetchWithAuth(
      `${TEST_BASE_URL}/api/google/calendar/sync`,
      syncUser,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          timeZone: "America/Los_Angeles",
          upserts: [
            {
              ...createdGoogleEvent,
              title: "Updated in ryOS",
              updatedAt: Date.now() + 5000,
            },
          ],
          deletions: [
            {
              localId: "gcal_remote_evt_1",
              googleEventId: "remote_evt_1",
              googleCalendarId: "primary",
            },
          ],
        }),
      }
    );
    expect(calSync2.status).toBe(200);
    const calData2 = await calSync2.json();
    expect(calData2.fullSync).toBe(true);
    expect(calData2.deletedLocalIds).toEqual(["gcal_remote_evt_1"]);
    expect(calData2.pushed[0].event.title).toBe("Updated in ryOS");

    // 5. Contacts two-way sync: createContact + pull remote + stale-etag retry + expired syncToken fallback + deleteContact
    peopleByResource.clear();
    peopleByResource.set("people/c_remote_1", {
      resourceName: "people/c_remote_1",
      etag: "%etag_remote_1",
      names: [{ givenName: "Alan", familyName: "Turing", displayName: "Alan Turing" }],
      emailAddresses: [{ value: "alan@bletchley.uk", type: "work" }],
      metadata: {
        sources: [{ type: "CONTACT", updateTime: "2026-11-23T12:00:00.000Z" }],
      },
    });

    const localContact = {
      ...createContactFromDraft({
        firstName: "Margaret",
        lastName: "Hamilton",
        emails: [{ label: "work", value: "margaret@apollo.nasa.gov" }],
      }),
      id: "local_contact_1",
    };

    const pplSync1 = await fetchWithAuth(
      `${TEST_BASE_URL}/api/google/contacts/sync`,
      syncUser,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ upserts: [localContact] }),
      }
    );
    expect(pplSync1.status).toBe(200);
    const pplData1 = await pplSync1.json();
    expect(pplData1.fullSync).toBe(true);
    expect(pplData1.pushed).toHaveLength(1);
    expect(pplData1.pushed[0].contact.googleResourceName).toMatch(/^people\/c_/);
    expect(
      pplData1.remoteUpserts.some(
        (c: { googleResourceName?: string }) => c.googleResourceName === "people/c_remote_1"
      )
    ).toBe(true);

    // Force stale etag on updateContact + expired syncToken on connections.list -> both recover!
    const storedAfterPpl1 = (await getLinkedGoogleAccountByUsername(
      redis,
      syncUser
    ))!;
    peopleExpireSyncTokens.add(storedAfterPpl1.contactsSyncToken!);
    forceNextContactUpdateStaleEtag = true;

    const pushedContact = pplData1.pushed[0].contact;
    const pplSync2 = await fetchWithAuth(
      `${TEST_BASE_URL}/api/google/contacts/sync`,
      syncUser,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          upserts: [
            {
              ...pushedContact,
              organization: "MIT Instrumentation Lab",
              updatedAt: Date.now() + 5000,
            },
          ],
          deletions: [
            {
              localId: "gppl_c_remote_1",
              googleResourceName: "people/c_remote_1",
            },
          ],
        }),
      }
    );
    expect(pplSync2.status).toBe(200);
    const pplData2 = await pplSync2.json();
    expect(pplData2.fullSync).toBe(true);
    expect(pplData2.deletedLocalIds).toEqual(["gppl_c_remote_1"]);
    expect(pplData2.pushed[0].contact.organization).toBe("MIT Instrumentation Lab");

    // 6. Disconnect Google (user has a password, so 200 OK & token revoked & Redis cleaned up)
    const discRes = await fetchWithAuth(
      `${TEST_BASE_URL}/api/google/disconnect`,
      syncUser,
      token,
      { method: "POST", headers: makeRateLimitBypassHeaders() }
    );
    expect(discRes.status).toBe(200);
    expect(revokedTokens.length).toBeGreaterThan(0);

    const statusAfter = await fetchWithAuth(
      `${TEST_BASE_URL}/api/google/status`,
      syncUser,
      token,
      { method: "GET", headers: makeRateLimitBypassHeaders() }
    );
    const statusAfterJson = await statusAfter.json();
    expect(statusAfterJson.linked).toBe(false);
  }, 30_000);
});
