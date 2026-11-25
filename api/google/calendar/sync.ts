import { z } from "zod";
import { apiHandler } from "../../_utils/api-handler.js";
import * as RateLimit from "../../_utils/_rate-limit.js";
import { getHeader } from "../../_utils/request-helpers.js";
import { getStoredUserTimeZone } from "../../_utils/auth/_user-record.js";
import { GoogleApiError } from "../../_utils/google-oauth.js";
import { syncGoogleCalendarForUser } from "../../_utils/google-calendar.js";

const eventColorSchema = z.enum(["blue", "red", "green", "orange", "purple"]);

const calendarEventSchema = z.object({
  id: z.string().min(1).max(256),
  title: z.string().max(500),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  color: eventColorSchema,
  calendarId: z.string().max(128).optional(),
  location: z.string().max(1000).optional(),
  notes: z.string().max(10000).optional(),
  googleEventId: z.string().max(256).optional(),
  googleCalendarId: z.string().max(256).optional(),
  googleEtag: z.string().max(256).optional(),
  googleRecurringEventId: z.string().max(256).optional(),
  googleSyncedUpdatedAt: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const syncCalendarBodySchema = z.object({
  mode: z.enum(["incremental", "reset_pull"]).optional(),
  timeZone: z.string().max(128).optional(),
  upserts: z.array(calendarEventSchema).max(250).optional(),
  deletions: z
    .array(
      z.object({
        localId: z.string().min(1).max(256),
        googleEventId: z.string().min(1).max(256),
        googleCalendarId: z.string().max(256).optional(),
      })
    )
    .max(250)
    .optional(),
});

const CALENDAR_SYNC_RL_LIMIT = 60;
const CALENDAR_SYNC_RL_WINDOW_SECONDS = 5 * 60;

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
    allowExpiredAuth: false,
    bodySchema: syncCalendarBodySchema,
  },
  async ({ req, res, redis, logger, startTime, user, body }) => {
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
          "calendar-sync",
          "user",
          username,
        ]),
        windowSeconds: CALENDAR_SYNC_RL_WINDOW_SECONDS,
        limit: CALENDAR_SYNC_RL_LIMIT,
      });
      if (!rl.allowed) {
        res.setHeader("Retry-After", String(rl.resetSeconds));
        logger.response(429, Date.now() - startTime);
        res.status(429).json({
          error: "Too many Google Calendar sync requests. Please wait a moment.",
        });
        return;
      }
    } catch (rlErr) {
      logger.warn("Google Calendar sync rate limit check failed", rlErr);
    }

    try {
      const fallbackTz =
        body?.timeZone ||
        getHeader(req, "x-user-timezone") ||
        (await getStoredUserTimeZone(redis, username)) ||
        "UTC";

      const result = await syncGoogleCalendarForUser(redis, username, {
        mode: body?.mode,
        timeZone: fallbackTz,
        upserts: body?.upserts,
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
      logger.error("Google Calendar sync failed", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to sync Google Calendar" });
    }
  }
);
