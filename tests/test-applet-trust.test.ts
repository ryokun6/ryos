/**
 * Tests for applet author trust resolution and sandbox derivation.
 *
 * Goal: only applets explicitly authored by the trusted admin (`ryo`) get
 * `allow-same-origin` and the auth bridge. Every other applet — including
 * the currently-logged-in user's own — is sandboxed without same-origin
 * so it cannot read parent localStorage / cookies / IndexedDB.
 */

import { describe, expect, test } from "bun:test";
import {
  getAppletSandboxAttribute,
  isTrustedAppletAuthor,
  TRUSTED_APPLET_AUTHOR,
} from "../src/utils/appletAuthBridge";

describe("isTrustedAppletAuthor", () => {
  test("recognises the trusted admin (case-insensitive)", () => {
    expect(isTrustedAppletAuthor("ryo")).toBe(true);
    expect(isTrustedAppletAuthor("Ryo")).toBe(true);
    expect(isTrustedAppletAuthor("RYO")).toBe(true);
    expect(isTrustedAppletAuthor(" ryo ")).toBe(true);
    expect(TRUSTED_APPLET_AUTHOR).toBe("ryo");
  });

  test("rejects every other author including the local user", () => {
    expect(isTrustedAppletAuthor("alice")).toBe(false);
    expect(isTrustedAppletAuthor("bob")).toBe(false);
    expect(isTrustedAppletAuthor("ryosomething")).toBe(false);
    expect(isTrustedAppletAuthor("notryo")).toBe(false);
  });

  test("treats null / undefined / empty as untrusted", () => {
    expect(isTrustedAppletAuthor(null)).toBe(false);
    expect(isTrustedAppletAuthor(undefined)).toBe(false);
    expect(isTrustedAppletAuthor("")).toBe(false);
    expect(isTrustedAppletAuthor("   ")).toBe(false);
  });
});

describe("getAppletSandboxAttribute", () => {
  test("trusted applets receive allow-same-origin", () => {
    const attr = getAppletSandboxAttribute(true);
    expect(attr.split(/\s+/)).toContain("allow-same-origin");
    expect(attr.split(/\s+/)).toContain("allow-scripts");
  });

  test("untrusted applets must NOT receive allow-same-origin", () => {
    const attr = getAppletSandboxAttribute(false);
    expect(attr.split(/\s+/)).not.toContain("allow-same-origin");
    // Scripts are still allowed — without scripts there is no applet.
    expect(attr.split(/\s+/)).toContain("allow-scripts");
  });
});
