/**
 * Redis helpers for Live Desktop sessions.
 * Built on shared realtime session core utilities.
 */

import type { LiveDesktopSession } from "./_types.js";
import {
  LIVE_SESSION_PREFIX,
  LIVE_SESSIONS_SET,
  LIVE_SESSION_TTL_SECONDS,
} from "./_constants.js";
import {
  createRealtimeSessionCore,
  parseRealtimeJSON,
} from "../../_utils/realtime-session-core.js";

const realtimeSessionCore = createRealtimeSessionCore<LiveDesktopSession>({
  sessionPrefix: LIVE_SESSION_PREFIX,
  sessionsSetKey: LIVE_SESSIONS_SET,
  sessionTtlSeconds: LIVE_SESSION_TTL_SECONDS,
});

export const generateSessionId = realtimeSessionCore.generateSessionId;
export const getCurrentTimestamp = realtimeSessionCore.getCurrentTimestamp;
export const getSession = realtimeSessionCore.getSession;
export const setSession = realtimeSessionCore.setSession;
export const deleteSession = realtimeSessionCore.deleteSession;
export const touchSession = realtimeSessionCore.touchSession;
export const getActiveSessionIds = realtimeSessionCore.getActiveSessionIds;

export function parseSessionData(data: unknown): LiveDesktopSession | null {
  return parseRealtimeJSON<LiveDesktopSession>(data);
}
