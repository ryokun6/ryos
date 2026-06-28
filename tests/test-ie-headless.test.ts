#!/usr/bin/env bun
/**
 * Unit tests for the optional headless-render provider used by the IE proxy
 * fallback (`api/_utils/_headless.ts`). These are pure config/guard tests and
 * do not require the API server or a real browser.
 */
import { describe, test, expect, afterEach } from "bun:test";
import {
  isHeadlessRenderConfigured,
  renderUrlToHtml,
} from "../api/_utils/_headless.ts";

const ENV_KEYS = [
  "HEADLESS_RENDER_URL_TEMPLATE",
  "HEADLESS_BROWSER_WS_ENDPOINT",
  "HEADLESS_RENDER_AUTH_HEADER",
  "HEADLESS_RENDER_AUTH_TOKEN",
];

function clearHeadlessEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("headless render config", () => {
  afterEach(() => {
    clearHeadlessEnv();
  });

  test("not configured by default", () => {
    clearHeadlessEnv();
    expect(isHeadlessRenderConfigured()).toBe(false);
  });

  test("configured when HTTP template is set", () => {
    clearHeadlessEnv();
    process.env.HEADLESS_RENDER_URL_TEMPLATE = "https://render.test/?url={url}";
    expect(isHeadlessRenderConfigured()).toBe(true);
  });

  test("configured when CDP endpoint is set", () => {
    clearHeadlessEnv();
    process.env.HEADLESS_BROWSER_WS_ENDPOINT = "wss://chrome.test";
    expect(isHeadlessRenderConfigured()).toBe(true);
  });

  test("renderUrlToHtml returns null when unconfigured", async () => {
    clearHeadlessEnv();
    const result = await renderUrlToHtml("https://example.com");
    expect(result).toBeNull();
  });

  test("renderUrlToHtml refuses private/SSRF targets even when configured", async () => {
    clearHeadlessEnv();
    process.env.HEADLESS_RENDER_URL_TEMPLATE = "https://render.test/?url={url}";
    const result = await renderUrlToHtml("http://127.0.0.1/secret");
    expect(result).toBeNull();
  });
});
