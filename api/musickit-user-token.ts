/**
 * Cloud-synced Apple Music user token (Music User Token) storage.
 *
 *   GET    /api/musickit-user-token  → fetch stored Music User Token
 *   PUT    /api/musickit-user-token  → save Music User Token + expiresAt
 *   DELETE /api/musickit-user-token  → clear stored Music User Token
 *
 * Why this exists:
 *
 *   MusicKit JS v3 normally persists the per-user "Music User Token" in
 *   `localStorage` (and a cookie on apple-music origins). Some embedded
 *   browsers — most notably the Tesla in-car browser — wipe localStorage
 *   on every page load, so the user is forced to re-authorize Apple
 *   Music every single time they open the iPod app.
 *
 *   This endpoint mirrors the Music User Token into the user's ryOS
 *   account so the iPod can restore the authorized session on reload
 *   without prompting again. The stored token is no more sensitive than
 *   what MusicKit JS already keeps in localStorage on the device, and
 *   it's scoped per ryOS user via the standard `apiHandler` auth.
 *
 *   Storage: Redis key `musickit:user-token:<username>` (90-day TTL,
 *   matched to the user-record TTL so a deleted user's stored token
 *   doesn't outlive their account).
 */

import type { VercelResponse } from "@vercel/node";
import type { Redis } from "./_utils/redis.js";
import { apiHandler } from "./_utils/api-handler.js";
import { USER_TTL_SECONDS } from "./_utils/auth/index.js";

export const runtime = "nodejs";
export const maxDuration = 10;

export const TOKEN_KEY_PREFIX = "musickit:user-token:";
export const STORE_TTL_SECONDS = USER_TTL_SECONDS;
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

export function getTokenKey(username: string): string {
  return `${TOKEN_KEY_PREFIX}${username.toLowerCase()}`;
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
  const raw = await redis.get<string | StoredUserToken>(getTokenKey(username));
  const parsed = parseStoredToken(raw);
  if (!parsed) {
    res.status(200).json({ musicUserToken: null });
    return;
  }
  // Treat expired tokens as missing — saves the client an extra round trip
  // and forces a fresh `authorize()` instead of trying a dead token.
  if (parsed.expiresAt && parsed.expiresAt <= Date.now()) {
    await redis.del(getTokenKey(username)).catch(() => undefined);
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

  await redis.set(getTokenKey(username), JSON.stringify(payload), {
    ex: STORE_TTL_SECONDS,
  });
  res.status(200).json({ ok: true, expiresAt });
}

async function handleDelete(
  res: VercelResponse,
  redis: Redis,
  username: string
): Promise<void> {
  await redis.del(getTokenKey(username));
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
      // type system can't see through that — keep a defensive check so the
      // Redis key never collapses to `musickit:user-token:`.
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
