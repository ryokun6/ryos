#!/usr/bin/env bun
/**
 * Direct-passthrough domains skip `/api/iframe-check` in "now" mode so
 * origin-sensitive SPAs (BrowserRouter) keep a real pathname.
 */
import "../../helpers/local-storage-stub";
import { describe, expect, test } from "bun:test";
import {
  DIRECT_PASSTHROUGH_DOMAINS,
  isDirectPassthrough,
} from "../../../src/stores/useInternetExplorerStore.ts";

describe("isDirectPassthrough", () => {
  test("includes ryo.lu so the homepage SPA is not proxied", () => {
    expect(DIRECT_PASSTHROUGH_DOMAINS).toContain("ryo.lu");
    expect(isDirectPassthrough("https://ryo.lu")).toBe(true);
    expect(isDirectPassthrough("https://ryo.lu/")).toBe(true);
    expect(isDirectPassthrough("https://ryo.lu/journal")).toBe(true);
    expect(isDirectPassthrough("http://ryo.lu")).toBe(true);
    expect(isDirectPassthrough("ryo.lu")).toBe(true);
  });

  test("matches www.ryo.lu as a subdomain of ryo.lu", () => {
    expect(isDirectPassthrough("https://www.ryo.lu")).toBe(true);
    expect(isDirectPassthrough("www.ryo.lu")).toBe(true);
  });

  test("still matches existing passthrough hosts", () => {
    expect(isDirectPassthrough("https://os.ryo.lu")).toBe(true);
    expect(isDirectPassthrough("https://os.ryo.lu/docs")).toBe(true);
    expect(isDirectPassthrough("https://iso-city.com")).toBe(true);
    expect(isDirectPassthrough("https://shaoruu.io")).toBe(true);
  });

  test("does not passthrough unrelated sites that should stay proxied", () => {
    expect(isDirectPassthrough("https://example.com")).toBe(false);
    expect(isDirectPassthrough("https://google.com")).toBe(false);
    expect(isDirectPassthrough("https://en.wikipedia.org")).toBe(false);
    expect(isDirectPassthrough("https://not-ryo.lu")).toBe(false);
    expect(isDirectPassthrough("https://ryo.lu.evil.example")).toBe(false);
  });

  test("returns false for unparseable input", () => {
    expect(isDirectPassthrough("https://")).toBe(false);
  });
});
