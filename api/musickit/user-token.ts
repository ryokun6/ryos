import type { VercelResponse } from "@vercel/node";

import { apiHandler } from "../_utils/api-handler.js";
import {
  deleteMusicKitUserToken,
  getMusicKitUserToken,
  markMusicKitUserTokenValidated,
  normalizeMusicUserToken,
  storeMusicKitUserToken,
} from "../_utils/_musickit-user-token.js";

export const runtime = "nodejs";
export const maxDuration = 10;

interface MusicKitUserTokenBody {
  musicUserToken?: unknown;
  validated?: unknown;
}

function requireUser(
  user: { username: string } | null,
  res: VercelResponse
): user is { username: string } {
  if (user) return true;
  res.status(401).json({ error: "Unauthorized - missing credentials" });
  return false;
}

export default apiHandler<MusicKitUserTokenBody>(
  {
    methods: ["GET", "PUT", "DELETE"],
    auth: "optional",
    parseJsonBody: true,
  },
  async ({ req, res, redis, user, body }) => {
    const method = (req.method || "GET").toUpperCase();

    if (method === "GET") {
      if (!user) {
        res.status(200).json({
          authenticated: false,
          hasToken: false,
        });
        return;
      }

      const record = await getMusicKitUserToken(redis, user.username);
      res.status(200).json(
        record
          ? {
              authenticated: true,
              hasToken: true,
              musicUserToken: record.token,
              updatedAt: record.updatedAt,
              lastValidatedAt: record.lastValidatedAt ?? null,
            }
          : {
              authenticated: true,
              hasToken: false,
            }
      );
      return;
    }

    if (!requireUser(user, res)) return;

    if (method === "DELETE") {
      await deleteMusicKitUserToken(redis, user.username);
      res.status(200).json({ ok: true, hasToken: false });
      return;
    }

    const token = normalizeMusicUserToken(body?.musicUserToken);
    if (!token) {
      res.status(400).json({ error: "Invalid Apple Music user token" });
      return;
    }

    let record = await storeMusicKitUserToken(redis, user.username, token);
    if (body?.validated === true) {
      record =
        (await markMusicKitUserTokenValidated(redis, user.username)) ?? record;
    }

    res.status(200).json({
      ok: true,
      hasToken: true,
      updatedAt: record.updatedAt,
      lastValidatedAt: record.lastValidatedAt ?? null,
    });
  }
);
