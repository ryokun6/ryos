/**
 * GET/PUT /api/sync/auto-sync-preference — cross-device Auto Sync toggle
 */
import { apiHandler } from "../_utils/api-handler.js";
import { autoSyncPreferenceKey } from "./_keys.js";

export const runtime = "nodejs";
export const maxDuration = 10;

interface PrefBody {
  enabled?: unknown;
}

export default apiHandler<PrefBody>(
  {
    methods: ["GET", "PUT"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ req, res, redis, user, body }): Promise<void> => {
    const username = user?.username || "";
    const key = autoSyncPreferenceKey(username);

    if ((req.method || "GET").toUpperCase() === "GET") {
      const raw = await redis.get<string | { enabled?: boolean }>(key);
      if (!raw) {
        res.status(200).json({ hasPreference: false, enabled: false });
        return;
      }
      const parsed =
        typeof raw === "string"
          ? (JSON.parse(raw) as { enabled?: boolean })
          : raw;
      res.status(200).json({
        hasPreference: true,
        enabled: parsed?.enabled === true,
      });
      return;
    }

    const enabled = body?.enabled === true;
    await redis.set(
      key,
      JSON.stringify({
        enabled,
        updatedAt: new Date().toISOString(),
      })
    );
    res.status(200).json({ ok: true, enabled });
  }
);
