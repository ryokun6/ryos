import { apiHandler } from "../_utils/api-handler.js";
import { getStoredUserTimeZone } from "../_utils/auth/_user-record.js";
import { DEVICE_VOICE_PATH } from "../_utils/device-voice/session.js";
import { timeZoneOffsetMinutes } from "../_utils/device-voice/time.js";
import { buildWebSocketUrl, getConfiguredPublicOrigin } from "../_utils/runtime-config.js";

function headerValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/**
 * Version check the ESP32 voice terminal runs at boot. It hands back the
 * voice socket URL and, for a signed-in device, the owner's clock offset.
 */
export default apiHandler(
  {
    methods: ["GET", "POST"],
    auth: "optional",
    allowMissingOrigin: true,
    parseJsonBody: false,
  },
  async ({ req, res, redis, logger, startTime, user }) => {
    const host = headerValue(req.headers["x-forwarded-host"]) || headerValue(req.headers.host);
    const proto = headerValue(req.headers["x-forwarded-proto"]) || "https";
    const origin = getConfiguredPublicOrigin() || (host ? `${proto}://${host}` : "https://os.ryo.lu");
    const timeZone = user ? await getStoredUserTimeZone(redis, user.username).catch(() => null) : null;

    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      firmware: { version: "0.0.0" },
      websocket: { url: buildWebSocketUrl(origin, DEVICE_VOICE_PATH), version: 1 },
      server_time: {
        timestamp: Date.now(),
        timezone_offset: timeZone ? timeZoneOffsetMinutes(timeZone) : 0,
      },
    });
  }
);
