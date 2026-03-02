import { describe, expect, test } from "bun:test";
import { resolveInitialRoute } from "../src/apps/base/appRouteRegistry";

describe("App Route Registry - Live Desktop", () => {
  test("resolves /live/:id into live desktop join action", () => {
    const route = resolveInitialRoute("/live/session-123");
    expect(route).toBeTruthy();
    expect(route?.kind).toBe("live-desktop-join");
    if (!route || route.kind !== "live-desktop-join") return;
    expect(route.sessionId).toBe("session-123");
    expect(route.urlCleanupTiming).toBe("immediate");
  });

  test("preserves existing /listen/:id behavior", () => {
    const route = resolveInitialRoute("/listen/listen-session");
    expect(route).toBeTruthy();
    expect(route?.kind).toBe("launch");
  });
});
