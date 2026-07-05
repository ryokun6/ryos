import { describe, expect, test } from "bun:test";
import {
  migrateSessionClientIds,
  normalizeClientInstanceId,
  userConnectionKey,
} from "../api/listen/_helpers/_client-instance.js";
import type { ListenSession } from "../api/listen/_helpers/_types.js";

describe("listen client instance helpers", () => {
  test("normalizeClientInstanceId accepts safe ids and falls back to legacy prefix", () => {
    expect(normalizeClientInstanceId("Alice", "tab-1")).toBe("tab-1");
    expect(normalizeClientInstanceId("Alice", " bad id ")).toBe("legacy:alice");
    expect(normalizeClientInstanceId("Alice", "")).toBe("legacy:alice");
  });

  test("userConnectionKey includes clientInstanceId when present", () => {
    expect(
      userConnectionKey({
        username: "Alice",
        clientInstanceId: "tab-1",
      })
    ).toBe("alice|tab-1");
    expect(
      userConnectionKey({
        username: "Alice",
        clientInstanceId: "",
      })
    ).toBe("alice|legacy:alice");
  });

  test("migrateSessionClientIds backfills missing host and dj client ids", () => {
    const session: ListenSession = {
      id: "room-1",
      hostUsername: "host",
      djUsername: "dj",
      hostClientInstanceId: "",
      djClientInstanceId: "",
      users: [
        { username: "host", joinedAt: 1, isOnline: true, clientInstanceId: "" },
        { username: "dj", joinedAt: 1, isOnline: true, clientInstanceId: "dj-tab" },
        { username: "guest", joinedAt: 1, isOnline: true, clientInstanceId: "" },
      ],
      currentTrackId: null,
      currentTrackMeta: null,
      isPlaying: false,
      positionMs: 0,
      lastSyncAt: 1,
      createdAt: 1,
    };

    migrateSessionClientIds(session);

    expect(session.users[0]?.clientInstanceId).toBe("legacy:host");
    expect(session.users[1]?.clientInstanceId).toBe("dj-tab");
    expect(session.users[2]?.clientInstanceId).toBe("legacy:guest");
    expect(session.hostClientInstanceId).toBe("legacy:host");
    expect(session.djClientInstanceId).toBe("dj-tab");
  });
});
