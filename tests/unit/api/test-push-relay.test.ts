import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";
import { jwtVerify } from "jose";
import {
  APNS_TOPIC,
  buildPushPayload,
  derToJoseSignature,
  formatPushPreview,
  getPushRoomLabel,
  isPushConfigured,
  normalizeDeviceToken,
  resetApnsState,
  sendApnsNotification,
  setApnsHostsForTesting,
  signApnsJwt,
} from "../../../api/_utils/push-relay";
import { startFakeApns, type FakeApnsServer } from "../../helpers/fake-apns";

const TOKEN = "ab".repeat(32);
const ENV_KEYS = [
  "RYOS_APNS_TEAM_ID",
  "RYOS_APNS_KEY_ID",
  "RYOS_APNS_KEY_B64",
  "RYOS_APNS_KEY_FILE",
] as const;

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

function verifyJwt(jwt: string, publicKey: KeyObject): boolean {
  const [header, claims, signature] = jwt.split(".");
  return cryptoVerify(
    "sha256",
    Buffer.from(`${header}.${claims}`),
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(signature, "base64url")
  );
}

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  setApnsHostsForTesting(null);
  resetApnsState();
});

function configureTestKey(): void {
  process.env.RYOS_APNS_TEAM_ID = "TEAMID1234";
  process.env.RYOS_APNS_KEY_ID = "KEYID56789";
  process.env.RYOS_APNS_KEY_B64 = Buffer.from(
    privateKey.export({ format: "pem", type: "pkcs8" }) as string
  ).toString("base64");
  delete process.env.RYOS_APNS_KEY_FILE;
  resetApnsState();
}

describe("derToJoseSignature", () => {
  test("converts node DER signatures to verifiable 64-byte r||s", () => {
    for (let i = 0; i < 50; i++) {
      const data = Buffer.from(`payload-${i}`);
      const der = cryptoSign("sha256", data, privateKey);
      const raw = derToJoseSignature(der);
      expect(raw.length).toBe(64);
      expect(
        cryptoVerify("sha256", data, { key: publicKey, dsaEncoding: "ieee-p1363" }, raw)
      ).toBe(true);
    }
  });

  test("left-pads short integers and strips sign bytes", () => {
    // r = 0x01 (1 byte), s = 0x00ff..ff (33 bytes, leading sign byte)
    const s = Buffer.concat([Buffer.from([0x00]), Buffer.alloc(32, 0xff)]);
    const der = Buffer.concat([
      Buffer.from([0x30, 2 + 1 + 2 + s.length, 0x02, 0x01, 0x01, 0x02, s.length]),
      s,
    ]);
    const raw = derToJoseSignature(der);
    expect(raw.subarray(0, 32).equals(Buffer.concat([Buffer.alloc(31), Buffer.from([1])]))).toBe(true);
    expect(raw.subarray(32).equals(Buffer.alloc(32, 0xff))).toBe(true);
  });

  test("rejects malformed input", () => {
    expect(() => derToJoseSignature(Buffer.from([0x31, 0x00]))).toThrow();
  });
});

describe("signApnsJwt", () => {
  test("produces an ES256 JWT with kid/iss/iat that verifies", () => {
    const jwt = signApnsJwt(
      { teamId: "TEAMID1234", keyId: "KEYID56789", key: privateKey },
      1_700_000_000_123
    );
    const [header, claims] = jwt.split(".");
    expect(decodeSegment(header)).toEqual({ alg: "ES256", kid: "KEYID56789" });
    expect(decodeSegment(claims)).toEqual({ iss: "TEAMID1234", iat: 1_700_000_000 });
    expect(verifyJwt(jwt, publicKey)).toBe(true);
  });

  test("verifies with an independent JWS implementation (jose)", async () => {
    const nowMs = Date.now();
    const jwt = signApnsJwt({ teamId: "TEAMID1234", keyId: "KEYID56789", key: privateKey }, nowMs);
    const { payload, protectedHeader } = await jwtVerify(jwt, publicKey, {
      algorithms: ["ES256"],
      issuer: "TEAMID1234",
    });
    expect(protectedHeader).toEqual({ alg: "ES256", kid: "KEYID56789" });
    expect(payload.iat).toBe(Math.floor(nowMs / 1000));
  });
});

describe("config", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    resetApnsState();
  });

  test("is unconfigured without env", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    resetApnsState();
    expect(isPushConfigured()).toBe(false);
  });

  test("loads the .p8 from base64 env", () => {
    configureTestKey();
    expect(isPushConfigured()).toBe(true);
  });

  test("treats an unparsable key as unconfigured", () => {
    configureTestKey();
    process.env.RYOS_APNS_KEY_B64 = Buffer.from("not a key").toString("base64");
    resetApnsState();
    expect(isPushConfigured()).toBe(false);
  });
});

describe("payload formatting", () => {
  test("chatRoomId is a sibling of aps", () => {
    expect(buildPushPayload("room1", "@alice · #general", "hi")).toEqual({
      chatRoomId: "room1",
      aps: {
        alert: { title: "@alice · #general", body: "hi" },
        sound: "default",
        "thread-id": "room1",
      },
    });
  });

  test("preview decodes stored HTML entities and caps at 240 chars", () => {
    expect(formatPushPreview("a &amp; b &lt;3\n\nnew  line")).toBe("a & b <3 new line");
    const long = formatPushPreview("x".repeat(500));
    expect(Array.from(long).length).toBe(240);
    expect(long.endsWith("…")).toBe(true);
    expect(Array.from(formatPushPreview("😀".repeat(300))).length).toBe(240);
  });

  test("room labels", () => {
    expect(getPushRoomLabel({ name: "general", type: "public" }, "bob", "alice")).toBe("#general");
    expect(getPushRoomLabel({ name: "#irc", type: "irc" }, "bob", "alice")).toBe("#irc");
    expect(
      getPushRoomLabel({ name: "@alice, @bob", type: "private", members: ["alice", "bob"] }, "bob", "Alice")
    ).toBeNull();
    expect(
      getPushRoomLabel(
        { name: "x", type: "private", members: ["alice", "bob", "carol"] },
        "bob",
        "alice"
      )
    ).toBe("@carol");
  });

  test("normalizeDeviceToken", () => {
    expect(normalizeDeviceToken(TOKEN.toUpperCase())).toBe(TOKEN);
    expect(normalizeDeviceToken(` ${TOKEN} `)).toBe(TOKEN);
    expect(normalizeDeviceToken("ab".repeat(31))).toBeNull();
    expect(normalizeDeviceToken("zz".repeat(32))).toBeNull();
    expect(normalizeDeviceToken(42)).toBeNull();
  });
});

describe("sendApnsNotification", () => {
  let sandbox: FakeApnsServer;
  let prod: FakeApnsServer;

  beforeAll(async () => {
    sandbox = await startFakeApns();
    prod = await startFakeApns();
  });

  afterAll(async () => {
    setApnsHostsForTesting(null);
    await Promise.all([sandbox.close(), prod.close()]);
  });

  afterEach(() => {
    sandbox.requests.length = 0;
    prod.requests.length = 0;
    sandbox.respond = () => ({ status: 200 });
    prod.respond = () => ({ status: 200 });
  });

  function useFakes() {
    configureTestKey();
    setApnsHostsForTesting({ sandbox: sandbox.url, prod: prod.url });
  }

  test("returns null when unconfigured", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    resetApnsState();
    expect(await sendApnsNotification(TOKEN, buildPushPayload("r", "t", "b"))).toBeNull();
  });

  test("sends the expected headers, path, JWT, and body", async () => {
    useFakes();
    const payload = buildPushPayload("room1", "@alice · #general", "hello");
    const result = await sendApnsNotification(TOKEN, payload, { env: "sandbox" });

    expect(result).toMatchObject({ ok: true, status: 200, env: "sandbox", envChanged: false });
    expect(sandbox.requests).toHaveLength(1);
    const [request] = sandbox.requests;
    expect(request.path).toBe(`/3/device/${TOKEN}`);
    expect(request.headers[":method"]).toBe("POST");
    expect(request.headers["apns-topic"]).toBe(APNS_TOPIC);
    expect(request.headers["apns-push-type"]).toBe("alert");
    expect(request.headers["apns-priority"]).toBe("10");
    expect(request.headers["content-type"]).toBe("application/json");
    expect(request.body).toEqual(payload);

    const auth = String(request.headers.authorization);
    expect(auth.startsWith("bearer ")).toBe(true);
    expect(verifyJwt(auth.slice(7), createPublicKey(privateKey))).toBe(true);
    expect(prod.requests).toHaveLength(0);
  });

  test("reuses the cached provider token across sends", async () => {
    useFakes();
    await sendApnsNotification(TOKEN, buildPushPayload("r", "t", "1"));
    await sendApnsNotification(TOKEN, buildPushPayload("r", "t", "2"));
    expect(sandbox.requests[0].headers.authorization).toBe(sandbox.requests[1].headers.authorization);
  });

  test("fails over to prod on a sandbox mismatch and reports the env change", async () => {
    useFakes();
    sandbox.respond = () => ({ status: 400, reason: "BadDeviceToken" });
    const result = await sendApnsNotification(TOKEN, buildPushPayload("r", "t", "b"), {
      env: "sandbox",
    });
    expect(result).toMatchObject({ ok: true, env: "prod", envChanged: true, tokenDead: false });
    expect(sandbox.requests).toHaveLength(1);
    expect(prod.requests).toHaveLength(1);
  });

  test("fails over on 410 Unregistered and 403 BadEnvironmentKeyInToken", async () => {
    useFakes();
    prod.respond = () => ({ status: 410, reason: "Unregistered" });
    let result = await sendApnsNotification(TOKEN, buildPushPayload("r", "t", "b"), { env: "prod" });
    expect(result).toMatchObject({ ok: true, env: "sandbox", envChanged: true });

    prod.respond = () => ({ status: 403, reason: "BadEnvironmentKeyInToken" });
    result = await sendApnsNotification(TOKEN, buildPushPayload("r", "t", "b"), { env: "prod" });
    expect(result).toMatchObject({ ok: true, env: "sandbox", envChanged: true });
  });

  test("flags the token dead when both hosts reject it", async () => {
    useFakes();
    sandbox.respond = () => ({ status: 400, reason: "BadDeviceToken" });
    prod.respond = () => ({ status: 400, reason: "BadDeviceToken" });
    const result = await sendApnsNotification(TOKEN, buildPushPayload("r", "t", "b"));
    expect(result).toMatchObject({
      ok: false,
      status: 400,
      reason: "BadDeviceToken",
      env: "sandbox",
      envChanged: false,
      tokenDead: true,
    });
  });

  test("does not fail over or flag dead on provider-token errors", async () => {
    useFakes();
    sandbox.respond = () => ({ status: 403, reason: "InvalidProviderToken" });
    const result = await sendApnsNotification(TOKEN, buildPushPayload("r", "t", "b"));
    expect(result).toMatchObject({ ok: false, status: 403, tokenDead: false });
    expect(prod.requests).toHaveLength(0);
  });

  test("re-signs once on ExpiredProviderToken", async () => {
    useFakes();
    let calls = 0;
    sandbox.respond = () =>
      ++calls === 1 ? { status: 403, reason: "ExpiredProviderToken" } : { status: 200 };
    const result = await sendApnsNotification(TOKEN, buildPushPayload("r", "t", "b"));
    expect(result?.ok).toBe(true);
    expect(sandbox.requests).toHaveLength(2);
  });

  test("passes apns-collapse-id when requested", async () => {
    useFakes();
    await sendApnsNotification(TOKEN, buildPushPayload("r", "t", "b"), { collapseId: "burst-r" });
    expect(sandbox.requests[0].headers["apns-collapse-id"]).toBe("burst-r");
  });
});
