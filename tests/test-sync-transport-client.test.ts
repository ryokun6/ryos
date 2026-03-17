import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  fetchBlobDomainPayload,
  requestBlobUploadInstruction,
} from "../src/sync/transport";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("sync transport client", () => {
  test("fetchBlobDomainPayload routes custom wallpapers through logical settings", async () => {
    const fetchMock = mock(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const headers = new Headers(init?.headers);
        expect(String(input)).toBe("/api/sync/domains/settings");
        expect(init?.method).toBe("GET");
        expect(headers.get("X-Sync-Session-Id")).toBeString();

        return new Response(
          JSON.stringify({
            parts: {
              "custom-wallpapers": {
                mode: "individual",
                metadata: {
                  updatedAt: "2026-03-18T11:05:00.000Z",
                  createdAt: "2026-03-18T11:05:00.000Z",
                  version: 1,
                  totalSize: 0,
                  syncVersion: null,
                },
                items: {},
              },
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    );

    globalThis.fetch = fetchMock as typeof fetch;

    const payload = await fetchBlobDomainPayload("custom-wallpapers");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payload?.mode).toBe("individual");
  });

  test("requestBlobUploadInstruction posts custom wallpapers to settings attachments endpoint", async () => {
    const fetchMock = mock(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const headers = new Headers(init?.headers);
        expect(String(input)).toBe("/api/sync/domains/settings/attachments/prepare");
        expect(init?.method).toBe("POST");
        expect(headers.get("Content-Type")).toBe("application/json");
        expect(headers.get("X-Sync-Session-Id")).toBeString();
        expect(init?.body).toBe(
          JSON.stringify({
            partDomain: "custom-wallpapers",
            itemKey: "wallpaper-1",
          })
        );

        return new Response(
          JSON.stringify({
            pathname:
              "sync/test-user/custom-wallpapers/items/wallpaper-1.gz",
            uploadMethod: "presigned-put",
            provider: "s3",
            uploadUrl: "https://storage.example/upload",
            storageUrl: "https://storage.example/object",
            contentType: "application/gzip",
            maximumSizeInBytes: 52428800,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    );

    globalThis.fetch = fetchMock as typeof fetch;

    const uploadInstruction = await requestBlobUploadInstruction(
      "custom-wallpapers",
      "wallpaper-1"
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(uploadInstruction.pathname).toContain(
      "custom-wallpapers/items/wallpaper-1.gz"
    );
  });
});
