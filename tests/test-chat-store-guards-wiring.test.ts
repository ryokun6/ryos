/**
 * Guardrail tests for chat store API response/cooldown wiring.
 *
 * Ensures useChatsStore keeps its cooldown + availability-gate pattern
 * so frontend-only mode doesn't spam failing requests.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test, expect } from "bun:test";

const readStoreSource = (): string =>
  readFileSync(resolve(process.cwd(), "src/stores/useChatsStore.ts"), "utf-8");

const countMatches = (source: string, pattern: RegExp): number =>
  source.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))
    ?.length || 0;

describe("Chat Store Guard Wiring Tests", () => {
  describe("Cooldown availability checks", () => {
    test("checks cooldown gate for each chat fetch endpoint", async () => {
      const source = readStoreSource();

      expect(countMatches(source, /isApiTemporarilyUnavailable\("rooms"\)/)).toBe(1);
      expect(countMatches(source, /isApiTemporarilyUnavailable\("room-messages"\)/)).toBe(1);
      expect(countMatches(source, /isApiTemporarilyUnavailable\("bulk-messages"\)/)).toBe(1);
    });

    test("uses a positive cooldown duration constant", async () => {
      const source = readStoreSource();
      const match = source.match(/API_UNAVAILABLE_COOLDOWN_MS\s*=\s*([0-9_]+)/);
      expect(match?.[1]).toBeTruthy();
      const parsedMs = Number((match?.[1] || "").replaceAll("_", ""));
      expect(parsedMs > 0).toBe(true);
    });

    test("marks cooldown on fetch failures", async () => {
      const source = readStoreSource();

      expect(countMatches(source, /markApiTemporarilyUnavailable\("rooms"\)/)).toBeGreaterThanOrEqual(1);
      expect(countMatches(source, /markApiTemporarilyUnavailable\("room-messages"\)/)).toBeGreaterThanOrEqual(1);
      expect(countMatches(source, /markApiTemporarilyUnavailable\("bulk-messages"\)/)).toBeGreaterThanOrEqual(1);
    });

    test("clears cooldown after successful payload parse", async () => {
      const source = readStoreSource();

      expect(countMatches(source, /clearApiUnavailable\("rooms"\)/)).toBe(1);
      expect(countMatches(source, /clearApiUnavailable\("room-messages"\)/)).toBe(1);
      expect(countMatches(source, /clearApiUnavailable\("bulk-messages"\)/)).toBe(1);
    });
  });
});
