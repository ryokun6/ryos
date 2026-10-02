import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import {
  notifyRoomMessage,
  redactDeviceToken,
  registerPushDevice,
  resetApnsState,
  setApnsHostsForTesting,
} from "../../../api/_utils/push-relay";
import type { Redis } from "../../../api/_utils/redis";
import { redisKeys, sha256RedisIdentifier } from "../../../src/shared/redisKeys";
import type { ApiChatMessage, ApiChatRoom } from "../../../src/shared/contracts/chat";
import { startFakeApns, type FakeApnsServer } from "../../helpers/fake-apns";
import { FakeRedis } from "../../helpers/fake-redis";

const ENV_KEYS = [
  "RYOS_APNS_TEAM_ID",
  "RYOS_APNS_KEY_ID",
  "RYOS_APNS_KEY_B64",
  "RYOS_APNS_KEY_FILE",
  "RYOS_DEBUG",
] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

const BOB_DEVICE = "0123456789abcdef".repeat(4);
const SESSION_TOKEN = "session-token-secret-value";
const MESSAGE_TEXT = "super secret message text";
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const KEY_B64 = Buffer.from(
  privateKey.export({ format: "pem", type: "pkcs8" }) as string
).toString("base64");

const room: ApiChatRoom = {
  id: "room1",
  name: "@alice, @bob",
  type: "private",
  createdAt: 0,
  userCount: 2,
  members: ["alice", "bob"],
};

let seq = 0;
function makeMessage(): ApiChatMessage {
  seq++;
  return {
    id: `msg${seq}`,
    roomId: room.id,
    username: "alice",
    content: MESSAGE_TEXT,
    timestamp: 1_000 + seq,
  };
}

let lines: string[] = [];
const originalConsole = { log: console.log, warn: console.warn, error: console.error };

function captureConsole(): void {
  lines = [];
  const capture = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  console.log = capture;
  console.warn = capture;
  console.error = capture;
}

function restoreConsole(): void {
  Object.assign(console, originalConsole);
}

const output = () => lines.join("\n");
const linesWith = (needle: string) => lines.filter((line) => line.includes(needle));

describe("push relay logging", () => {
  let sandbox: FakeApnsServer;
  let prod: FakeApnsServer;
  let redis: FakeRedis;

  beforeAll(async () => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    sandbox = await startFakeApns();
    prod = await startFakeApns();
  });

  afterAll(async () => {
    restoreConsole();
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    setApnsHostsForTesting(null);
    resetApnsState();
    await Promise.all([sandbox.close(), prod.close()]);
  });

  beforeEach(async () => {
    process.env.RYOS_APNS_TEAM_ID = "TEAMID1234";
    process.env.RYOS_APNS_KEY_ID = "KEYID56789";
    process.env.RYOS_APNS_KEY_B64 = KEY_B64;
    delete process.env.RYOS_APNS_KEY_FILE;
    process.env.RYOS_DEBUG = "1";
    resetApnsState();
    setApnsHostsForTesting({ sandbox: sandbox.url, prod: prod.url });
    sandbox.respond = () => ({ status: 200 });
    prod.respond = () => ({ status: 200 });
    sandbox.requests.length = 0;
    prod.requests.length = 0;

    redis = new FakeRedis();
    await registerPushDevice(redis as unknown as Redis, {
      username: "bob",
      deviceToken: BOB_DEVICE,
      sessionToken: SESSION_TOKEN,
    });
    const sessionHash = await sha256RedisIdentifier(SESSION_TOKEN);
    await redis.set(redisKeys.auth.session(sessionHash), "{}");
    captureConsole();
  });

  afterEach(() => {
    restoreConsole();
  });

  const notify = (message = makeMessage()) =>
    notifyRoomMessage(room, message, redis as unknown as Redis);

  test("redactDeviceToken keeps only the first and last 4 chars", () => {
    expect(redactDeviceToken(BOB_DEVICE)).toBe("0123…cdef");
    expect(redactDeviceToken("abc")).toBe("****");
  });

  test("logs a delivery summary and APNs debug lines without secrets", async () => {
    sandbox.respond = () => ({ status: 400, reason: "BadDeviceToken" });
    await notify();

    expect(prod.requests).toHaveLength(1);
    expect(linesWith("[push] APNs response")).toHaveLength(2);
    expect(linesWith("[push] APNs env mismatch")).toHaveLength(1);
    expect(output()).toContain('"from":"sandbox","to":"prod"');
    expect(linesWith("[push] Device APNs env updated")).toHaveLength(1);

    const [summary] = linesWith("[push] notifyRoomMessage done");
    expect(summary).toContain('"candidates":1');
    expect(summary).toContain('"sent":1');
    expect(summary).not.toContain('"failed"');

    const all = output();
    expect(all).toContain("0123…cdef");
    expect(all).not.toContain(BOB_DEVICE);
    expect(all).not.toContain(SESSION_TOKEN);
    expect(all).not.toContain(await sha256RedisIdentifier(SESSION_TOKEN));
    expect(all).not.toContain(MESSAGE_TEXT);
    expect(all).not.toContain(KEY_B64.slice(0, 32));
    expect(all.toLowerCase()).not.toContain("bearer");
  });

  test("debug lines are suppressed when debug logging is off", async () => {
    process.env.RYOS_DEBUG = "0";
    await notify();

    expect(linesWith("[push] APNs response")).toHaveLength(0);
    expect(linesWith("[push] notifyRoomMessage start")).toHaveLength(0);
    expect(linesWith("[push] notifyRoomMessage done")).toHaveLength(1);
  });

  test("logs failed deliveries at warn with status and reason", async () => {
    sandbox.respond = () => ({ status: 400, reason: "TopicDisallowed" });
    await notify();

    const [failure] = linesWith("[push] APNs delivery failed");
    expect(failure).toContain('"status":400');
    expect(failure).toContain('"reason":"TopicDisallowed"');
    expect(linesWith("[push] notifyRoomMessage done")[0]).toContain('"failed":1');
  });

  test("logs dead-token removal", async () => {
    sandbox.respond = () => ({ status: 400, reason: "BadDeviceToken" });
    prod.respond = () => ({ status: 410, reason: "Unregistered" });
    await notify();

    expect(linesWith("[push] Removing dead device token")).toHaveLength(1);
    expect(linesWith("[push] notifyRoomMessage done")[0]).toContain('"dead":1');
    expect(await redis.get(redisKeys.integration.pushDevice(BOB_DEVICE))).toBeNull();
  });

  test("logs a session-dead drop", async () => {
    await redis.del(redisKeys.auth.session(await sha256RedisIdentifier(SESSION_TOKEN)));
    await notify();

    expect(linesWith("[push] Dropping device: registering session signed out")).toHaveLength(1);
    expect(linesWith("[push] notifyRoomMessage done")[0]).toContain('"sessionDead":1');
    expect(sandbox.requests).toHaveLength(0);
  });

  test("logs watermark skips and burst grouping", async () => {
    const message = makeMessage();
    await notify(message);
    await notify(message);
    expect(linesWith("[push] Skipped by watermark")[0]).toContain("already_notified");
    expect(linesWith("[push] notifyRoomMessage done")[1]).toContain('"duplicate":1');

    for (let i = 0; i < 3; i++) await notify();
    expect(linesWith("[push] Burst grouping")[0]).toContain('"burstCount":4');
  });

  test("logs skip reasons for missing config and no candidates", async () => {
    delete process.env.RYOS_APNS_KEY_B64;
    resetApnsState();
    await notify();
    expect(output()).toContain("[push] APNs not configured; pushes disabled");
    expect(output()).toContain("RYOS_APNS_KEY_B64|RYOS_APNS_KEY_FILE");
    expect(linesWith("[push] Skipped: APNs not configured")).toHaveLength(1);

    process.env.RYOS_APNS_KEY_B64 = KEY_B64;
    resetApnsState();
    await notifyRoomMessage(
      { ...room, id: "room2", members: ["alice", "carol"] },
      makeMessage(),
      redis as unknown as Redis
    );
    expect(linesWith("[push] Skipped: no candidate devices")).toHaveLength(1);
  });
});
