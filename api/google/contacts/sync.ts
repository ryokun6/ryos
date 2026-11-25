import { z } from "zod";
import { apiHandler } from "../../_utils/api-handler.js";
import * as RateLimit from "../../_utils/_rate-limit.js";
import { GoogleApiError } from "../../_utils/google-oauth.js";
import { syncGoogleContactsForUser } from "../../_utils/google-contacts.js";
import { normalizeContacts } from "../../../src/utils/contacts.js";

const syncContactsBodySchema = z.object({
  mode: z.enum(["incremental", "reset_pull"]).optional(),
  upserts: z.array(z.record(z.string(), z.unknown())).max(250).optional(),
  deletions: z
    .array(
      z.object({
        localId: z.string().min(1).max(256),
        googleResourceName: z.string().min(1).max(256),
      })
    )
    .max(250)
    .optional(),
});

const CONTACTS_SYNC_RL_LIMIT = 60;
const CONTACTS_SYNC_RL_WINDOW_SECONDS = 5 * 60;

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
    allowExpiredAuth: false,
    bodySchema: syncContactsBodySchema,
  },
  async ({ res, redis, logger, startTime, user, body }) => {
    const username = user?.username || "";
    if (!username) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const rl = await RateLimit.checkCounterLimit({
        key: RateLimit.makeKey([
          "rl",
          "google",
          "contacts-sync",
          "user",
          username,
        ]),
        windowSeconds: CONTACTS_SYNC_RL_WINDOW_SECONDS,
        limit: CONTACTS_SYNC_RL_LIMIT,
      });
      if (!rl.allowed) {
        res.setHeader("Retry-After", String(rl.resetSeconds));
        logger.response(429, Date.now() - startTime);
        res.status(429).json({
          error: "Too many Google Contacts sync requests. Please wait a moment.",
        });
        return;
      }
    } catch (rlErr) {
      logger.warn("Google Contacts sync rate limit check failed", rlErr);
    }

    try {
      const normalizedUpserts = body?.upserts
        ? normalizeContacts(body.upserts)
        : undefined;

      const result = await syncGoogleContactsForUser(redis, username, {
        mode: body?.mode,
        upserts: normalizedUpserts,
        deletions: body?.deletions,
      });

      logger.response(200, Date.now() - startTime);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof GoogleApiError) {
        logger.response(error.status, Date.now() - startTime);
        res.status(error.status).json({
          error: error.message,
          code: error.code,
        });
        return;
      }
      logger.error("Google Contacts sync failed", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to sync Google Contacts" });
    }
  }
);
