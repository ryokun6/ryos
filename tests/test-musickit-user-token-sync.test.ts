/**
 * Unit tests for the MusicKit user-token cloud-sync surface.
 *
 *   - `parseStoredToken` (server) — input validation / shape handling
 *   - `getTokenKey`               — Redis key derivation
 *   - `isExpired`                 — client-side expiry predicate
 *
 * Integration coverage for the HTTP endpoint itself
 * (GET / PUT / DELETE round trip with auth) lives in the standalone
 * API server test suite — these tests focus on the pure helpers so
 * they don't need a running Redis or fake-indexeddb.
 */

import { describe, expect, test } from "bun:test";

import {
  parseStoredToken,
  getTokenKey,
  TOKEN_KEY_PREFIX,
  MAX_TOKEN_LENGTH,
} from "../api/musickit-user-token";
import { isExpired } from "../src/utils/musicKitUserTokenCloudSync";

describe("parseStoredToken (server)", () => {
  test("returns null for falsy / non-object inputs", () => {
    expect(parseStoredToken(null)).toBeNull();
    expect(parseStoredToken(undefined)).toBeNull();
    expect(parseStoredToken("")).toBeNull();
    expect(parseStoredToken(0)).toBeNull();
    expect(parseStoredToken(false)).toBeNull();
  });

  test("returns null when the JSON string fails to parse", () => {
    expect(parseStoredToken("{ broken json")).toBeNull();
  });

  test("returns null when the parsed object has no musicUserToken", () => {
    expect(parseStoredToken({})).toBeNull();
    expect(parseStoredToken({ musicUserToken: "" })).toBeNull();
    expect(parseStoredToken({ musicUserToken: 42 })).toBeNull();
  });

  test("accepts an already-parsed object", () => {
    const result = parseStoredToken({
      musicUserToken: "user-token-xyz",
      expiresAt: 1_700_000_000_000,
      storedAt: 1_699_999_999_000,
    });
    expect(result).toEqual({
      musicUserToken: "user-token-xyz",
      expiresAt: 1_700_000_000_000,
      storedAt: 1_699_999_999_000,
    });
  });

  test("accepts a JSON-encoded string and decodes it", () => {
    const raw = JSON.stringify({
      musicUserToken: "abc.def.ghi",
      expiresAt: 1_750_000_000_000,
      storedAt: 1_749_000_000_000,
    });
    const result = parseStoredToken(raw);
    expect(result).toEqual({
      musicUserToken: "abc.def.ghi",
      expiresAt: 1_750_000_000_000,
      storedAt: 1_749_000_000_000,
    });
  });

  test("coerces missing/invalid expiresAt to null and missing storedAt to a recent value", () => {
    const before = Date.now();
    const result = parseStoredToken({
      musicUserToken: "tok",
      expiresAt: "not-a-number",
    });
    const after = Date.now();
    expect(result?.musicUserToken).toBe("tok");
    expect(result?.expiresAt).toBeNull();
    // storedAt is filled in defensively when absent so downstream
    // consumers can always rely on a number.
    expect(result?.storedAt).toBeGreaterThanOrEqual(before);
    expect(result?.storedAt).toBeLessThanOrEqual(after);
  });
});

describe("getTokenKey (server)", () => {
  test("namespaces under the documented Redis prefix", () => {
    expect(getTokenKey("ryo")).toBe(`${TOKEN_KEY_PREFIX}ryo`);
  });

  test("lowercases the username so case-variants share storage", () => {
    expect(getTokenKey("RYO")).toBe(`${TOKEN_KEY_PREFIX}ryo`);
    expect(getTokenKey("Ryo")).toBe(`${TOKEN_KEY_PREFIX}ryo`);
  });

  test("MAX_TOKEN_LENGTH is large enough for real Apple-issued user tokens", () => {
    // Apple Music user tokens are typically a few hundred chars; the
    // 4 KiB cap leaves headroom for future format changes without
    // accepting nonsense-sized payloads.
    expect(MAX_TOKEN_LENGTH).toBeGreaterThan(1024);
  });
});

describe("isExpired (client)", () => {
  test("treats null expiresAt as 'unknown — not expired'", () => {
    expect(
      isExpired({
        musicUserToken: "tok",
        expiresAt: null,
        storedAt: 0,
      })
    ).toBe(false);
  });

  test("returns true for a past expiresAt", () => {
    expect(
      isExpired({
        musicUserToken: "tok",
        expiresAt: Date.now() - 1000,
        storedAt: 0,
      })
    ).toBe(true);
  });

  test("returns false for a future expiresAt", () => {
    expect(
      isExpired({
        musicUserToken: "tok",
        expiresAt: Date.now() + 60_000,
        storedAt: 0,
      })
    ).toBe(false);
  });

  test("returns true at the exact expiry boundary (defense in depth)", () => {
    const now = Date.now();
    expect(
      isExpired({
        musicUserToken: "tok",
        expiresAt: now,
        storedAt: 0,
      })
    ).toBe(true);
  });
});
