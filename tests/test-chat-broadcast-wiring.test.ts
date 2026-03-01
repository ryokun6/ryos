#!/usr/bin/env bun
/**
 * Guardrail tests for chat REST -> Pusher event wiring.
 *
 * Why:
 * The notifications regression was caused by missing realtime emissions
 * in REST routes. These checks ensure that critical broadcast calls stay wired.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test, expect } from "bun:test";

const readRoute = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

const assertHasCall = (
  source: string,
  fnName: string,
  description: string
): void => {
  const callPattern = new RegExp(`\\b${fnName}\\s*\\(`);
  expect(callPattern.test(source)).toBe(true);
};

const countCalls = (source: string, fnName: string): number => {
  const callPattern = new RegExp(`\\b${fnName}\\s*\\(`, "g");
  return source.match(callPattern)?.length || 0;
};

describe("Chat Broadcast Wiring Tests", () => {
  describe("Core room/message routes", () => {
    test("room create route emits room-created", async () => {
      const source = readRoute("_api/rooms/index.ts");
      assertHasCall(source, "broadcastRoomCreated", "room creation");
    });

    test("send message route emits room-message", async () => {
      const source = readRoute("_api/rooms/[id]/messages.ts");
      assertHasCall(source, "broadcastNewMessage", "message send");
    });

    test("delete message route emits message-deleted", async () => {
      const source = readRoute("_api/rooms/[id]/messages/[msgId].ts");
      assertHasCall(source, "broadcastMessageDeleted", "message delete");
    });
  });

  describe("Presence and membership routes", () => {
    test("presence switch route emits room-updated", async () => {
      const source = readRoute("_api/presence/switch.ts");
      assertHasCall(source, "broadcastRoomUpdated", "presence switch");
      expect(countCalls(source, "broadcastRoomUpdated") >= 2).toBe(true);
      expect(/broadcastRoomUpdated\s*\(\s*previousRoomId\s*\)/.test(source)).toBe(true);
      expect(/broadcastRoomUpdated\s*\(\s*nextRoomId\s*\)/.test(source)).toBe(true);
    });

    test("join route emits room-updated", async () => {
      const source = readRoute("_api/rooms/[id]/join.ts");
      assertHasCall(source, "broadcastRoomUpdated", "room join");
    });

    test("room delete/leave route emits delete/update events", async () => {
      const source = readRoute("_api/rooms/[id].ts");
      assertHasCall(source, "broadcastRoomDeleted", "room delete / private leave");
      assertHasCall(source, "broadcastRoomUpdated", "private leave updates");
    });

    test("room delete route removes room from registry and presence", async () => {
      const source = readRoute("_api/rooms/[id].ts");
      expect(source.includes("CHAT_ROOMS_SET")).toBe(true);
      expect(/srem\s*\(\s*CHAT_ROOMS_SET/.test(source)).toBe(true);
      assertHasCall(
        source,
        "deleteRoomPresence",
        "room delete route presence cleanup"
      );
    });

    test("leave route emits delete/update events", async () => {
      const source = readRoute("_api/rooms/[id]/leave.ts");
      assertHasCall(source, "broadcastRoomDeleted", "leave route deletions");
      assertHasCall(source, "broadcastRoomUpdated", "leave route updates");
    });

    test("leave route removes deleted private room from registry", async () => {
      const source = readRoute("_api/rooms/[id]/leave.ts");
      expect(source.includes("CHAT_ROOMS_SET")).toBe(true);
      expect(/srem\s*\(\s*CHAT_ROOMS_SET/.test(source)).toBe(true);
    });

    test("leave route clears room presence for deleted private room", async () => {
      const source = readRoute("_api/rooms/[id]/leave.ts");
      assertHasCall(source, "deleteRoomPresence", "leave route private deletion cleanup");
    });
  });
});
