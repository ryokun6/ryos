import { apiHandler } from "../../_utils/api-handler.js";
import { readSyncSnapshot } from "./_core.js";

export default apiHandler(
  {
    methods: ["GET"],
    auth: "required",
  },
  async ({ req, res, redis, user }): Promise<void> => {
    const username = user?.username || "";
    const rawPrefix = Array.isArray(req.query.prefix)
      ? req.query.prefix[0]
      : req.query.prefix;
    const prefix =
      typeof rawPrefix === "string" && rawPrefix.length > 0 ? rawPrefix : undefined;

    try {
      const result = await readSyncSnapshot(redis, username, prefix);
      res.status(200).json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[sync2] snapshot read failed:", message, error);
      res.status(503).json({ error: `Sync snapshot failed: ${message}` });
    }
  }
);
