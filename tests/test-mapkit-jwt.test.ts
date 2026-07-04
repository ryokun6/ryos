import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { jwtVerify } from "jose";

import {
  parseMapKitPrivateKey,
  listMapKitMissingEnv,
} from "../api/_utils/_mapkit-jwt";

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

describe("MapKit JWT signer", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.MAPKIT_TEAM_ID;
    delete process.env.MAPKIT_KEY_ID;
    delete process.env.MAPKIT_PRIVATE_KEY;
    delete process.env.MAPKIT_ORIGIN;
    delete process.env.APP_PUBLIC_ORIGIN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test("listMapKitMissingEnv reports every required field", () => {
    const missing = listMapKitMissingEnv();
    expect(missing).toContain("MAPKIT_TEAM_ID");
    expect(missing).toContain("MAPKIT_KEY_ID");
    expect(missing).toContain("MAPKIT_PRIVATE_KEY");
  });

  test("falls back to APP_PUBLIC_ORIGIN when MAPKIT_ORIGIN is unset", async () => {
    const moduleSpec = "../api/_utils/_mapkit-jwt";
    const url = new URL(
      `${moduleSpec}.ts?cacheBust=${Date.now()}`,
      import.meta.url
    ).href;
    const fresh = (await import(url)) as typeof import("../api/_utils/_mapkit-jwt");

    const { privateKey: privKey, publicKey: pubKey } = generateKeyPairSync(
      "ec",
      { namedCurve: "P-256" }
    );
    process.env.MAPKIT_TEAM_ID = "TEAM1234AB";
    process.env.MAPKIT_KEY_ID = "KEY1234567";
    process.env.MAPKIT_PRIVATE_KEY = privKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";

    const signed = await fresh.signMapKitJwt("mapkit-js", 60);
    const verified = await jwtVerify(signed.token, pubKey);
    expect(verified.payload.origin).toBe("https://os.example.com");
  });

  test("prefers MAPKIT_ORIGIN over APP_PUBLIC_ORIGIN", async () => {
    const moduleSpec = "../api/_utils/_mapkit-jwt";
    const url = new URL(
      `${moduleSpec}.ts?cacheBust=${Date.now()}-2`,
      import.meta.url
    ).href;
    const fresh = (await import(url)) as typeof import("../api/_utils/_mapkit-jwt");

    const { privateKey: privKey, publicKey: pubKey } = generateKeyPairSync(
      "ec",
      { namedCurve: "P-256" }
    );
    process.env.MAPKIT_TEAM_ID = "TEAM1234AB";
    process.env.MAPKIT_KEY_ID = "KEY1234567";
    process.env.MAPKIT_PRIVATE_KEY = privKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
    process.env.MAPKIT_ORIGIN = "https://maps.example.com";
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";

    const signed = await fresh.signMapKitJwt("mapkit-js", 60);
    const verified = await jwtVerify(signed.token, pubKey);
    expect(verified.payload.origin).toBe("https://maps.example.com");
  });

  test("uses allowed request origin when explicit env vars are unset", async () => {
    const moduleSpec = "../api/_utils/_mapkit-jwt";
    const url = new URL(
      `${moduleSpec}.ts?cacheBust=${Date.now()}-3`,
      import.meta.url
    ).href;
    const fresh = (await import(url)) as typeof import("../api/_utils/_mapkit-jwt");

    const { privateKey: privKey, publicKey: pubKey } = generateKeyPairSync(
      "ec",
      { namedCurve: "P-256" }
    );
    process.env.MAPKIT_TEAM_ID = "TEAM1234AB";
    process.env.MAPKIT_KEY_ID = "KEY1234567";
    process.env.MAPKIT_PRIVATE_KEY = privKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();

    const signed = await fresh.signMapKitJwt("mapkit-js", 60, {
      requestOrigin: "http://localhost:5173",
    });
    const verified = await jwtVerify(signed.token, pubKey);
    expect(verified.payload.origin).toBe("http://localhost:5173");
  });

  test("omits the origin claim for maps-server-api tokens", async () => {
    const moduleSpec = "../api/_utils/_mapkit-jwt";
    const url = new URL(
      `${moduleSpec}.ts?cacheBust=${Date.now()}-4`,
      import.meta.url
    ).href;
    const fresh = (await import(url)) as typeof import("../api/_utils/_mapkit-jwt");

    const { privateKey: privKey, publicKey: pubKey } = generateKeyPairSync(
      "ec",
      { namedCurve: "P-256" }
    );
    process.env.MAPKIT_TEAM_ID = "TEAM1234AB";
    process.env.MAPKIT_KEY_ID = "KEY1234567";
    process.env.MAPKIT_PRIVATE_KEY = privKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";

    const signed = await fresh.signMapKitJwt("maps-server-api", 60, {
      requestOrigin: "https://os.example.com",
    });
    const verified = await jwtVerify(signed.token, pubKey);
    expect(verified.payload.origin).toBeUndefined();
  });

  test("parseMapKitPrivateKey accepts a valid PEM key", () => {
    const { pem } = generateP8();
    process.env.MAPKIT_PRIVATE_KEY = pem;
    const parsed = parseMapKitPrivateKey();
    expect(parsed.pem).not.toBeNull();
    expect(parsed.pem).toContain("BEGIN");
  });
});
