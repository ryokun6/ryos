import { apiHandler } from "./_utils/api-handler.js";
import {
  deleteMusicKitUserToken,
  normalizeMusicKitUserToken,
  readMusicKitUserToken,
  saveMusicKitUserToken,
} from "./_utils/musickit-user-token.js";

export const runtime = "nodejs";
export const maxDuration = 10;

interface MusicKitUserTokenBody {
  token?: unknown;
}

export default apiHandler<MusicKitUserTokenBody>(
  {
    methods: ["GET", "PUT", "DELETE"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ req, res, redis, user, body }): Promise<void> => {
    res.setHeader("Cache-Control", "no-store");

    const username = user?.username || "";
    const method = (req.method || "GET").toUpperCase();

    if (method === "GET") {
      const stored = await readMusicKitUserToken(redis, username);
      if (!stored) {
        res.status(200).json({ hasToken: false });
        return;
      }

      res.status(200).json({
        hasToken: true,
        token: stored.token,
        updatedAt: stored.updatedAt || null,
      });
      return;
    }

    if (method === "DELETE") {
      await deleteMusicKitUserToken(redis, username);
      res.status(200).json({ ok: true, hasToken: false });
      return;
    }

    const token = normalizeMusicKitUserToken(body?.token);
    if (!token) {
      res.status(400).json({ error: "Invalid Apple Music user token" });
      return;
    }

    const stored = await saveMusicKitUserToken(redis, username, token);
    res.status(200).json({
      ok: true,
      hasToken: true,
      updatedAt: stored.updatedAt,
    });
  }
);
