import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { redisKeys } from "../src/shared/redisKeys";
import { FakeRedis } from "./fake-redis";
import * as actualRedis from "../api/_utils/redis";

let fake: FakeRedis;

// The IRC server registry resolves its client through createRedis() from this
// module, so point it at a fake to exercise the real key-reading logic. Spread
// the real module so other exports (e.g. supportsRedisPubSub) survive — Bun
// module mocks are global and persist across files in the same run.
mock.module("../api/_utils/redis.js", () => ({
  ...actualRedis,
  createRedis: () => fake,
}));

afterAll(() => {
  mock.module("../api/_utils/redis.js", () => actualRedis);
});

let servers: typeof import("../api/_utils/irc/_servers");

const legacyServerKey = (id: string) => `chat:irc:server:${id}`;
const LEGACY_SERVERS_SET = "chat:irc:servers";

beforeEach(async () => {
  fake = new FakeRedis();
  servers = await import("../api/_utils/irc/_servers");
});

describe("IRC server registry canonical cutover", () => {
  test("reads and writes canonical keys only, ignoring legacy entries", async () => {
    const redis = fake as unknown as import("../api/_utils/redis").Redis;

    // A server that only exists under the legacy `chat:irc:*` scheme.
    await redis.set(
      legacyServerKey("legacy"),
      JSON.stringify({
        id: "legacy",
        label: "legacy.example",
        host: "legacy.example",
        port: 6697,
        tls: true,
        createdAt: 1,
      })
    );
    await redis.sadd(LEGACY_SERVERS_SET, "legacy");

    expect(await servers.getIrcServer("legacy")).toBeNull();

    const stored = {
      id: "libera",
      label: "Libera.Chat",
      host: "irc.libera.chat",
      port: 6697,
      tls: true,
      createdAt: 2,
    };
    await servers.setIrcServer(stored);

    // Canonical key + set get written; the legacy entries are untouched.
    const rawStored = await redis.get(redisKeys.integration.ircServer("libera"));
    expect(
      typeof rawStored === "string" ? JSON.parse(rawStored) : rawStored
    ).toEqual(stored);
    expect(
      await redis.smembers(redisKeys.integration.ircServerIds())
    ).toContain("libera");

    const fetched = await servers.getIrcServer("libera");
    expect(fetched?.host).toBe("irc.libera.chat");

    // listIrcServers seeds the default and surfaces canonical servers, never
    // the legacy-only one.
    const list = await servers.listIrcServers();
    const ids = list.map((s) => s.id);
    expect(ids).toContain("libera");
    expect(ids).toContain(servers.__DEFAULT_IRC_SERVER_ID);
    expect(ids).not.toContain("legacy");

    // Delete only touches canonical keys; legacy data is left alone.
    await servers.deleteIrcServer("libera");
    expect(await redis.get(redisKeys.integration.ircServer("libera"))).toBeNull();
    expect(
      await redis.smembers(redisKeys.integration.ircServerIds())
    ).not.toContain("libera");
    expect(await redis.get(legacyServerKey("legacy"))).not.toBeNull();
    expect(await redis.smembers(LEGACY_SERVERS_SET)).toContain("legacy");
  });
});
