/**
 * ryOS Books OPDS API integration tests.
 * Requires `bun run dev:api`.
 */

import { describe, expect, test } from "bun:test";
import {
  BASE_URL,
  ensureUserAuth,
  fetchWithAuth,
  makeRateLimitBypassHeaders,
} from "../../helpers/test-utils";
import { hlcFromTimestamp } from "../../../src/shared/sync2/hlc";

const OPDS_URL = `${BASE_URL}/api/opds`;

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

describe("Books OPDS API", () => {
  test("challenges unauthenticated catalog and acquisition requests", async () => {
    const headers = makeRateLimitBypassHeaders();
    const catalog = await fetch(OPDS_URL, { headers });
    expect(catalog.status).toBe(401);
    expect(catalog.headers.get("www-authenticate")).toContain(
      'Basic realm="ryOS Books"',
    );

    const acquisition = await fetch(`${OPDS_URL}/books/missing.epub`, {
      headers: makeRateLimitBypassHeaders(),
    });
    expect(acquisition.status).toBe(401);
    expect(acquisition.headers.get("www-authenticate")).toContain(
      'Basic realm="ryOS Books"',
    );
  });

  test("serves the authenticated user's synced Books as an acquisition feed", async () => {
    const username = `opds${Date.now().toString(36)}`.slice(0, 20);
    const password = `Password1!${username}`;
    const token = await ensureUserAuth(username, password);
    expect(token).toBeTruthy();

    const bookId = "opds-test-book";
    const bookPath = "/Books/A & B.epub";
    const timestamp = Date.now();
    const ops = await fetchWithAuth(
      `${BASE_URL}/api/sync/v2/ops`,
      username,
      token!,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          clientId: "opds-test",
          ops: [
            {
              k: `files/item:${bookPath}`,
              v: {
                path: bookPath,
                name: "A & B.epub",
                isDirectory: false,
                status: "active",
                uuid: bookId,
                size: 1234,
                modifiedAt: timestamp,
              },
              t: hlcFromTimestamp(timestamp, "opds-test"),
            },
            {
              k: `books/item:${bookId}`,
              v: {
                blob: {
                  url: `s3://bucket/sync/${username}/blobs/${"a".repeat(64)}.gz`,
                  size: 100,
                  sha256: "a".repeat(64),
                },
              },
              t: hlcFromTimestamp(timestamp + 1, "opds-test"),
            },
          ],
        }),
      },
    );
    expect(ops.status).toBe(200);

    const feed = await fetch(OPDS_URL, {
      headers: {
        ...makeRateLimitBypassHeaders(),
        Accept: "application/atom+xml",
        Authorization: basicAuth(username, password),
      },
    });
    expect(feed.status).toBe(200);
    expect(feed.headers.get("content-type")).toContain(
      "application/atom+xml",
    );

    const xml = await feed.text();
    expect(xml).toContain("<title>A &amp; B</title>");
    expect(xml).toContain(
      `href="books/${bookId}.epub" type="application/epub+zip"`,
    );
    expect(xml).not.toContain("s3://");
  });
});
