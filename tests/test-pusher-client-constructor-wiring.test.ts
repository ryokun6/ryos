#!/usr/bin/env bun
/**
 * Guardrail tests for pusher client constructor resolution wiring.
 *
 * Why:
 * A prior regression relied on globalThis.Pusher only, which broke under Vite
 * module builds. These checks ensure dynamic module-default + global fallback
 * logic stays in place without restoring a static pusher-js runtime import.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test, expect } from "bun:test";

const readPusherClientSource = (): string =>
  readFileSync(resolve(process.cwd(), "src/lib/pusherClient.ts"), "utf-8");

describe("Pusher Constructor Wiring Tests", () => {
  describe("Constructor resolution fallback", () => {
    test("dynamically imports pusher-js instead of statically importing runtime", async () => {
      const source = readPusherClientSource();
      expect(source.includes('import("pusher-js")')).toBe(true);
      expect(source.includes('import * as PusherNamespace from "pusher-js"')).toBe(false);
    });

    test("checks module default constructor first", async () => {
      const source = readPusherClientSource();
      expect(source.includes("constructorFromModule")).toBe(true);
      expect(/PusherNamespace[\s\S]*\.default/.test(source)).toBe(true);
    });

    test("falls back to global constructor when needed", async () => {
      const source = readPusherClientSource();
      expect(source.includes("constructorFromGlobal")).toBe(true);
      expect(source.includes("globalWithPusher.Pusher")).toBe(true);
    });

    test("throws explicit error when no constructor is available", async () => {
      const source = readPusherClientSource();
      expect(source.includes("[pusherClient] Pusher constructor not available")).toBe(true);
    });

    test("getPusherClient instantiates via lazy realtime wrapper", async () => {
      const source = readPusherClientSource();
      expect(/new LazyPusherRealtimeClient\(PUSHER_APP_KEY/.test(source)).toBe(true);
      expect(/new Pusher\(this\.key, this\.options\)/.test(source)).toBe(true);
    });
  });
});
