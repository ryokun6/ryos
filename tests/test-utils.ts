/**
 * Shared test utilities for API endpoint tests.
 *
 * HTTP helpers (fetchWithOrigin, fetchWithAuth) are kept as-is.
 * The custom runTest / assert / printSummary framework is removed —
 * all suites now use bun:test's describe / test / expect directly.
 */

export const BASE_URL = process.env.API_URL || "http://localhost:3000";

/**
 * Helper to make fetch requests with localhost origin header
 */
export async function fetchWithOrigin(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has("Origin")) {
    headers.set("Origin", "http://localhost:3000");
  }
  return fetch(url, { ...options, headers });
}

/**
 * Helper to make authenticated requests
 */
export async function fetchWithAuth(
  url: string,
  username: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("Origin", "http://localhost:3000");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Username", username);
  return fetch(url, { ...options, headers });
}

/**
 * Rate-limit-bypass headers with a random IP each call.
 */
export const makeRateLimitBypassHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
  "X-Forwarded-For": `10.2.${Date.now() % 255}.${Math.floor(Math.random() * 255)}`,
});

/**
 * Register-or-login helper. Returns a token or null.
 */
export async function ensureUserAuth(
  username: string,
  password: string
): Promise<string | null> {
  const registerRes = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify({ username, password }),
  });

  if (registerRes.status === 201) {
    const data = await registerRes.json();
    return data.token ?? null;
  }

  if (registerRes.status === 409) {
    const loginRes = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ username, password }),
    });
    if (loginRes.ok) {
      const data = await loginRes.json();
      return data.token ?? null;
    }
  }

  return null;
}
