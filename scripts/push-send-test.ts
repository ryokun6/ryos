/**
 * Send a test APNs alert straight to a device token (bypasses Redis).
 *
 *   RYOS_APNS_TEAM_ID=... RYOS_APNS_KEY_ID=... RYOS_APNS_KEY_B64=... \
 *     bun run push:test <64-hex-token> [sandbox|prod] [roomId]
 *
 * A fake token should yield `400 BadDeviceToken` from both hosts, which
 * proves the JWT, key, topic, and path are accepted by Apple.
 */

import {
  buildPushPayload,
  closeApnsSessions,
  isPushConfigured,
  normalizeDeviceToken,
  sendApnsNotification,
  type ApnsEnv,
} from "../api/_utils/push-relay.js";

const [rawToken, rawEnv = "sandbox", roomId = "test"] = process.argv.slice(2);
const deviceToken = normalizeDeviceToken(rawToken);

if (!deviceToken) {
  console.error("Usage: bun run push:test <64-hex-token> [sandbox|prod] [roomId]");
  process.exit(1);
}
if (rawEnv !== "sandbox" && rawEnv !== "prod") {
  console.error(`Unknown env "${rawEnv}" (expected sandbox or prod)`);
  process.exit(1);
}
if (!isPushConfigured()) {
  console.error(
    "APNs not configured: set RYOS_APNS_TEAM_ID, RYOS_APNS_KEY_ID, and RYOS_APNS_KEY_B64 or RYOS_APNS_KEY_FILE"
  );
  process.exit(1);
}

const result = await sendApnsNotification(
  deviceToken,
  buildPushPayload(roomId, "@ryo · #test", "Test notification from ryOS"),
  { env: rawEnv as ApnsEnv }
);
console.log(JSON.stringify(result, null, 2));
closeApnsSessions();
process.exit(result?.ok ? 0 : 2);
