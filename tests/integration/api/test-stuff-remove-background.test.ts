import { describe, expect, test } from "bun:test";
import {
  ensureUserAuth,
  fetchWithAuth,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
  uniqueTestUsername,
} from "../../helpers/test-utils";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";

describe("/api/stuff/remove-background", () => {
  test("requires auth", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/stuff/remove-background`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...makeRateLimitBypassHeaders(),
      },
      body: JSON.stringify({
        imageBase64: "aaaa",
        mediaType: "image/png",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("rejects invalid body for authenticated user", async () => {
    const username = uniqueTestUsername("rmbg");
    const token = await ensureUserAuth(username, "test-password-123");
    expect(token).toBeTruthy();

    const res = await fetchWithAuth(
      `${BASE_URL}/api/stuff/remove-background`,
      username,
      token!,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...makeRateLimitBypassHeaders(),
        },
        body: JSON.stringify({
          imageBase64: "",
          mediaType: "image/png",
        }),
      }
    );
    expect(res.status).toBe(400);
  });

  test("rejects unsupported media type", async () => {
    const username = uniqueTestUsername("rmbg");
    const token = await ensureUserAuth(username, "test-password-123");
    expect(token).toBeTruthy();

    const res = await fetchWithAuth(
      `${BASE_URL}/api/stuff/remove-background`,
      username,
      token!,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...makeRateLimitBypassHeaders(),
        },
        body: JSON.stringify({
          imageBase64: "aaaa",
          mediaType: "application/pdf",
        }),
      }
    );
    expect(res.status).toBe(400);
  });

  test("rejects gif (not supported by gpt-image edits)", async () => {
    const username = uniqueTestUsername("rmbg");
    const token = await ensureUserAuth(username, "test-password-123");
    expect(token).toBeTruthy();

    const res = await fetchWithAuth(
      `${BASE_URL}/api/stuff/remove-background`,
      username,
      token!,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...makeRateLimitBypassHeaders(),
        },
        body: JSON.stringify({
          imageBase64: "aaaa",
          mediaType: "image/gif",
        }),
      }
    );
    expect(res.status).toBe(400);
  });
});
