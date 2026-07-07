import { apiHandler } from "../../_utils/api-handler.js";
import { readSyncChanges } from "./_core.js";

export default apiHandler(
  {
    methods: ["GET"],
    auth: "required",
  },
  async ({ req, res, redis, user }): Promise<void> => {
    const username = user?.username || "";
    const rawSince = Array.isArray(req.query.since)
      ? req.query.since[0]
      : req.query.since;
    const since = rawSince ? Number.parseInt(String(rawSince), 10) : 0;

    if (!Number.isFinite(since) || since < 0) {
      res.status(400).json({ error: "Invalid since cursor" });
      return;
    }

    try {
      const result = await readSyncChanges(redis, username, since);
      res.status(200).json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[sync2] changes read failed:", message, error);
      res.status(503).json({ error: `Sync read failed: ${message}` });
    }
  }
);
