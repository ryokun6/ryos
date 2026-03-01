#!/usr/bin/env bun
/**
 * Tests for /api/share-applet endpoint
 * Tests: CRUD operations for applets, authentication, authorization
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { BASE_URL, fetchWithOrigin, fetchWithAuth, ensureUserAuth } from "./test-utils";

let testAppletId: string | null = null;
let testToken: string | null = null;
let testUsername: string | null = null;

describe("share-applet", () => {
  beforeAll(async () => {
    testUsername = `shareuser${Math.floor(Math.random() * 100000)}`;
    testToken = await ensureUserAuth(testUsername, "testpassword123");
  });

  describe("HTTP Methods", () => {
    test("PUT method not allowed", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/share-applet`, {
        method: "PUT",
      });
      expect(res.status).toBe(405);
    });

    test("OPTIONS request (CORS preflight)", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/share-applet`, {
        method: "OPTIONS",
      });
      expect(res.status === 200 || res.status === 204).toBe(true);
    });
  });

  describe("GET Operations", () => {
    test("GET - missing id parameter", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/share-applet`);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error?.includes("id")).toBe(true);
    });

    test("GET - non-existent applet", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/share-applet?id=nonexistent12345`
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error?.includes("not found")).toBe(true);
    });
  });

  describe("POST Operations", () => {
    test("POST - without auth", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/share-applet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "<html><body>Test</body></html>",
          title: "Test Applet",
        }),
      });
      expect(res.status).toBe(401);
    });

    test("POST - with invalid auth", async () => {
      const res = await fetchWithAuth(
        `${BASE_URL}/api/share-applet`,
        "invalid_user",
        "invalid_token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: "<html><body>Test</body></html>",
            title: "Test Applet",
          }),
        }
      );
      expect(res.status).toBe(401);
    });

    test("POST - missing content", async () => {
      if (!testToken || !testUsername) {
        console.log("  ⚠️  Skipped (test user not set up)");
        return;
      }
      const res = await fetchWithAuth(
        `${BASE_URL}/api/share-applet`,
        testUsername,
        testToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Test Applet",
          }),
        }
      );
      expect(res.status).toBe(400);
    });

    test("POST - success (create)", async () => {
      if (!testToken || !testUsername) {
        console.log("  ⚠️  Skipped (test user not set up)");
        return;
      }
      const res = await fetchWithAuth(
        `${BASE_URL}/api/share-applet`,
        testUsername,
        testToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: "<html><body><h1>Test Applet</h1></body></html>",
            title: "Test Applet Title",
            icon: "game",
            name: "test-applet",
            windowWidth: 800,
            windowHeight: 600,
          }),
        }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBeTruthy();
      expect(data.shareUrl).toBeTruthy();
      testAppletId = data.id;
    });

    test("GET - created applet", async () => {
      if (!testAppletId) {
        console.log("  ⚠️  Skipped (test applet not created)");
        return;
      }
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/share-applet?id=${testAppletId}`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.content).toBeTruthy();
      expect(data.title).toBe("Test Applet Title");
      expect(data.icon).toBe("game");
      expect(data.createdBy?.toLowerCase()).toBe(testUsername?.toLowerCase());
    });

    test("GET - list applets", async () => {
      if (!testAppletId) {
        console.log("  ⚠️  Skipped (test applet not created)");
        return;
      }
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/share-applet?list=true`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.applets)).toBe(true);
      const found = data.applets.some(
        (a: { id: string }) => a.id === testAppletId
      );
      expect(found).toBe(true);
    });

    test("POST - update applet (by owner)", async () => {
      if (!testToken || !testUsername || !testAppletId) {
        console.log("  ⚠️  Skipped (test data not set up)");
        return;
      }
      const res = await fetchWithAuth(
        `${BASE_URL}/api/share-applet`,
        testUsername,
        testToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: "<html><body><h1>Updated Test Applet</h1></body></html>",
            title: "Updated Title",
            shareId: testAppletId,
          }),
        }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(testAppletId);
      expect(data.updated).toBe(true);
    });

    test("POST - update by non-owner (should create new)", async () => {
      if (!testAppletId) return;
      const otherUsername = `otheruser${Math.floor(Math.random() * 100000)}`;
      const otherToken = await ensureUserAuth(otherUsername, "testpassword123");
      if (!otherToken) return;

      const res = await fetchWithAuth(
        `${BASE_URL}/api/share-applet`,
        otherUsername,
        otherToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: "<html><body>Hacked!</body></html>",
            shareId: testAppletId,
          }),
        }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id !== testAppletId).toBe(true);
    });
  });

  describe("DELETE Operations", () => {
    test("DELETE - without auth", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/share-applet?id=someid`,
        { method: "DELETE" }
      );
      expect(res.status).toBe(403);
    });

    test("DELETE - by non-admin", async () => {
      if (!testToken || !testUsername || !testAppletId) {
        console.log("  ⚠️  Skipped (test data not set up)");
        return;
      }
      const res = await fetchWithAuth(
        `${BASE_URL}/api/share-applet?id=${testAppletId}`,
        testUsername,
        testToken,
        { method: "DELETE" }
      );
      expect(res.status).toBe(403);
    });

    test("DELETE - with invalid token (forbidden)", async () => {
      if (!testAppletId) {
        console.log("  ⚠️  Skipped (test applet ID not set up)");
        return;
      }
      const res = await fetchWithAuth(
        `${BASE_URL}/api/share-applet?id=${testAppletId}`,
        "ryo",
        "invalid_token_12345",
        { method: "DELETE" }
      );
      expect(res.status).toBe(403);
    });
  });

  describe("PATCH Operations", () => {
    test("PATCH - without auth", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/share-applet?id=someid`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ featured: true }),
        }
      );
      expect(res.status).toBe(403);
    });

    test("PATCH - by non-admin", async () => {
      if (!testToken || !testUsername || !testAppletId) {
        console.log("  ⚠️  Skipped (test data not set up)");
        return;
      }
      const res = await fetchWithAuth(
        `${BASE_URL}/api/share-applet?id=${testAppletId}`,
        testUsername,
        testToken,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ featured: true }),
        }
      );
      expect(res.status).toBe(403);
    });

    test("PATCH - with invalid token (forbidden)", async () => {
      if (!testAppletId) {
        console.log("  ⚠️  Skipped (test applet ID not set up)");
        return;
      }
      const res = await fetchWithAuth(
        `${BASE_URL}/api/share-applet?id=${testAppletId}`,
        "ryo",
        "invalid_token_12345",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ featured: true }),
        }
      );
      expect(res.status).toBe(403);
    });
  });
});
