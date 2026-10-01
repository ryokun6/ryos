/**
 * APNs push relay: /api/push/register + /api/push/unregister routes, and the
 * notifyRoomMessage trigger against real Redis with a fake APNs server.
 * Requires `bun run dev:api`.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import {
  BASE_URL,
  ensureUserAuth,
  fetchWithAuth,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
  uniqueTestUsername,
} from "../../helpers/test-utils";
import { startFakeApns, type FakeApnsServer } from "../../helpers/fake-apns";
import {
  getPushDevice,
  notifyRoomMessage,
  resetApnsState,
  setApnsHostsForTesting,
  type ApnsAlertPayload,
} from "../../../api/_utils/push-relay";
import { createRedis } from "../../../api/_utils/redis";
import { redisKeys } from "../../../src/shared/redisKeys";
import type { ApiChatMessage, ApiChatRoom } from "../../../src/shared/contracts/chat";

const REGISTER = `${BASE_URL}/api/push/register`;
const UNREGISTER = `${BASE_URL}/api/push/unregister`;
const PASSWORD = "PushTest123!";

const redis = createRedis();
const newToken = () => randomBytes(32).toString("hex");
const newRoomId = () => randomBytes(16).toString("hex");

interface TestUser {
  username: string;
  token: string;
}

async function makeUser(prefix: string): Promise<TestUser> {
  const username = uniqueTestUsername(prefix);
  const token = await ensureUserAuth(username, PASSWORD);
  if (!token) throw new Error(`Failed to create ${username}`);
  return { username, token };
}

function post(url: string, user: TestUser, body: unknown): Promise<Response> {
  return fetchWithAuth(url, user.username, user.token, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify(body),
  });
}

let messageSeq = 0;
function makeMessage(roomId: string, username: string, content: string): ApiChatMessage {
  return {
    id: randomBytes(16).toString("hex"),
    roomId,
    username,
    content,
    timestamp: Date.now() + messageSeq++,
  };
}

describe("push register/unregister routes", () => {
  let alice: TestUser;

  beforeAll(async () => {
    alice = await makeUser("pusha");
  });

  afterAll(async () => {
    await post(`${BASE_URL}/api/auth/logout-all`, alice, {});
  });

  test("401 without credentials", async () => {
    const res = await fetchWithOrigin(REGISTER, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ deviceToken: newToken() }),
    });
    expect(res.status).toBe(401);
  });

  test("400 invalid_device_token for non-64-hex tokens", async () => {
    for (const deviceToken of ["abc", "zz".repeat(32), "ab".repeat(33), 123, undefined]) {
      const res = await post(REGISTER, alice, { deviceToken });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_device_token" });
    }
    const res = await post(UNREGISTER, alice, { deviceToken: "nope" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_device_token" });
  });

  test("400 validation_error for bad rooms", async () => {
    const res = await post(REGISTER, alice, { deviceToken: newToken(), rooms: ["bad id!"] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("validation_error");
  });

  test("register is an idempotent upsert; unregister deletes row + watermarks", async () => {
    const deviceToken = newToken();
    const roomA = newRoomId();
    const roomB = newRoomId();

    for (let i = 0; i < 3; i++) {
      const res = await post(REGISTER, alice, {
        deviceToken: deviceToken.toUpperCase(),
        appVersion: "1.0 (1)",
        rooms: [roomA, roomB, roomA],
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }

    let device = await getPushDevice(redis, deviceToken);
    expect(device).toMatchObject({
      deviceToken,
      username: alice.username,
      rooms: [roomA, roomB],
      env: "sandbox",
      appVersion: "1.0 (1)",
    });
    expect(
      await redis.smembers<string[]>(redisKeys.integration.pushUserDevices(alice.username))
    ).toEqual([deviceToken]);

    // Omitting rooms keeps subscriptions; replacing drops the removed room index.
    await post(REGISTER, alice, { deviceToken });
    device = await getPushDevice(redis, deviceToken);
    expect(device?.rooms).toEqual([roomA, roomB]);
    expect(device?.appVersion).toBe("1.0 (1)");

    await post(REGISTER, alice, { deviceToken, rooms: [roomB] });
    expect(
      await redis.smembers<string[]>(redisKeys.integration.pushRoomDevices(roomA))
    ).toEqual([]);
    expect(
      await redis.smembers<string[]>(redisKeys.integration.pushRoomDevices(roomB))
    ).toEqual([deviceToken]);

    await redis.hset(redisKeys.integration.pushDeviceWatermarks(deviceToken), {
      [roomB]: JSON.stringify({ id: "m", ts: 1, burstStart: 1, burstCount: 1 }),
    });

    const res = await post(UNREGISTER, alice, { deviceToken });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await getPushDevice(redis, deviceToken)).toBeNull();
    expect(
      await redis.exists(redisKeys.integration.pushDeviceWatermarks(deviceToken))
    ).toBe(0);
    expect(
      await redis.smembers<string[]>(redisKeys.integration.pushRoomDevices(roomB))
    ).toEqual([]);

    // Unregistering again is still ok.
    expect((await post(UNREGISTER, alice, { deviceToken })).status).toBe(200);
  });

  test("accepts the ryos_auth session cookie", async () => {
    const deviceToken = newToken();
    const res = await fetchWithOrigin(REGISTER, {
      method: "POST",
      headers: {
        ...makeRateLimitBypassHeaders(),
        Cookie: `ryos_auth=${encodeURIComponent(alice.username)}:${alice.token}`,
      },
      body: JSON.stringify({ deviceToken }),
    });
    expect(res.status).toBe(200);
    expect((await getPushDevice(redis, deviceToken))?.username).toBe(alice.username);
    await post(UNREGISTER, alice, { deviceToken });
  });
});

describe("notifyRoomMessage trigger", () => {
  let sandbox: FakeApnsServer;
  let prod: FakeApnsServer;
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  const savedEnv: Record<string, string | undefined> = {
    RYOS_APNS_TEAM_ID: process.env.RYOS_APNS_TEAM_ID,
    RYOS_APNS_KEY_ID: process.env.RYOS_APNS_KEY_ID,
    RYOS_APNS_KEY_B64: process.env.RYOS_APNS_KEY_B64,
  };

  const pushesTo = (server: FakeApnsServer, deviceToken: string) =>
    server.requests.filter((request) => request.deviceToken === deviceToken);

  beforeAll(async () => {
    sandbox = await startFakeApns();
    prod = await startFakeApns();
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    process.env.RYOS_APNS_TEAM_ID = "TEAMID1234";
    process.env.RYOS_APNS_KEY_ID = "KEYID56789";
    process.env.RYOS_APNS_KEY_B64 = Buffer.from(
      privateKey.export({ format: "pem", type: "pkcs8" }) as string
    ).toString("base64");
    resetApnsState();
    setApnsHostsForTesting({ sandbox: sandbox.url, prod: prod.url });

    [alice, bob, carol] = await Promise.all([
      makeUser("pushs"),
      makeUser("pushr"),
      makeUser("pushc"),
    ]);
  });

  afterAll(async () => {
    setApnsHostsForTesting(null);
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetApnsState();
    await Promise.all([sandbox.close(), prod.close()]);
    await Promise.all(
      [alice, bob, carol].map((user) => post(`${BASE_URL}/api/auth/logout-all`, user, {}))
    );
  });

  test("private room: pushes other members only, with the iOS payload shape", async () => {
    const aliceDevice = newToken();
    const bobDevice = newToken();
    await post(REGISTER, alice, { deviceToken: aliceDevice });
    await post(REGISTER, bob, { deviceToken: bobDevice });

    const roomId = newRoomId();
    const room: ApiChatRoom = {
      id: roomId,
      name: `@${alice.username}, @${bob.username}`,
      type: "private",
      createdAt: Date.now(),
      userCount: 2,
      members: [alice.username, bob.username],
    };
    const message = makeMessage(roomId, alice.username, "hi bob &amp; co");
    await notifyRoomMessage(room, message, redis);

    expect(pushesTo(sandbox, aliceDevice)).toHaveLength(0);
    const [push] = pushesTo(sandbox, bobDevice);
    expect(push.body).toEqual({
      chatRoomId: roomId,
      aps: {
        alert: { title: `@${alice.username}`, body: "hi bob & co" },
        sound: "default",
        "thread-id": roomId,
      },
    } satisfies ApnsAlertPayload);

    // Same message again is deduped by the watermark.
    await notifyRoomMessage(room, message, redis);
    expect(pushesTo(sandbox, bobDevice)).toHaveLength(1);
    const watermark = await redis.hget(
      redisKeys.integration.pushDeviceWatermarks(bobDevice),
      roomId
    );
    expect(JSON.stringify(watermark)).toContain(message.id);

    // >3 messages inside the burst window collapse into a grouped push.
    for (let i = 0; i < 3; i++) {
      await notifyRoomMessage(room, makeMessage(roomId, alice.username, `m${i}`), redis);
    }
    const bobPushes = pushesTo(sandbox, bobDevice);
    expect(bobPushes).toHaveLength(4);
    expect(bobPushes[2].headers["apns-collapse-id"]).toBeUndefined();
    expect(bobPushes[3].headers["apns-collapse-id"]).toBe(`burst-${roomId}`);
    expect((bobPushes[3].body as ApnsAlertPayload).aps.alert.body).toBe("4 new messages");
  });

  test("public room: only devices subscribed via rooms, never the sender", async () => {
    const roomId = newRoomId();
    const bobDevice = newToken();
    const carolDevice = newToken();
    const aliceDevice = newToken();
    await post(REGISTER, bob, { deviceToken: bobDevice, rooms: [roomId] });
    await post(REGISTER, carol, { deviceToken: carolDevice, rooms: [] });
    await post(REGISTER, alice, { deviceToken: aliceDevice, rooms: [roomId] });

    const room: ApiChatRoom = {
      id: roomId,
      name: "pushtest",
      type: "public",
      createdAt: Date.now(),
      userCount: 0,
    };
    await notifyRoomMessage(room, makeMessage(roomId, alice.username, "x".repeat(400)), redis);

    expect(pushesTo(sandbox, carolDevice)).toHaveLength(0);
    expect(pushesTo(sandbox, aliceDevice)).toHaveLength(0);
    const [push] = pushesTo(sandbox, bobDevice);
    const alert = (push.body as ApnsAlertPayload).aps.alert;
    expect(alert.title).toBe(`@${alice.username} · #pushtest`);
    expect(Array.from(alert.body).length).toBe(240);
  });

  test("records the env that worked; removes tokens both hosts reject", async () => {
    const roomId = newRoomId();
    const prodDevice = newToken();
    const deadDevice = newToken();
    await post(REGISTER, bob, { deviceToken: prodDevice });
    await post(REGISTER, bob, { deviceToken: deadDevice });

    sandbox.respond = ({ deviceToken }) =>
      deviceToken === prodDevice || deviceToken === deadDevice
        ? { status: 400, reason: "BadDeviceToken" }
        : { status: 200 };
    prod.respond = ({ deviceToken }) =>
      deviceToken === deadDevice ? { status: 410, reason: "Unregistered" } : { status: 200 };

    const room: ApiChatRoom = {
      id: roomId,
      name: "dm",
      type: "private",
      createdAt: Date.now(),
      userCount: 2,
      members: [alice.username, bob.username],
    };
    await notifyRoomMessage(room, makeMessage(roomId, alice.username, "hello"), redis);

    expect(pushesTo(prod, prodDevice)).toHaveLength(1);
    expect((await getPushDevice(redis, prodDevice))?.env).toBe("prod");
    expect(await getPushDevice(redis, deadDevice)).toBeNull();

    // Next push goes straight to prod.
    const before = pushesTo(sandbox, prodDevice).length;
    await notifyRoomMessage(room, makeMessage(roomId, alice.username, "again"), redis);
    expect(pushesTo(sandbox, prodDevice)).toHaveLength(before);
    expect(pushesTo(prod, prodDevice)).toHaveLength(2);

    sandbox.respond = () => ({ status: 200 });
    prod.respond = () => ({ status: 200 });
  });

  test("signing out the registering session stops serving the device", async () => {
    const dave = await makeUser("pushd");
    const deviceToken = newToken();
    await post(REGISTER, dave, { deviceToken });

    const logout = await post(`${BASE_URL}/api/auth/logout`, dave, {});
    expect(logout.status).toBe(200);

    const roomId = newRoomId();
    await notifyRoomMessage(
      {
        id: roomId,
        name: "dm",
        type: "private",
        createdAt: Date.now(),
        userCount: 2,
        members: [alice.username, dave.username],
      },
      makeMessage(roomId, alice.username, "anyone?"),
      redis
    );
    expect(pushesTo(sandbox, deviceToken)).toHaveLength(0);
    expect(await getPushDevice(redis, deviceToken)).toBeNull();
  });

  test("logout-all removes every device row for the user", async () => {
    const erin = await makeUser("pushe");
    const tokens = [newToken(), newToken()];
    for (const deviceToken of tokens) await post(REGISTER, erin, { deviceToken });

    expect((await post(`${BASE_URL}/api/auth/logout-all`, erin, {})).status).toBe(200);
    for (const deviceToken of tokens) {
      expect(await getPushDevice(redis, deviceToken)).toBeNull();
    }
    expect(
      await redis.exists(redisKeys.integration.pushUserDevices(erin.username))
    ).toBe(0);
  });
});
