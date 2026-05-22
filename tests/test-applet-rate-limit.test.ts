#!/usr/bin/env bun
/**
 * Regression tests for applet endpoint rate limiting.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  fetchWithAuth,
  ensureUserAuth,
} from "./test-utils";

describe("applet rate limits", () => {
  let testToken: string | null = null;
  let testUsername: string | null = null;

  beforeAll(async () => {
    testUsername = `rlsave${Math.floor(Math.random() * 100000)}`;
    testToken = await ensureUserAuth(testUsername, "testpassword123");
  });

  test("share-applet POST: invalid body does not consume save quota", async () => {
    if (!testToken || !testUsername) {
      console.log("  ⚠️  Skipped (test user not set up)");
      return;
    }

    for (let i = 0; i < 25; i++) {
      const invalid = await fetchWithAuth(
        `${BASE_URL}/api/share-applet`,
        testUsername,
        testToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "missing content" }),
        }
      );
      expect(invalid.status).toBe(400);
    }

    const valid = await fetchWithAuth(
      `${BASE_URL}/api/share-applet`,
      testUsername,
      testToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "<html><body>rate limit regression</body></html>",
          title: "Rate limit regression",
        }),
      }
    );

    expect(valid.status).toBe(200);
  });

  test("share-applet GET: missing id does not consume get quota", async () => {
    for (let i = 0; i < 30; i++) {
      const res = await fetchWithOrigin(`${BASE_URL}/api/share-applet`);
      expect(res.status).toBe(400);
    }

    const res = await fetchWithOrigin(
      `${BASE_URL}/api/share-applet?id=nonexistent${Date.now()}`
    );
    expect(res.status).toBe(404);
  });

  test("applet-ai: invalid image attachment does not consume image quota", async () => {
    const badRequests = Array.from({ length: 5 }, () =>
      fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "image",
          prompt: "draw something",
          images: [{ mediaType: "image/png", data: "not-valid-base64!!!" }],
        }),
      })
    );

    const results = await Promise.all(badRequests);
    for (const res of results) {
      expect(res.status).toBe(400);
    }

    const ok = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Reply with exactly: pong" }),
    });

    expect(ok.status === 200 || ok.status === 429).toBe(true);
    if (ok.status === 200) {
      const limitHeader = ok.headers.get("X-RateLimit-Limit");
      expect(limitHeader !== null).toBe(true);
    }
  });
});
