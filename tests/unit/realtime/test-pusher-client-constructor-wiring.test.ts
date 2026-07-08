#!/usr/bin/env bun
/**
 * Tests for pusher client constructor resolution.
 *
 * Why:
 * A prior regression relied on globalThis.Pusher only, which broke under Vite
 * module builds. The resolver now prefers the dynamically-imported module
 * default and falls back to a global constructor. These tests exercise that
 * resolution behaviorally; the remaining two checks are structural guards that
 * keep pusher-js out of the static import graph (no runtime equivalent).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, test, expect } from "bun:test";

import { getPusherConstructor } from "../../../src/lib/pusherClient";

const readPusherClientSource = (): string =>
  readFileSync(resolve(process.cwd(), "src/lib/pusherClient.ts"), "utf-8");

const globalWithPusher = globalThis as typeof globalThis & {
  Pusher?: unknown;
};

class FakePusher {
  constructor(
    public key: string,
    public options: Record<string, unknown>
  ) {}
}

describe("Pusher constructor resolution", () => {
  afterEach(() => {
    delete globalWithPusher.Pusher;
  });

  test("prefers the module default export", () => {
    delete globalWithPusher.Pusher;
    const resolved = getPusherConstructor({ default: FakePusher });
    expect(resolved).toBe(FakePusher as never);
  });

  test("module default wins even when a global constructor exists", () => {
    class GlobalPusher {}
    globalWithPusher.Pusher = GlobalPusher;
    const resolved = getPusherConstructor({ default: FakePusher });
    expect(resolved).toBe(FakePusher as never);
  });

  test("falls back to the global constructor when no module default", () => {
    class GlobalPusher {}
    globalWithPusher.Pusher = GlobalPusher;
    expect(getPusherConstructor({})).toBe(GlobalPusher as never);
    // A namespace with an undefined default still falls through to the global.
    expect(getPusherConstructor({ default: undefined })).toBe(
      GlobalPusher as never
    );
  });

  test("throws an explicit error when no constructor is available", () => {
    delete globalWithPusher.Pusher;
    expect(() => getPusherConstructor({})).toThrow(
      "[pusherClient] Pusher constructor not available"
    );
  });

  test("the resolved constructor is what getPusherClient instantiates with", () => {
    delete globalWithPusher.Pusher;
    const Resolved = getPusherConstructor({ default: FakePusher });
    const instance = new Resolved("app-key", {
      cluster: "us2",
      forceTLS: true,
    });
    expect(instance).toBeInstanceOf(FakePusher);
    expect((instance as unknown as FakePusher).key).toBe("app-key");
  });
});

describe("Pusher static-import guards (structural)", () => {
  test("instantiates pusher via the constructor resolver", () => {
    const source = readPusherClientSource();
    expect(source).toMatch(
      /const Pusher = getPusherConstructor\(PusherNamespace\);/
    );
    expect(source).toMatch(/new Pusher\(PUSHER_APP_KEY/);
  });

  test("loads pusher-js only through a provider-branch dynamic import", () => {
    const source = readPusherClientSource();
    // No static `import ... "pusher-js"` (type-only imports are allowed).
    expect(source).not.toMatch(/import\s+(?!type)[^;]*["']pusher-js["']/);
    expect(source).toContain('import("pusher-js")');
    expect(source).toMatch(
      /if \(getRealtimeProvider\(\) === "local"\)[\s\S]*\} else \{[\s\S]*import\("pusher-js"\)/
    );
  });
});
