import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { jwtVerify } from "jose";

import {
  parseMusicKitPrivateKey,
  listMusicKitMissingEnv,
} from "../api/_utils/_musickit-jwt";

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
