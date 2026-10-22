#!/usr/bin/env bun
/**
 * Direct-passthrough domains skip `/api/iframe-check` in "now" mode so
 * origin-sensitive SPAs (BrowserRouter) keep a real pathname. ryOS's own
 * ryo.lu sites are classified separately (see test-ie-first-party).
 */
import "../../helpers/local-storage-stub";
import { describe, expect, test } from "bun:test";
import {
  DIRECT_PASSTHROUGH_DOMAINS,
  isDirectPassthrough,
} from "../../../src/stores/useInternetExplorerStore.ts";
import {
  buildIeTrustContext,
  classifyIeTarget,
} from "../../../src/apps/internet-explorer/utils/ieFirstParty.ts";

describe("isDirectPassthrough", () => {
  test("ryo.lu sites load directly through the first-party classifier", () => {
    const ctx = buildIeTrustContext({ windowOrigin: "https://os.ryo.lu" });
    expect(classifyIeTarget("https://ryo.lu", ctx)).toBe("ryo");
    expect(classifyIeTarget("https://ryo.lu/journal", ctx)).toBe("ryo");
    expect(classifyIeTarget("ryo.lu", ctx)).toBe("ryo");
    expect(classifyIeTarget("https://www.ryo.lu", ctx)).toBe("ryo-subdomain");
    expect(classifyIeTarget("https://os.ryo.lu/docs", ctx)).toBe("app");
    expect(DIRECT_PASSTHROUGH_DOMAINS).not.toContain("ryo.lu");
    expect(isDirectPassthrough("https://ryo.lu")).toBe(false);
  });

  test("still matches existing third-party passthrough hosts", () => {
    expect(isDirectPassthrough("https://iso-city.com")).toBe(true);
    expect(isDirectPassthrough("https://shaoruu.io")).toBe(true);
    expect(isDirectPassthrough("https://www.shaoruu.io")).toBe(true);
  });

  test("does not passthrough unrelated sites that should stay proxied", () => {
    expect(isDirectPassthrough("https://example.com")).toBe(false);
    expect(isDirectPassthrough("https://google.com")).toBe(false);
    expect(isDirectPassthrough("https://en.wikipedia.org")).toBe(false);
    expect(isDirectPassthrough("https://not-ryo.lu")).toBe(false);
    expect(isDirectPassthrough("https://shaoruu.io.evil.example")).toBe(false);
  });

  test("returns false for unparseable input", () => {
    expect(isDirectPassthrough("https://")).toBe(false);
  });
});
