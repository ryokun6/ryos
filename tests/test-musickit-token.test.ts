import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { jwtVerify } from "jose";

import {
  parseMusicKitPrivateKey,
  listMusicKitMissingEnv,
} from "../api/_utils/_musickit-jwt";
import { fetchMusicKitApi } from "../src/hooks/useMusicKit";
import {
  deleteMusicKitUserToken,
  musicKitUserTokenKey,
  normalizeMusicKitUserToken,
  parseStoredMusicKitUserToken,
  readMusicKitUserToken,
  saveMusicKitUserToken,
} from "../api/_utils/musickit-user-token";
import type { Redis } from "../api/_utils/redis";

/**
 * Round-trip check: generate an ES256 key, sign a MusicKit JWT, and verify
 * the issued token has the expected claims (iss / iat / exp / origin).
 *
 * The sign helper caches the parsed CryptoKey across calls; the test runs
 * isolated by mutating env vars in `beforeEach`/`afterEach` and reloading
 * the module each time so cached keys don't bleed between cases.
 */

function generateP8(): { pem: string; pkcs8: string } {
  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const pkcs8 = privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();
  return { pem: pkcs8, pkcs8 };
}

const ORIGINAL_ENV = { ...process.env };

function createMockRedis(): Redis {
  const store = new Map<string, unknown>();
  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      return (store.get(key) as T | undefined) ?? null;
    },
    async set(key: string, value: unknown): Promise<unknown> {
      store.set(key, value);
      return "OK";
    },
    async del(...keys: string[]): Promise<number> {
      let removed = 0;
      for (const key of keys) {
        if (store.delete(key)) removed += 1;
      }
      return removed;
    },
  } as Redis;
}

describe("MusicKit JWT signer", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.MUSICKIT_TEAM_ID;
    delete process.env.MUSICKIT_KEY_ID;
    delete process.env.MUSICKIT_PRIVATE_KEY;
    delete process.env.MUSICKIT_ORIGIN;
    delete process.env.MAPKIT_TEAM_ID;
    delete process.env.MAPKIT_KEY_ID;
    delete process.env.MAPKIT_PRIVATE_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test("listMusicKitMissingEnv reports every required field", () => {
    const missing = listMusicKitMissingEnv();
    expect(missing).toContain("MUSICKIT_TEAM_ID");
    expect(missing).toContain("MUSICKIT_KEY_ID");
    expect(missing).toContain("MUSICKIT_PRIVATE_KEY");
  });

  test("falls back to MAPKIT_PRIVATE_KEY when MUSICKIT_PRIVATE_KEY is unset", () => {
    const { pem } = generateP8();
    process.env.MAPKIT_PRIVATE_KEY = pem;
    const parsed = parseMusicKitPrivateKey();
    expect(parsed.pem).not.toBeNull();
    expect(parsed.pem).toContain("BEGIN");
  });

  test("signs a token with the expected claims and verifies with the public key", async () => {
    // Bun's module caching means we have to re-import to reset the
    // cached private key inside `_musickit-jwt`.
    const moduleSpec = "../api/_utils/_musickit-jwt";
    const url = new URL(`${moduleSpec}.ts?cacheBust=${Date.now()}`, import.meta.url).href;
    const fresh = (await import(url)) as typeof import("../api/_utils/_musickit-jwt");

    const { privateKey: privKey, publicKey: pubKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    process.env.MUSICKIT_TEAM_ID = "TEAM1234AB";
    process.env.MUSICKIT_KEY_ID = "KEY1234567";
    process.env.MUSICKIT_PRIVATE_KEY = privKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
    process.env.MUSICKIT_ORIGIN = "https://os.example.com";

    const signed = await fresh.signMusicKitJwt(60);
    expect(typeof signed.token).toBe("string");
    expect(signed.expiresAt).toBeGreaterThan(Date.now());

    const verified = await jwtVerify(signed.token, pubKey);
    expect(verified.payload.iss).toBe("TEAM1234AB");
    expect(verified.payload.origin).toBe("https://os.example.com");
    expect(verified.protectedHeader.alg).toBe("ES256");
    expect(verified.protectedHeader.kid).toBe("KEY1234567");
  });

  test("omits the origin claim when MUSICKIT_ORIGIN is unset", async () => {
    const moduleSpec = "../api/_utils/_musickit-jwt";
    const url = new URL(`${moduleSpec}.ts?cacheBust=${Date.now()}-2`, import.meta.url).href;
    const fresh = (await import(url)) as typeof import("../api/_utils/_musickit-jwt");

    const { privateKey: privKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    process.env.MUSICKIT_TEAM_ID = "TEAM_NO_ORIGIN";
    process.env.MUSICKIT_KEY_ID = "KEY_NO_ORIGIN";
    process.env.MUSICKIT_PRIVATE_KEY = privKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();

    const signed = await fresh.signMusicKitJwt(60);
    // Decode the unsigned payload to inspect claims without re-verifying
    // the signature (the previous test cached a CryptoKey from a different
    // keypair, which would otherwise cause signature verification to fail
    // — we cover signature verification in the previous case).
    const [, payloadB64] = signed.token.split(".");
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    );
    expect(payload.origin).toBeUndefined();
    expect(payload.iss).toBe("TEAM_NO_ORIGIN");
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});

describe("MusicKit user token Redis storage", () => {
  test("uses a normalized per-user Redis key", () => {
    expect(musicKitUserTokenKey("Ryo")).toBe("musickit:user-token:ryo");
  });

  test("normalizes valid token strings and rejects invalid values", () => {
    expect(normalizeMusicKitUserToken("  music-user-token  ")).toBe(
      "music-user-token"
    );
    expect(normalizeMusicKitUserToken("")).toBeNull();
    expect(normalizeMusicKitUserToken(null)).toBeNull();
  });

  test("saves, reads, and deletes a token in Redis", async () => {
    const redis = createMockRedis();

    const saved = await saveMusicKitUserToken(redis, "Ryo", " user-token ");
    expect(saved.token).toBe("user-token");
    expect(saved.updatedAt).toBeTruthy();

    const loaded = await readMusicKitUserToken(redis, "ryo");
    expect(loaded).toEqual(saved);

    await deleteMusicKitUserToken(redis, "RYO");
    expect(await readMusicKitUserToken(redis, "ryo")).toBeNull();
  });

  test("parses legacy raw-string values defensively", () => {
    expect(parseStoredMusicKitUserToken("raw-token")).toEqual({
      token: "raw-token",
      updatedAt: "",
    });
    expect(parseStoredMusicKitUserToken("{not json")).toEqual({
      token: "{not json",
      updatedAt: "",
    });
  });
});

describe("MusicKit client token sync fetch", () => {
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window"
  );

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      delete (globalThis as typeof globalThis & { window?: unknown }).window;
    }
  });

  test("uses the configured API origin with credentials in Tauri", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        __TAURI__: {},
        __RYOS_RUNTIME_CONFIG__: {
          appPublicOrigin: "https://os.example.com",
        },
        location: {
          origin: "tauri://localhost",
        },
      },
    });

    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await fetchMusicKitApi("/api/musickit-user-token", {
      method: "PUT",
      credentials: "omit",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://os.example.com/api/musickit-user-token");
    expect(calls[0]?.init?.credentials).toBe("include");
    expect(calls[0]?.init?.method).toBe("PUT");
  });

  test("keeps web requests same-origin but still includes credentials", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          origin: "https://web.example.com",
        },
      },
    });

    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await fetchMusicKitApi("/api/musickit-token", { method: "GET" });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/musickit-token");
    expect(calls[0]?.init?.credentials).toBe("include");
  });
});
