/**
 * Realtime channel authorization.
 *
 * Centralizes the rules for who may subscribe to an authorization-requiring
 * realtime channel. Used by:
 * - `/api/pusher/auth` (Pusher provider) to sign channel subscriptions.
 * - the standalone local WebSocket server to gate `subscribe` messages.
 *
 * Public channels (public chat list, public/IRC rooms, listen sessions,
 * airdrop lobby, …) never require authorization and are always allowed.
 */

import type { Redis } from "./redis.js";
import {
  classifyRealtimeChannel,
  sanitizeUsernameForRealtimeChannel,
} from "../../src/shared/constants/realtime.js";
import { getRoom } from "../rooms/_helpers/_redis.js";
import { isPrivateRoom, isRoomMember } from "../rooms/_helpers/_access.js";

/**
 * Decide whether `username` (the authenticated subscriber, or null/empty when
 * anonymous) is allowed to subscribe to `channel`.
 */
export async function authorizeRealtimeChannel(
  channel: string,
  username: string | null | undefined
): Promise<boolean> {
  const classification = classifyRealtimeChannel(channel);
  const normalizedUsername = username ? username.toLowerCase() : "";

  switch (classification.kind) {
    case "public":
      return true;

    case "deny":
      return false;

    case "presence-global":
      // Any authenticated user may observe global presence.
      return Boolean(normalizedUsername);

    case "user": {
      if (!normalizedUsername) return false;
      return (
        sanitizeUsernameForRealtimeChannel(normalizedUsername) ===
        classification.target
      );
    }

    case "room": {
      if (!normalizedUsername) return false;
      const room = await getRoom(classification.target);
      // The `private-room-…` channel only ever maps to a private room; require
      // the room to exist, be private, and the user to be a member.
      if (!isPrivateRoom(room)) return false;
      return isRoomMember(room, normalizedUsername);
    }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Local WebSocket auth tickets
// ---------------------------------------------------------------------------
//
// The auth cookie is scoped to `/api` and is HttpOnly, so it is neither sent on
// the WebSocket upgrade (different path) nor readable from JS. Instead, an
// authenticated client mints a short-lived, single-use ticket via
// `/api/realtime/ticket` (cookie/bearer auth) and presents it on the WS URL.

const REALTIME_TICKET_PREFIX = "rt:ticket:";
const REALTIME_TICKET_TTL_SECONDS = 60;

function generateTicket(): string {
  const cryptoObj = globalThis.crypto;
  return `${cryptoObj.randomUUID()}${cryptoObj.randomUUID()}`.replace(/-/g, "");
}

/**
 * Mint a single-use realtime ticket bound to `username` (TTL ~60s).
 */
export async function issueRealtimeTicket(
  redis: Redis,
  username: string
): Promise<string> {
  const ticket = generateTicket();
  await redis.set(`${REALTIME_TICKET_PREFIX}${ticket}`, username.toLowerCase(), {
    ex: REALTIME_TICKET_TTL_SECONDS,
  });
  return ticket;
}

/**
 * Consume a realtime ticket, returning the bound username (or null if invalid /
 * expired / already used). Tickets are single-use.
 */
export async function consumeRealtimeTicket(
  redis: Redis,
  ticket: string | null | undefined
): Promise<string | null> {
  if (!ticket) return null;
  const key = `${REALTIME_TICKET_PREFIX}${ticket}`;
  const username = await redis.get<string>(key);
  if (!username) return null;
  await redis.del(key);
  return typeof username === "string" ? username : String(username);
}
