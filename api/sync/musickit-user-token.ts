/**
 * Cross-device sync for the Apple Music **Music User Token**.
 *
 *   GET    /api/sync/musickit-user-token  → fetch stored Music User Token
 *   PUT    /api/sync/musickit-user-token  → save Music User Token + expiresAt
 *   DELETE /api/sync/musickit-user-token  → clear stored Music User Token
 *
 * MusicKit JS v3 persists the per-user "Music User Token" in
 * `localStorage`. Some embedded browsers — most prominently the Tesla
 * in-car browser — wipe `localStorage` on every page load, so the
 * iPod's Apple Music mode forces a re-authorize on every visit even
 * though the user is already signed in to ryOS.
 *
 * This endpoint mirrors the Music User Token into the user's ryOS
 * account so the iPod can restore the authorized session on reload
 * (or on a brand-new device the user signs in to). It lives under
 * `/api/sync/*` alongside the other cross-device sync primitives
 * (`auto-sync-preference`, `backup`, the per-domain sync routes) and
 * reuses the same auth pipeline + Redis key prefix (`sync:*`).
 *
 * Lifecycle:
 *
 *   - The token is bound to the **ryOS account**, not the device. We
 *     intentionally do not delete it from cloud on ryOS sign-out — the
 *     user expects the saved Apple Music auth to follow them between
 *     devices and across sign-out/sign-in cycles on the same device.
 *   - Stored **without a TTL**, matching the rest of `sync:*` state
 *     (auto-sync preference, per-domain redis state, etc.). User
 *     records in ryOS themselves have no TTL — only auth-token rows
 *     do — so a long-idle user who re-signs-in should find their
 *     synced state, including this token, intact.
 *   - The DELETE method is reserved for the Apple Music
 *     `unauthorize()` flow — the explicit "I want this gone" path.
 *   - Expired tokens (per the client-supplied `expiresAt`, which
 *     reflects Apple's own validity window) are filtered on read and
 *     the row is opportunistically pruned. This is the only
 *     server-side garbage-collection path.
 *
 * The stored token is no more sensitive than what MusicKit JS already
 * keeps in `localStorage` on the device, and the endpoint is
 * username-scoped via the standard `apiHandler` auth.
 */

import type { VercelResponse } from "@vercel/node";
import type { Redis } from "../_utils/redis.js";
import { apiHandler } from "../_utils/api-handler.js";
import { musickitUserTokenKey } from "./_keys.js";

export const runtime = "nodejs";
export const maxDuration = 10;

export const MAX_TOKEN_LENGTH = 4096;

export interface StoredUserToken {
  musicUserToken: string;
  expiresAt: number | null;
  storedAt: number;
}

interface PutBody {
  musicUserToken?: unknown;
  expiresAt?: unknown;
}

export function parseStoredToken(raw: unknown): StoredUserToken | null {
  if (!raw) return null;
  let candidate: unknown = raw;
  if (typeof raw === "string") {
    try {
      candidate = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== "object") return null;
  const obj = candidate as Partial<StoredUserToken>;
  if (typeof obj.musicUserToken !== "string" || obj.musicUserToken.length === 0) {
    return null;
  }
  return {
    musicUserToken: obj.musicUserToken,
    expiresAt:
      typeof obj.expiresAt === "number" && Number.isFinite(obj.expiresAt)
        ? obj.expiresAt
        : null,
    storedAt:
      typeof obj.storedAt === "number" && Number.isFinite(obj.storedAt)
        ? obj.storedAt
        : Date.now(),
  };
}

async function handleGet(
  res: VercelResponse,
  redis: Redis,
  username: string
): Promise<void> {
  const raw = await redis.get<string | StoredUserToken>(
    musickitUserTokenKey(username)
  );
  const parsed = parseStoredToken(raw);
  if (!parsed) {
    res.status(200).json({ musicUserToken: null });
    return;
  }
  // Treat expired tokens as missing — saves the client an extra round
  // trip and forces a fresh `authorize()` instead of trying a dead token.
  if (parsed.expiresAt && parsed.expiresAt <= Date.now()) {
    await redis.del(musickitUserTokenKey(username)).catch(() => undefined);
    res.status(200).json({ musicUserToken: null, reason: "expired" });
    return;
  }
  res.status(200).json({
    musicUserToken: parsed.musicUserToken,
    expiresAt: parsed.expiresAt,
    storedAt: parsed.storedAt,
  });
}

async function handlePut(
  res: VercelResponse,
  redis: Redis,
  username: string,
  body: PutBody | null
): Promise<void> {
  const token =
    body && typeof body.musicUserToken === "string"
      ? body.musicUserToken.trim()
      : "";
  if (!token) {
    res.status(400).json({ error: "musicUserToken is required" });
    return;
  }
  if (token.length > MAX_TOKEN_LENGTH) {
    res.status(400).json({ error: "musicUserToken too long" });
    return;
  }
  const expiresAt =
    body && typeof body.expiresAt === "number" && Number.isFinite(body.expiresAt)
      ? body.expiresAt
      : null;

  const payload: StoredUserToken = {
    musicUserToken: token,
    expiresAt,
    storedAt: Date.now(),
  };

  // Stored without a TTL on purpose — see the module header. Apple's
  // own validity window (carried in `expiresAt`) is the canonical
  // 'this token is dead' signal; we prune on read instead of relying
  // on a Redis-side timer.
  await redis.set(musickitUserTokenKey(username), JSON.stringify(payload));
  res.status(200).json({ ok: true, expiresAt });
}

async function handleDelete(
  res: VercelResponse,
  redis: Redis,
  username: string
): Promise<void> {
  await redis.del(musickitUserTokenKey(username));
  res.status(200).json({ ok: true });
}

export default apiHandler<PutBody>(
  {
    methods: ["GET", "PUT", "DELETE"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ req, res, redis, user }): Promise<void> => {
    const username = user?.username;
    if (!username) {
      // apiHandler with auth: "required" already enforces this, but the
      // type system can't see through that — keep a defensive check so
      // the Redis key never collapses to `sync:musickit-user-token:`.
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const method = (req.method || "GET").toUpperCase();

    if (method === "GET") {
      await handleGet(res, redis, username);
      return;
    }
    if (method === "PUT") {
      await handlePut(res, redis, username, (req.body as PutBody) ?? null);
      return;
    }
    if (method === "DELETE") {
      await handleDelete(res, redis, username);
      return;
    }
    res.status(405).json({ error: "Method not allowed" });
  }
);
