/**
 * /api/rooms
 *
 * GET  - List all rooms
 * POST - Create a new room
 */

import { apiHandler } from "../_utils/api-handler.js";
import { isProfaneUsername, assertValidUsername } from "../_utils/_validation.js";
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
import {
  notifyRoomBindingChange,
  isIrcBridgeEnabled,
  getIrcBridge,
} from "../_utils/irc/_bridge.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default apiHandler(
  { methods: ["GET", "POST"], auth: "optional" },
  async ({ req, res, logger, startTime, user }) => {
    const method = (req.method || "GET").toUpperCase();

    // GET - List rooms
    if (method === "GET") {
      try {
        const claimedUsername = (req.query.username as string | undefined)?.toLowerCase() || null;
        const allRooms = await getRoomsWithCountsFast();
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
      try {
        for (const m of members) {
          assertValidUsername(m, "room-create");
        }
      } catch (e) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: e instanceof Error ? e.message : "Invalid member username" });
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

      if (username === "ryo") {
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
              typeof ircServerLabelBody === "string" &&
              ircServerLabelBody.trim()
                ? ircServerLabelBody.trim()
                : undefined,
          };
        }
      } else {
        if (!serverIdRaw) {
          logger.response(403, Date.now() - startTime);
          res.status(403).json({
            error:
              "Forbidden — pick a registered IRC server to create a bridged room",
          });
          return;
        }
        const serverFromRegistry = await getIrcServer(serverIdRaw);
        if (!serverFromRegistry) {
          logger.response(400, Date.now() - startTime);
          res.status(400).json({ error: "Unknown IRC server id" });
          return;
        }
        if (!isIrcBridgeEnabled()) {
          logger.response(503, Date.now() - startTime);
          res.status(503).json({
            error: "IRC bridge is disabled in this environment",
          });
          return;
        }
        try {
          const advertised = await getIrcBridge().listChannels(
            serverFromRegistry.host,
            serverFromRegistry.port,
            serverFromRegistry.tls,
            { maxChannels: 2000, timeoutMs: 15000 }
          );
          const channelOk = advertised.some(
            (c) => c.channel.toLowerCase() === derivedChannel.toLowerCase()
          );
          if (!channelOk) {
            logger.response(403, Date.now() - startTime);
            res.status(403).json({
              error:
                "Channel must appear in that server’s public channel list (refresh the list and pick a channel)",
            });
            return;
          }
        } catch (err) {
          logger.error("IRC channel validation failed", err);
          logger.response(503, Date.now() - startTime);
          res.status(503).json({ error: "Failed to validate IRC channel" });
          return;
        }
        ircResolved = {
          host: serverFromRegistry.host,
          port: serverFromRegistry.port,
          tls: serverFromRegistry.tls,
          channel: derivedChannel,
          ircServerLabel: serverFromRegistry.label,
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

      await setRoom(roomId, room);
      await registerRoom(roomId);

      if (type === "private") {
        await Promise.all(normalizedMembers.map((member: string) => setRoomPresence(roomId, member)));
      }

      if (type === "irc" && isIrcBridgeEnabled()) {
        try {
          await notifyRoomBindingChange("bind", room);
        } catch (err) {
          logger.warn("IRC bridge bind failed", err);
        }
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
