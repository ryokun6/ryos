import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { jwtVerify } from "jose";

import { resolveMapKitJsOrigin } from "../api/_utils/_mapkit-jwt";

const ORIGINAL_ENV = { ...process.env };

describe("resolveMapKitJsOrigin", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.MAPKIT_ORIGIN;
    delete process.env.APP_PUBLIC_ORIGIN;
    delete process.env.PUBLIC_APP_ORIGIN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test("prefers MAPKIT_ORIGIN when configured", () => {
    process.env.MAPKIT_ORIGIN = "https://maps.example.com";
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";
    expect(resolveMapKitJsOrigin("http://localhost:5173")).toBe(
      "https://maps.example.com"
    );
  });

  test("uses an allowed request origin before APP_PUBLIC_ORIGIN", () => {
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";
    expect(resolveMapKitJsOrigin("http://localhost:5173")).toBe(
      "http://localhost:5173"
    );
  });

  test("falls back to APP_PUBLIC_ORIGIN when request origin is absent", () => {
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";
    expect(resolveMapKitJsOrigin(null)).toBe("https://os.example.com");
  });
});

describe("MapKit JWT signer", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.MAPKIT_ORIGIN;
    delete process.env.APP_PUBLIC_ORIGIN;
    delete process.env.PUBLIC_APP_ORIGIN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test("includes the resolved origin claim for mapkit-js tokens", async () => {
    const moduleSpec = "../api/_utils/_mapkit-jwt";
    const url = new URL(`${moduleSpec}.ts?cacheBust=${Date.now()}`, import.meta.url).href;
    const fresh = (await import(url)) as typeof import("../api/_utils/_mapkit-jwt");

    const { privateKey: privKey, publicKey: pubKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    process.env.MAPKIT_TEAM_ID = "TEAM1234AB";
    process.env.MAPKIT_KEY_ID = "KEY1234567";
    process.env.MAPKIT_PRIVATE_KEY = privKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";

    const signed = await fresh.signMapKitJwt("mapkit-js", 60, {
      requestOrigin: "http://localhost:5173",
    });
    const verified = await jwtVerify(signed.token, pubKey);

    expect(verified.payload.origin).toBe("http://localhost:5173");
    expect(verified.payload.iss).toBe("TEAM1234AB");
  });
});
