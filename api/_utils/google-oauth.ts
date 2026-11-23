import type { Redis, RedisLike } from "./redis.js";
import { getAppPublicOrigin } from "./runtime-config.js";
import { isProfaneUsername } from "./_validation.js";
import { getStoredUserRecord } from "./auth/_user-record.js";
import {
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  USERNAME_REGEX,
} from "../../src/shared/validation.js";
import {
  redisKeys,
  sha256RedisIdentifier,
} from "../../src/shared/redisKeys.js";
import {
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_CONTACTS_SCOPE,
  GOOGLE_SIGNIN_SCOPES,
  type GoogleLinkedAccountPublic,
  type GoogleOAuthMode,
  type GoogleOAuthPostMessage,
  type GoogleOAuthReturnMode,
  type GooglePendingProfile,
  type GoogleSyncFeature,
} from "../../src/shared/contracts/google.js";

export const GOOGLE_OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const GOOGLE_PENDING_SIGNUP_TTL_SECONDS = 15 * 60;
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60_000;
const UPSTREAM_FETCH_TIMEOUT_MS = 15_000;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleApiUrls {
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  revokeUrl: string;
  calendarBaseUrl: string;
  peopleBaseUrl: string;
}

export interface GoogleOAuthStateRecord {
  codeVerifier: string;
  mode: GoogleOAuthMode;
  username: string | null;
  scopes: string[];
  clientOrigin: string;
  returnMode: GoogleOAuthReturnMode;
  redirectUri: string;
  createdAt: number;
}

export interface PendingGoogleSignupRecord {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  scopes: string[];
  suggestedUsername: string;
  createdAt: number;
}

export interface StoredGoogleAccountRecord {
  username: string;
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  scopes: string[];
  linkedAt: number;
  updatedAt: number;
  calendarSyncToken?: string | null;
  calendarLastSyncedAt?: number | null;
  contactsSyncToken?: string | null;
  contactsLastSyncedAt?: number | null;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

export interface GoogleUserInfo {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export class GoogleApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.code = code;
  }
}

export function isGoogleOAuthConfigured(): boolean {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return Boolean(clientId && clientSecret);
}

export function getGoogleRedirectUri(fallbackOrigin?: string | null): string {
  const explicit = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (explicit) {
    return explicit;
  }
  return `${getAppPublicOrigin(fallbackOrigin)}/api/auth/google/callback`;
}

export function getGoogleOAuthConfig(
  fallbackOrigin?: string | null
): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return null;
  }
  return {
    clientId,
    clientSecret,
    redirectUri: getGoogleRedirectUri(fallbackOrigin),
  };
}

export function getGoogleApiUrls(): GoogleApiUrls {
  const testBase = process.env.GOOGLE_TEST_API_BASE_URL?.trim().replace(
    /\/+$/,
    ""
  );
  if (testBase) {
    return {
      authorizeUrl: `${testBase}/o/oauth2/v2/auth`,
      tokenUrl: `${testBase}/token`,
      userInfoUrl: `${testBase}/v1/userinfo`,
      revokeUrl: `${testBase}/revoke`,
      calendarBaseUrl: `${testBase}/calendar/v3`,
      peopleBaseUrl: `${testBase}/v1`,
    };
  }
  return {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    calendarBaseUrl: "https://www.googleapis.com/calendar/v3",
    peopleBaseUrl: "https://people.googleapis.com/v1",
  };
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function generateRandomBase64Url(byteLength: number = 32): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function createPkceChallenge(verifier: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return toBase64Url(new Uint8Array(digest));
}

export function normalizeScopeList(scopes: Iterable<string>): string[] {
  const seen = new Set<string>();
  for (const raw of scopes) {
    for (const token of raw.split(/\s+/)) {
      const trimmed = token.trim();
      if (trimmed) {
        seen.add(trimmed);
      }
    }
  }
  return Array.from(seen);
}

export function scopesForFeatures(
  features: readonly GoogleSyncFeature[] = []
): string[] {
  const scopes: string[] = [...GOOGLE_SIGNIN_SCOPES];
  if (features.includes("calendar")) {
    scopes.push(GOOGLE_CALENDAR_SCOPE);
  }
  if (features.includes("contacts")) {
    scopes.push(GOOGLE_CONTACTS_SCOPE);
  }
  return normalizeScopeList(scopes);
}

export function hasGoogleScope(
  scopes: readonly string[],
  requiredScope: string
): boolean {
  return scopes.includes(requiredScope);
}

export function toPublicGoogleAccount(
  record: StoredGoogleAccountRecord
): GoogleLinkedAccountPublic {
  return {
    email: record.email,
    emailVerified: record.emailVerified,
    name: record.name,
    picture: record.picture,
    scopes: record.scopes,
    hasCalendarScope: hasGoogleScope(record.scopes, GOOGLE_CALENDAR_SCOPE),
    hasContactsScope: hasGoogleScope(record.scopes, GOOGLE_CONTACTS_SCOPE),
    linkedAt: record.linkedAt,
    calendarLastSyncedAt: record.calendarLastSyncedAt ?? null,
    contactsLastSyncedAt: record.contactsLastSyncedAt ?? null,
  };
}

function parseJsonRecord<T>(raw: unknown): T | null {
  if (!raw) return null;
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
  } catch {
    return null;
  }
}

export async function createGoogleOAuthState(
  redis: RedisLike,
  input: Omit<GoogleOAuthStateRecord, "codeVerifier" | "createdAt">,
  ttlSeconds: number = GOOGLE_OAUTH_STATE_TTL_SECONDS
): Promise<{
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}> {
  const state = generateRandomBase64Url(32);
  const codeVerifier = generateRandomBase64Url(48);
  const codeChallenge = await createPkceChallenge(codeVerifier);
  const stateHash = await sha256RedisIdentifier(state);
  const record: GoogleOAuthStateRecord = {
    ...input,
    username: input.username ? input.username.toLowerCase() : null,
    scopes: normalizeScopeList(input.scopes),
    codeVerifier,
    createdAt: Date.now(),
  };

  await redis.set(
    redisKeys.auth.googleOAuthState(stateHash),
    JSON.stringify(record),
    { ex: ttlSeconds }
  );

  return { state, codeVerifier, codeChallenge };
}

export async function consumeGoogleOAuthState(
  redis: RedisLike,
  state: string
): Promise<GoogleOAuthStateRecord | null> {
  if (!state || typeof state !== "string") return null;
  const stateHash = await sha256RedisIdentifier(state);
  const key = redisKeys.auth.googleOAuthState(stateHash);
  const raw = await redis.get<string>(key);
  await redis.del(key);

  const parsed = parseJsonRecord<GoogleOAuthStateRecord>(raw);
  if (
    !parsed ||
    typeof parsed.codeVerifier !== "string" ||
    typeof parsed.clientOrigin !== "string" ||
    typeof parsed.redirectUri !== "string" ||
    (parsed.mode !== "signin" &&
      parsed.mode !== "link" &&
      parsed.mode !== "scopes")
  ) {
    return null;
  }
  return parsed;
}

export function buildGoogleAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes: readonly string[];
  mode: GoogleOAuthMode;
  forceOfflineConsent?: boolean;
  loginHint?: string | null;
}): string {
  const { authorizeUrl } = getGoogleApiUrls();
  const url = new URL(authorizeUrl);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", normalizeScopeList(params.scopes).join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  if (params.mode === "scopes") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    if (params.forceOfflineConsent) {
      url.searchParams.set("prompt", "consent");
    }
    if (params.loginHint) {
      url.searchParams.set("login_hint", params.loginHint);
    }
  } else {
    url.searchParams.set("prompt", "select_account");
  }

  return url.toString();
}

export async function createPendingGoogleSignup(
  redis: RedisLike,
  record: Omit<PendingGoogleSignupRecord, "createdAt">,
  ttlSeconds: number = GOOGLE_PENDING_SIGNUP_TTL_SECONDS
): Promise<string> {
  const pendingToken = generateRandomBase64Url(32);
  const pendingHash = await sha256RedisIdentifier(pendingToken);
  const fullRecord: PendingGoogleSignupRecord = {
    ...record,
    createdAt: Date.now(),
  };
  await redis.set(
    redisKeys.auth.googlePendingSignup(pendingHash),
    JSON.stringify(fullRecord),
    { ex: ttlSeconds }
  );
  return pendingToken;
}

export async function getPendingGoogleSignup(
  redis: RedisLike,
  pendingToken: string
): Promise<PendingGoogleSignupRecord | null> {
  if (!pendingToken || typeof pendingToken !== "string") return null;
  const pendingHash = await sha256RedisIdentifier(pendingToken);
  const raw = await redis.get<string>(
    redisKeys.auth.googlePendingSignup(pendingHash)
  );
  const parsed = parseJsonRecord<PendingGoogleSignupRecord>(raw);
  if (
    !parsed ||
    typeof parsed.sub !== "string" ||
    typeof parsed.accessToken !== "string"
  ) {
    return null;
  }
  return parsed;
}

export async function deletePendingGoogleSignup(
  redis: RedisLike,
  pendingToken: string
): Promise<void> {
  if (!pendingToken || typeof pendingToken !== "string") return;
  const pendingHash = await sha256RedisIdentifier(pendingToken);
  await redis.del(redisKeys.auth.googlePendingSignup(pendingHash));
}

export function sanitizeUsernameCandidate(raw: string | null | undefined): string {
  const cleaned = (raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  let base = cleaned.replace(/^[^a-z]+/, "");
  if (!base) {
    base = "user";
  }
  if (base.length < MIN_USERNAME_LENGTH) {
    base = `${base}${"user".slice(0, MIN_USERNAME_LENGTH - base.length)}`;
  }
  if (base.length > MAX_USERNAME_LENGTH) {
    base = base.slice(0, MAX_USERNAME_LENGTH).replace(/[-_]+$/g, "");
  }
  if (
    base.length < MIN_USERNAME_LENGTH ||
    !USERNAME_REGEX.test(base) ||
    isProfaneUsername(base)
  ) {
    return "ryos_user";
  }
  return base;
}

export async function suggestAvailableGoogleUsername(
  redis: Redis,
  profile: { email?: string | null; name?: string | null }
): Promise<string> {
  const emailLocal = profile.email ? profile.email.split("@")[0] : "";
  const base = sanitizeUsernameCandidate(emailLocal || profile.name || "user");

  const existing = await getStoredUserRecord(redis, base);
  if (!existing && base !== "ryo") {
    return base;
  }

  for (let suffix = 2; suffix <= 99; suffix += 1) {
    const suffixText = String(suffix);
    const maxPrefixLen = MAX_USERNAME_LENGTH - suffixText.length;
    const prefix = base.slice(0, maxPrefixLen).replace(/[-_]+$/g, "") || "user";
    const candidate = `${prefix}${suffixText}`;
    if (
      candidate !== "ryo" &&
      USERNAME_REGEX.test(candidate) &&
      !isProfaneUsername(candidate)
    ) {
      const collision = await getStoredUserRecord(redis, candidate);
      if (!collision) {
        return candidate;
      }
    }
  }

  const randBuf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(randBuf);
  const randomSuffix = 1000 + (randBuf[0]! % 9000);
  const prefix = base.slice(0, MAX_USERNAME_LENGTH - 5).replace(/[-_]+$/g, "") || "user";
  return `${prefix}_${randomSuffix}`;
}

export async function getLinkedGoogleAccountByUsername(
  redis: RedisLike,
  username: string
): Promise<StoredGoogleAccountRecord | null> {
  if (!username) return null;
  const raw = await redis.get<string>(
    redisKeys.integration.googleAccountByUsername(username.toLowerCase())
  );
  const parsed = parseJsonRecord<StoredGoogleAccountRecord>(raw);
  if (
    !parsed ||
    typeof parsed.username !== "string" ||
    typeof parsed.sub !== "string" ||
    typeof parsed.linkedAt !== "number"
  ) {
    return null;
  }
  return {
    ...parsed,
    username: parsed.username.toLowerCase(),
    scopes: Array.isArray(parsed.scopes)
      ? normalizeScopeList(parsed.scopes)
      : [],
  };
}

export async function getGoogleUsernameBySub(
  redis: RedisLike,
  sub: string
): Promise<string | null> {
  if (!sub) return null;
  const raw = await redis.get<string>(
    redisKeys.integration.googleUsernameBySub(sub)
  );
  return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : null;
}

export async function saveLinkedGoogleAccount(
  redis: RedisLike,
  record: StoredGoogleAccountRecord
): Promise<StoredGoogleAccountRecord> {
  const normalizedUsername = record.username.toLowerCase();
  const existing = await getLinkedGoogleAccountByUsername(
    redis,
    normalizedUsername
  );
  if (existing && existing.sub !== record.sub) {
    await redis.del(redisKeys.integration.googleUsernameBySub(existing.sub));
  }

  const normalizedRecord: StoredGoogleAccountRecord = {
    ...record,
    username: normalizedUsername,
    scopes: normalizeScopeList(record.scopes),
  };

  await redis.set(
    redisKeys.integration.googleAccountByUsername(normalizedUsername),
    JSON.stringify(normalizedRecord)
  );
  await redis.set(
    redisKeys.integration.googleUsernameBySub(normalizedRecord.sub),
    normalizedUsername
  );

  return normalizedRecord;
}

export async function unlinkGoogleAccountByUsername(
  redis: RedisLike,
  username: string,
  options: { revokeRemoteToken?: boolean } = {}
): Promise<StoredGoogleAccountRecord | null> {
  const normalizedUsername = username.toLowerCase();
  const existing = await getLinkedGoogleAccountByUsername(
    redis,
    normalizedUsername
  );
  if (!existing) {
    return null;
  }

  if (options.revokeRemoteToken) {
    const tokenToRevoke = existing.refreshToken || existing.accessToken;
    if (tokenToRevoke) {
      await revokeGoogleTokenBestEffort(tokenToRevoke);
    }
  }

  await redis.del(
    redisKeys.integration.googleAccountByUsername(normalizedUsername),
    redisKeys.integration.googleUsernameBySub(existing.sub)
  );
  return existing;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = UPSTREAM_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function exchangeGoogleCodeForTokens(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<GoogleTokenResponse> {
  const { tokenUrl } = getGoogleApiUrls();
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
    code_verifier: params.codeVerifier,
  });

  const response = await fetchWithTimeout(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => null)) as
    | (GoogleTokenResponse & { error?: string; error_description?: string })
    | null;

  if (!response.ok || !payload?.access_token) {
    throw new GoogleApiError(
      400,
      "token_exchange_failed",
      payload?.error_description ||
        payload?.error ||
        "Failed to exchange Google authorization code"
    );
  }

  return payload;
}

export async function fetchGoogleUserInfo(
  accessToken: string
): Promise<GoogleUserInfo> {
  const { userInfoUrl } = getGoogleApiUrls();
  const response = await fetchWithTimeout(userInfoUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const payload = (await response.json().catch(() => null)) as {
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
    name?: unknown;
    picture?: unknown;
  } | null;

  if (!response.ok || !payload || typeof payload.sub !== "string" || !payload.sub.trim()) {
    throw new GoogleApiError(
      400,
      "userinfo_failed",
      "Failed to verify Google account profile"
    );
  }

  return {
    sub: payload.sub.trim(),
    email:
      typeof payload.email === "string" && payload.email.trim()
        ? payload.email.trim().toLowerCase()
        : null,
    emailVerified: payload.email_verified === true,
    name:
      typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim()
        : null,
    picture:
      typeof payload.picture === "string" && payload.picture.trim()
        ? payload.picture.trim()
        : null,
  };
}

export async function revokeGoogleTokenBestEffort(token: string): Promise<void> {
  if (!token) return;
  try {
    const { revokeUrl } = getGoogleApiUrls();
    const body = new URLSearchParams({ token });
    await fetchWithTimeout(
      revokeUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
      5_000
    );
  } catch {
    // Best-effort revocation on disconnect/delete; local unlink still succeeds.
  }
}

export async function getValidGoogleAccessToken(
  redis: RedisLike,
  username: string,
  requiredScope?: string
): Promise<{ accessToken: string; account: StoredGoogleAccountRecord }> {
  const config = getGoogleOAuthConfig();
  if (!config) {
    throw new GoogleApiError(
      503,
      "not_configured",
      "Google integration is not configured on this server."
    );
  }

  const account = await getLinkedGoogleAccountByUsername(redis, username);
  if (!account) {
    throw new GoogleApiError(
      400,
      "not_linked",
      "No Google account is linked to your ryOS account."
    );
  }

  if (requiredScope && !hasGoogleScope(account.scopes, requiredScope)) {
    throw new GoogleApiError(
      403,
      "missing_scope",
      "Additional Google permission is required."
    );
  }

  const now = Date.now();
  const isFresh =
    Boolean(account.accessToken) &&
    (!account.expiresAt ||
      account.expiresAt - now > ACCESS_TOKEN_REFRESH_BUFFER_MS);

  if (isFresh && account.accessToken) {
    return { accessToken: account.accessToken, account };
  }

  if (!account.refreshToken) {
    throw new GoogleApiError(
      401,
      "reauth_required",
      "Google session expired. Please reconnect your Google account."
    );
  }

  const { tokenUrl } = getGoogleApiUrls();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: account.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetchWithTimeout(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => null)) as
    | (GoogleTokenResponse & { error?: string; error_description?: string })
    | null;

  if (!response.ok || !payload?.access_token) {
    const isRevoked =
      response.status === 400 ||
      response.status === 401 ||
      payload?.error === "invalid_grant";
    throw new GoogleApiError(
      isRevoked ? 401 : 502,
      isRevoked ? "reauth_required" : "token_refresh_failed",
      isRevoked
        ? "Google authorization expired or was revoked. Please reconnect Google."
        : "Failed to refresh Google access token."
    );
  }

  const updatedScopes = payload.scope
    ? normalizeScopeList([...account.scopes, payload.scope])
    : account.scopes;
  const expiresAt =
    typeof payload.expires_in === "number" && payload.expires_in > 0
      ? Date.now() + payload.expires_in * 1000
      : null;

  const updatedAccount = await saveLinkedGoogleAccount(redis, {
    ...account,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || account.refreshToken,
    expiresAt,
    scopes: updatedScopes,
    updatedAt: Date.now(),
  });

  return {
    accessToken: payload.access_token,
    account: updatedAccount,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJsonForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function renderGoogleOAuthCallbackHtml(options: {
  message: GoogleOAuthPostMessage | null;
  clientOrigin: string | null;
  returnMode?: GoogleOAuthReturnMode;
  fallbackErrorText?: string;
}): { html: string; csp: string } {
  const nonce = generateRandomBase64Url(16);
  const title =
    options.message?.status === "error" || !options.message
      ? "Google Sign-In Failed"
      : "Google Connected";
  const subtitle =
    options.message?.status === "error"
      ? options.message.error
      : !options.message
        ? options.fallbackErrorText ||
          "This sign-in session expired or is invalid. Please close this window and try again."
        : "Returning to ryOS...";

  const scriptBody =
    options.message && options.clientOrigin
      ? `(function () {
  var payload = ${safeJsonForInlineScript(options.message)};
  var targetOrigin = ${safeJsonForInlineScript(options.clientOrigin)};
  var returnMode = ${safeJsonForInlineScript(options.returnMode || "popup")};
  try {
    if (returnMode === "popup" && window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, targetOrigin);
      window.close();
      return;
    }
  } catch (e) {}
  try {
    if (window.location.origin === targetOrigin) {
      sessionStorage.setItem("ryos:google-oauth-result", JSON.stringify(payload));
    }
  } catch (e) {}
  try {
    var redirectUrl = new URL("/", targetOrigin);
    redirectUrl.searchParams.set("google_oauth", payload.status);
    window.location.replace(redirectUrl.toString());
  } catch (e) {}
})();`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — ryOS</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Lucida Grande", sans-serif;
      background: #f4f4f5;
      color: #18181b;
    }
    .card {
      max-width: 360px;
      padding: 24px;
      border-radius: 10px;
      background: #fff;
      border: 1px solid #d4d4d8;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
      text-align: center;
    }
    h1 { font-size: 15px; margin: 0 0 8px; }
    p { font-size: 12px; color: #52525b; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(subtitle)}</p>
  </div>
  ${scriptBody ? `<script nonce="${nonce}">${scriptBody}</script>` : ""}
</body>
</html>`;

  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-ancestors 'none'`;
  return { html, csp };
}

export function extractPendingProfile(
  userInfo: GoogleUserInfo
): GooglePendingProfile {
  return {
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture,
  };
}
