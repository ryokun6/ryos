/**
 * /api/rooms
 *
 * GET  - List all rooms
 * POST - Create a new room
 */

import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import { isProfaneUsername } from "../_utils/_validation.js";
import { getRoomsWithCountsFast } from "./_helpers/_presence.js";
import { generateId, getCurrentTimestamp, setRoom, registerRoom } from "./_helpers/_redis.js";
import { setRoomPresence } from "./_helpers/_presence.js";
import { broadcastRoomCreated } from "./_helpers/_pusher.js";
import { filterVisibleRooms } from "./_helpers/_access.js";
import type { Room } from "./_helpers/_types.js";
import {
  DEFAULT_IRC_HOST,
  DEFAULT_IRC_PORT,
  DEFAULT_IRC_TLS,
  normalizeIrcChannel,
} from "../_utils/irc/_types.js";
import { getIrcServer } from "../_utils/irc/_servers.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default apiHandler(
  { methods: ["GET", "POST"], auth: "optional" },
  async ({ req, res, redis, logger, startTime, user }) => {
    const method = (req.method || "GET").toUpperCase();

    // GET - List rooms
    if (method === "GET") {
      // Loose rate limit (the chat UI polls this): burst 60/min + daily 5000.
      try {
        const identifier = user?.username || getClientIp(req);
        const rl = await RateLimit.checkBurstAndDailyLimits({
          namespace: "rooms-list",
          identifierParts: [user ? "user" : "ip", identifier],
          burst: { windowSeconds: 60, limit: 60 },
          daily: { windowSeconds: 60 * 60 * 24, limit: 5000 },
        });
        if (!rl.ok) {
          logger.warn(`Rate limit exceeded (${rl.scope})`, { identifier });
          logger.response(429, Date.now() - startTime);
          res.setHeader("Retry-After", String(rl.result?.resetSeconds ?? 60));
          res.status(429).json({ error: "rate_limit_exceeded", scope: rl.scope });
          return;
        }
      } catch (e) {
        logger.error("Rate limit check failed", e);
      }

      try {
        const claimedUsername = (req.query.username as string | undefined)?.toLowerCase() || null;
        const allRooms = await getRoomsWithCountsFast(redis);
        const visibleRooms = filterVisibleRooms(allRooms, user);

        logger.info("Listed rooms", {
          total: allRooms.length,
          visible: visibleRooms.length,
          viewerUsername: user?.username ?? null,
          claimedUsername,
        });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ rooms: visibleRooms });
        return;
      } catch (error) {
        logger.error("Error fetching rooms", error);
        logger.response(500, Date.now() - startTime);
        res.status(500).json({ error: "Failed to fetch rooms" });
        return;
      }
    }

    // POST - Create room (requires auth)
    if (!user) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized - missing credentials" });
      return;
    }

    const username = user.username;
    const body = req.body || {};
    const {
      name: originalName,
      type = "public",
      members = [],
      ircServerId: ircServerIdBody,
      ircHost: ircHostBody,
      ircPort: ircPortBody,
      ircTls: ircTlsBody,
      ircChannel: ircChannelBody,
      ircServerLabel: ircServerLabelBody,
    } = body;

    if (!["public", "private", "irc"].includes(type)) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Invalid room type" });
      return;
    }

    if (type === "public") {
      if (!originalName) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Room name is required for public rooms" });
        return;
      }
      if (username !== "ryo") {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "Forbidden - Only admin can create public rooms" });
        return;
      }
      if (isProfaneUsername(originalName)) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Room name contains inappropriate language" });
        return;
      }
    }

    if (type === "irc") {
      if (username !== "ryo") {
        logger.response(403, Date.now() - startTime);
        res
          .status(403)
          .json({ error: "Forbidden - Only admin can create IRC rooms" });
        return;
      }
      if (isProfaneUsername(originalName || "")) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Room name contains inappropriate language" });
        return;
      }
    }

    let normalizedMembers = [...(members || [])];
    if (type === "private") {
      if (!members || members.length === 0) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "At least one member is required for private rooms" });
        return;
      }
      normalizedMembers = members.map((m: string) => m.toLowerCase());
      if (!normalizedMembers.includes(username)) {
        normalizedMembers.push(username);
      }
    }

    let roomName: string;
    let ircResolved:
      | {
          host: string;
          port: number;
          tls: boolean;
          channel: string;
          ircServerLabel?: string;
        }
      | null = null;

    if (type === "public") {
      roomName = originalName.toLowerCase().replace(/ /g, "-");
    } else if (type === "irc") {
      const derivedChannel = normalizeIrcChannel(
        ircChannelBody || originalName || ""
      );
      if (!derivedChannel) {
        logger.response(400, Date.now() - startTime);
        res
          .status(400)
          .json({ error: "IRC channel is required (e.g. #pieter)" });
        return;
      }

      const serverIdRaw =
        typeof ircServerIdBody === "string" ? ircServerIdBody.trim() : "";

      const serverFromRegistry = serverIdRaw
        ? await getIrcServer(serverIdRaw)
        : null;
      if (serverIdRaw && !serverFromRegistry) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Unknown IRC server id" });
        return;
      }
      if (serverFromRegistry) {
        ircResolved = {
          host: serverFromRegistry.host,
          port: serverFromRegistry.port,
          tls: serverFromRegistry.tls,
          channel: derivedChannel,
          ircServerLabel: serverFromRegistry.label,
        };
      } else {
        ircResolved = {
          host: (ircHostBody || DEFAULT_IRC_HOST).toString().toLowerCase(),
          port: Number(ircPortBody) || DEFAULT_IRC_PORT,
          tls: typeof ircTlsBody === "boolean" ? ircTlsBody : DEFAULT_IRC_TLS,
          channel: derivedChannel,
          ircServerLabel:
            typeof ircServerLabelBody === "string" && ircServerLabelBody.trim()
              ? ircServerLabelBody.trim()
              : undefined,
        };
      }

      roomName = ircResolved.channel.replace(/^#/, "").toLowerCase();
    } else {
      const sortedMembers = [...normalizedMembers].sort();
      roomName = sortedMembers.map((m: string) => `@${m}`).join(", ");
    }

    try {
      const roomId = generateId();
      const room: Room = {
        id: roomId,
        name: roomName,
        type,
        createdAt: getCurrentTimestamp(),
        userCount: type === "private" ? normalizedMembers.length : 0,
        ...(type === "private" && { members: normalizedMembers }),
        ...(type === "irc" &&
          ircResolved && {
            ircHost: ircResolved.host.toLowerCase(),
            ircPort: ircResolved.port,
            ircTls: ircResolved.tls,
            ircChannel: ircResolved.channel,
            ...(ircResolved.ircServerLabel && {
              ircServerLabel: ircResolved.ircServerLabel,
            }),
          }),
      };

      await setRoom(roomId, room, redis);
      await registerRoom(roomId, redis);

      if (type === "private") {
        await Promise.all(normalizedMembers.map((member: string) => setRoomPresence(roomId, member, redis)));
      }

      await broadcastRoomCreated(room);
      logger.info("Pusher room-created broadcast sent", { roomId, type });

      logger.info("Room created", { roomId, type, name: roomName, username });
      logger.response(201, Date.now() - startTime);
      res.status(201).json({ room });
    } catch (error) {
      logger.error("Error creating room", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to create room" });
    }
  }
);
