import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("presence API client wiring", () => {
  test("global presence hook uses src/api/presence wrappers", () => {
    const source = readFileSync("src/hooks/useGlobalPresence.ts", "utf8");

    expect(source).toContain("@/api/presence");
    expect(source).toContain("sendPresenceHeartbeat");
    expect(source).toContain("fetchPresenceUsers");
    expect(source).not.toContain("/api/presence/heartbeat");
    expect(source).not.toContain("abortableFetch");
  });
});
