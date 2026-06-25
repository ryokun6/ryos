/**
 * Tests for the apiHandler `bodySchema` validation layer.
 *
 * Exercised through endpoints that opt into a Zod body schema:
 * - POST /api/analytics/events (optional auth — easy to drive without a token)
 * - POST /api/speech (optional auth — invalid-body path avoids TTS providers)
 * - POST /api/chat (optional auth — invalid-body path avoids AI providers)
 * - POST /api/tv/create-channel (required auth — invalid-body path only, so
 *   no AI/YouTube quota is spent)
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  fetchWithAuth,
  makeRateLimitBypassHeaders,
  getTokenFromAuthCookie,
} from "./test-utils";

describe("apiHandler bodySchema validation", () => {
  describe("POST /api/analytics/events", () => {
    test("missing events → 400 validation_error", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/analytics/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("validation_error");
      expect(Array.isArray(data.issues)).toBe(true);
      expect(data.issues.length).toBeGreaterThan(0);
      expect(typeof data.issues[0].path).toBe("string");
      expect(typeof data.issues[0].message).toBe("string");
    });

    test("events not an array → 400 validation_error", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/analytics/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: "nope" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("validation_error");
      expect(data.issues.some((i: { path: string }) => i.path === "events")).toBe(
        true
      );
    });

    test("valid empty batch → 204", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/analytics/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: [] }),
      });
      expect(res.status).toBe(204);
    });

    test("valid batch with events → 204", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/analytics/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [{ name: "page:view", path: "/test" }],
        }),
      });
      expect(res.status).toBe(204);
    });
  });

  describe("POST /api/speech", () => {
    test("missing text → 400 validation_error", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("validation_error");
      expect(data.issues.some((i: { path: string }) => i.path === "text")).toBe(
        true
      );
    });

    test("invalid speech options → 400 validation_error", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "hello",
          model: "bad-provider",
          speed: 99,
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("validation_error");
      expect(data.issues.some((i: { path: string }) => i.path === "model")).toBe(
        true
      );
      expect(data.issues.some((i: { path: string }) => i.path === "speed")).toBe(
        true
      );
    });
  });

  describe("POST /api/chat", () => {
    test("missing messages → 400 validation_error", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("validation_error");
      expect(data.issues.some((i: { path: string }) => i.path === "messages")).toBe(
        true
      );
    });

    test("invalid message shape → 400 validation_error", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ content: "missing role" }] }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("validation_error");
      expect(
        data.issues.some((i: { path: string }) => i.path === "messages.0.role")
      ).toBe(true);
    });

    test("invalid system state → 400 validation_error", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [],
          systemState: "not-an-object",
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("validation_error");
      expect(
        data.issues.some((i: { path: string }) => i.path === "systemState")
      ).toBe(true);
    });

    test("valid body reaches chat handler", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [],
          model: "not-a-real-model",
        }),
      });
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("Unsupported model");
    });
  });

  describe("POST /api/tv/create-channel", () => {
    let username: string | null = null;
    let token: string | null = null;

    beforeAll(async () => {
      username = `validate_${Date.now()}`;
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ username, password: "testpassword123" }),
      });
      if (res.status === 201) {
        token = getTokenFromAuthCookie(res);
      }
    });

    test("missing auth → 401 (before validation)", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/tv/create-channel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });

    test("authed + invalid body → 400 validation_error", async () => {
      if (!token || !username) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/tv/create-channel`,
        username,
        token,
        {
          method: "POST",
          headers: makeRateLimitBypassHeaders(),
          body: JSON.stringify({ description: "x" }), // too short (min 2)
        }
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("validation_error");
      expect(
        data.issues.some((i: { path: string }) => i.path === "description")
      ).toBe(true);
    });

    test("authed + missing body field → 400 validation_error", async () => {
      if (!token || !username) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/tv/create-channel`,
        username,
        token,
        {
          method: "POST",
          headers: makeRateLimitBypassHeaders(),
          body: JSON.stringify({}),
        }
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("validation_error");
    });
  });
});
