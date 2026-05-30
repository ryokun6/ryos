import { describe, expect, test } from "bun:test";
import { resolveInitialRoute } from "../src/apps/base/appRouteRegistry";

describe("resolveInitialRoute standalone iPod", () => {
  test("does not rewrite standalone iPod URLs to /", () => {
    expect(resolveInitialRoute("/standalone/ipod")).toBeNull();
    expect(resolveInitialRoute("/standalone/ipod/my-track")).toBeNull();
    expect(resolveInitialRoute("/standalone/ipod/track", "?listen=abc")).toBeNull();
  });
});
