import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { apiHandler } from "./_utils/api-handler.js";
import { parseYouTubeTitleWithAI } from "./_utils/parse-youtube-title.js";

interface ParseTitleRequest {
  title: string;
  author_name?: string;
}

export default apiHandler<ParseTitleRequest>(
  {
    methods: ["POST"],
    parseJsonBody: true,
  },
  async ({ req, res, logger, startTime, body }) => {
    const rawTitle = body?.title;
    const author_name = body?.author_name;

    // Rate limits: burst 15/min/IP + daily 500/IP
    try {
      const ip = getClientIp(req);
      const BURST_WINDOW = 60;
      const DAILY_WINDOW = 60 * 60 * 24;

      const rl = await RateLimit.checkBurstAndDailyLimits({
        namespace: "parse-title",
        identifierParts: ["ip", ip],
        burst: { windowSeconds: BURST_WINDOW, limit: 15 },
        daily: { windowSeconds: DAILY_WINDOW, limit: 500 },
      });
      if (!rl.ok) {
        const fallbackWindow = rl.scope === "burst" ? BURST_WINDOW : DAILY_WINDOW;
        logger.warn(`Rate limit exceeded (${rl.scope})`, { ip });
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(rl.result?.resetSeconds ?? fallbackWindow));
        res.status(429).json({ error: "rate_limit_exceeded", scope: rl.scope });
        return;
      }
    } catch (e) {
      logger.error("Rate limit check failed", e);
    }

    if (!rawTitle || typeof rawTitle !== "string") {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "No title provided" });
      return;
    }

    try {
      logger.info("Parsing title", { rawTitle, author_name });

      const result = await parseYouTubeTitleWithAI(rawTitle, author_name, {
        fallback: "raw",
        includeAlbum: true,
        timeoutProfile: "route",
      });

      logger.info("Title parsed successfully", result);
      logger.response(200, Date.now() - startTime);
      res.status(200).json({
        title: result.title || rawTitle,
        artist: result.artist,
        album: result.album,
      });
    } catch (error: unknown) {
      logger.error("Error parsing title", error);

      let status = 500;
      let errorMessage = "Error parsing title";

      if (error instanceof Error) {
        errorMessage = error.message;
      }

      if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof error.status === "number"
      ) {
        status = error.status;
      }

      logger.response(status, Date.now() - startTime);
      res.status(status).json({ error: errorMessage });
    }
  }
);
