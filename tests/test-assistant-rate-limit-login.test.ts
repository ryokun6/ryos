import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAssistantRateLimitState } from "../src/components/assistant/useAssistantChat";

describe("parseAssistantRateLimitState", () => {
  test("anonymous 429 JSON prompts login", () => {
    const error = new Error(
      'Failed: {"error":"rate_limit_exceeded","isAuthenticated":false,"count":3,"limit":3}'
    );
    expect(parseAssistantRateLimitState(error, false)).toEqual({
      blocked: true,
      showLogin: true,
    });
  });

  test("authenticated 429 JSON blocks input without login prompt", () => {
    const error = new Error(
      'Failed: {"error":"rate_limit_exceeded","isAuthenticated":true,"count":15,"limit":15}'
    );
    expect(parseAssistantRateLimitState(error, true)).toEqual({
      blocked: true,
      showLogin: false,
    });
  });

  test("generic 429 without JSON falls back to local auth state", () => {
    expect(
      parseAssistantRateLimitState(new Error("HTTP 429 Too Many Requests"), false)
    ).toEqual({ blocked: true, showLogin: true });
    expect(
      parseAssistantRateLimitState(new Error("HTTP 429 Too Many Requests"), true)
    ).toEqual({ blocked: true, showLogin: false });
  });

  test("ignores unrelated errors", () => {
    expect(parseAssistantRateLimitState(new Error("network down"), false)).toBeNull();
  });
});

describe("assistant bubble rate-limit login wiring", () => {
  const overlaySource = readFileSync(
    join(import.meta.dir, "../src/components/assistant/AssistantOverlay.tsx"),
    "utf8"
  );

  test("replaces the input with a sign-in button when rate limited for anonymous users", () => {
    expect(overlaySource).toContain("showLoginForRateLimit");
    expect(overlaySource).toContain("promptSetUsername");
    expect(overlaySource).toContain("isInputBlockedByRateLimit");
    expect(overlaySource).toContain('t("apps.chats.status.loginToChat")');
  });
});
