import { describe, expect, test } from "bun:test";
import { shouldServeSpaFallback } from "../scripts/spa-static-fallback";

describe("standalone Bun server SPA fallback (non-Vercel)", () => {
  test("serves index.html for standalone iPod app routes", () => {
    expect(shouldServeSpaFallback("/standalone/ipod")).toBe(true);
    expect(shouldServeSpaFallback("/standalone/ipod/")).toBe(true);
    expect(shouldServeSpaFallback("/standalone/ipod/my-track-id")).toBe(true);
    expect(shouldServeSpaFallback("/ipod")).toBe(true);
    expect(shouldServeSpaFallback("/ipod/shared-song")).toBe(true);
  });

  test("does not SPA-fallback API or static asset paths", () => {
    expect(shouldServeSpaFallback("/api/health")).toBe(false);
    expect(shouldServeSpaFallback("/api")).toBe(false);
    expect(shouldServeSpaFallback("/assets/index-DOUbUONm.js")).toBe(false);
    expect(shouldServeSpaFallback("/favicon.ico")).toBe(false);
  });
});
