/**
 * KOReader Progress Sync (kosync) API integration tests.
 * Requires `bun run dev:api`.
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  BASE_URL,
  ensureUserAuth,
  fetchWithAuth,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
} from "../../helpers/test-utils";
import { filenameMd5FromPath } from "../../../src/shared/kosync/md5";
import { hlcFromTimestamp } from "../../../src/shared/sync2/hlc";

const KOSYNC = `${BASE_URL}/api/kosync`;

function md5Password(plain: string): string {
  return createHash("md5").update(plain).digest("hex");
}

function kosyncHeaders(username: string, key: string): HeadersInit {
  return {
    ...makeRateLimitBypassHeaders(),
    Accept: "application/vnd.koreader.v1+json",
    "Content-Type": "application/json",
    "X-Auth-User": username,
    "X-Auth-Key": key,
  };
}

async function createKosyncUser(username: string, key: string): Promise<Response> {
  return fetchWithOrigin(`${KOSYNC}/users/create`, {
    method: "POST",
    headers: {
      ...makeRateLimitBypassHeaders(),
      Accept: "application/vnd.koreader.v1+json",
    },
    body: JSON.stringify({ username, password: key }),
  });
}

describe("kosync API", () => {
  test("healthcheck returns OK without origin", async () => {
    const res = await fetch(`${KOSYNC}/healthcheck`, {
      headers: { Accept: "application/vnd.koreader.v1+json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "OK" });
  });

  test("ryOS password unlocks kosync register, auth, and progress", async () => {
    const username = `kosync${Date.now().toString(36)}`.slice(0, 20);
    const password = `Password1!${username}`;
    const key = md5Password(password);
    const document = filenameMd5FromPath(
      "/Books/Test Book For Kosync.epub"
    );

    // Creating a ryOS account syncs md5(password) for kosync.
    const token = await ensureUserAuth(username, password);
    expect(token).toBeTruthy();

    const beforeLogin = await createKosyncUser(
      `nouser${Date.now().toString(36)}`.slice(0, 20),
      key
    );
    expect(beforeLogin.status).toBe(403);

    const createRes = await createKosyncUser(username, key);
    expect(createRes.status).toBe(201);
    expect(await createRes.json()).toEqual({ username });

    const wrongPass = await createKosyncUser(username, "0".repeat(32));
    expect(wrongPass.status).toBe(401);

    const badAuth = await fetchWithOrigin(`${KOSYNC}/users/auth`, {
      headers: kosyncHeaders(username, "0".repeat(32)),
    });
    expect(badAuth.status).toBe(401);

    const authOk = await fetchWithOrigin(`${KOSYNC}/users/auth`, {
      headers: kosyncHeaders(username, key),
    });
    expect(authOk.status).toBe(200);
    expect(await authOk.json()).toEqual({ authorized: "OK" });

    const empty = await fetchWithOrigin(
      `${KOSYNC}/syncs/progress/${document}`,
      { headers: kosyncHeaders(username, key) }
    );
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({});

    const put = await fetchWithOrigin(`${KOSYNC}/syncs/progress`, {
      method: "PUT",
      headers: kosyncHeaders(username, key),
      body: JSON.stringify({
        document,
        progress: "42",
        percentage: 0.42,
        device: "KOReader",
        device_id: "TESTDEVICE",
      }),
    });
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as {
      document: string;
      timestamp: number;
    };
    expect(putBody.document).toBe(document);
    expect(putBody.timestamp).toBeGreaterThan(0);

    const get = await fetchWithOrigin(
      `${KOSYNC}/syncs/progress/${document}`,
      { headers: kosyncHeaders(username, key) }
    );
    expect(get.status).toBe(200);
    const progress = (await get.json()) as {
      document: string;
      percentage: number;
      progress: string;
      device: string;
      device_id: string;
      timestamp: number;
    };
    expect(progress.document).toBe(document);
    expect(progress.percentage).toBeCloseTo(0.42);
    expect(progress.progress).toBe("42");
    expect(progress.device).toBe("KOReader");
    expect(progress.device_id).toBe("TESTDEVICE");
    expect(progress.timestamp).toBe(putBody.timestamp);
  });

  test("bridges Books bookshelf progress into kosync GET", async () => {
    const username = `kb${Date.now().toString(36)}`.slice(0, 20);
    const password = `Password1!${username}`;
    const token = await ensureUserAuth(username, password);
    expect(token).toBeTruthy();
    const key = md5Password(password);
    const bookPath = "/Books/Bridge Progress Book.epub";
    const document = filenameMd5FromPath(bookPath);

    const createRes = await createKosyncUser(username, key);
    expect(createRes.status).toBe(201);

    const t = hlcFromTimestamp(Date.now(), "test-client");
    const opsRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/v2/ops`,
      username,
      token!,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: "kosync-test",
          ops: [
            {
              k: `files/item:${bookPath}`,
              v: {
                path: bookPath,
                name: "Bridge Progress Book.epub",
                status: "active",
                uuid: "test-uuid-bridge",
                modifiedAt: Date.now(),
              },
              t,
            },
            {
              k: `bookshelf/progress:${bookPath}`,
              v: {
                cfi: "epubcfi(/6/4!/4/2/2/2)",
                percentage: 0.55,
                updatedAt: Date.now(),
              },
              t,
            },
            {
              k: `bookshelf/docmap:${bookPath}`,
              v: { filenameMd5: document },
              t,
            },
          ],
        }),
      }
    );
    expect(opsRes.status).toBe(200);

    const get = await fetchWithOrigin(
      `${KOSYNC}/syncs/progress/${document}`,
      { headers: kosyncHeaders(username, key) }
    );
    expect(get.status).toBe(200);
    const progress = (await get.json()) as {
      percentage: number;
      device: string;
      progress: string;
    };
    expect(progress.percentage).toBeCloseTo(0.55);
    expect(progress.device).toBe("ryOS Books");
    expect(progress.progress).toContain("epubcfi");
  });
});
