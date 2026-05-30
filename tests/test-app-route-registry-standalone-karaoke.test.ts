import { describe, expect, test } from "bun:test";
import { resolveInitialRoute } from "../src/apps/base/appRouteRegistry";

describe("resolveInitialRoute standalone Karaoke", () => {
  test("does not rewrite standalone Karaoke URLs to /", () => {
    expect(resolveInitialRoute("/standalone/karaoke")).toBeNull();
    expect(resolveInitialRoute("/standalone/karaoke/my-track")).toBeNull();
    expect(resolveInitialRoute("/standalone/karaoke/track", "?listen=abc")).toBeNull();
  });
});
