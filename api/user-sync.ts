import { Redis } from "@upstash/redis";
import { validateAuthToken, extractAuthFromRequest } from "./_utils/auth-validate";
import { getEffectiveOrigin, isAllowedOrigin, preflightIfNeeded } from "./_utils/cors";

export const config = {
  runtime: "edge",
};

const SYNC_KEY_PREFIX = "sync:user:";
const SYNC_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
const MAX_SYNC_BYTES = 1_000_000; // ~1MB safety cap
const MAX_SNAPSHOTS = 200; // hard cap to prevent abuse

type SyncEnvelope = {
  deviceId: string;
  generatedAt: number;
  snapshots: unknown[];
};

function getUserSyncKey(username: string) {
  return `${SYNC_KEY_PREFIX}${username.toLowerCase()}`;
}

async function requireAuth(request: Request, redis: Redis) {
  const { username, token } = extractAuthFromRequest(request);
  if (!username || !token) {
    return { ok: false as const, username: null };
  }
  const result = await validateAuthToken(redis, username, token);
  if (!result.valid) {
    return { ok: false as const, username: null };
  }
  return { ok: true as const, username };
}

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    const effectiveOrigin = getEffectiveOrigin(request);
    const resp = preflightIfNeeded(request, ["GET", "POST", "DELETE", "OPTIONS"], effectiveOrigin);
    if (resp) return resp;
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (!["pull", "push", "delete"].includes(action || "")) {
    return new Response("Invalid action", { status: 400 });
  }

  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL,
    token: process.env.REDIS_KV_REST_API_TOKEN,
  });

  const auth = await requireAuth(request, redis);
  if (!auth.ok || !auth.username) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Enforce CORS allowlist
  const effectiveOrigin = getEffectiveOrigin(request);
  if (!isAllowedOrigin(effectiveOrigin)) {
    return new Response("Forbidden", { status: 403 });
  }

  const storageKey = getUserSyncKey(auth.username);

  if (action === "pull") {
    const data = await redis.get<SyncEnvelope | null>(storageKey);
    return new Response(JSON.stringify({ snapshots: data?.snapshots ?? [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (action === "delete") {
    await redis.del(storageKey);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // push
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: SyncEnvelope | null = null;
  try {
    const text = await request.text();
    if (text.length > MAX_SYNC_BYTES) {
      return new Response("Payload too large", { status: 413 });
    }
    body = JSON.parse(text) as SyncEnvelope;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body || !body.deviceId || !Array.isArray(body.snapshots)) {
    return new Response("Invalid payload", { status: 400 });
  }

  if (body.snapshots.length > MAX_SNAPSHOTS) {
    return new Response("Too many snapshots", { status: 413 });
  }

  await redis.set(storageKey, body, { ex: SYNC_TTL_SECONDS });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
