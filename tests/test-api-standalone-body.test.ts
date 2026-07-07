import { describe, expect, test } from "bun:test";
import {
  getRequestBodyLimit,
  MAX_AI_CONVERSATION_REQUEST_BYTES,
  readRequestBytes,
  StandaloneRequestBodyTooLargeError,
} from "../scripts/api-standalone-server";
import { AI_ATTACHMENT_MAX_BYTES } from "../src/shared/contracts/aiAttachment";

const MEBIBYTE = 1024 * 1024;
const GLOBAL_BODY_CHUNKS = 55;

describe("standalone API request body limits", () => {
  test("normalizes trailing slashes before selecting AI route limits", () => {
    expect(AI_ATTACHMENT_MAX_BYTES).toBe(4 * MEBIBYTE);
    expect(MAX_AI_CONVERSATION_REQUEST_BYTES).toBe(8 * MEBIBYTE);
    expect(getRequestBodyLimit("/api/ai/attachments/")).toBe(
      AI_ATTACHMENT_MAX_BYTES,
    );
    expect(getRequestBodyLimit("/api/chat/")).toBe(
      MAX_AI_CONVERSATION_REQUEST_BYTES,
    );
    expect(getRequestBodyLimit("/api/ai/extract-memories///")).toBe(
      MAX_AI_CONVERSATION_REQUEST_BYTES,
    );
    // The legacy import route is gone; conversation routes use the default
    // standalone body limit (55 MiB) rather than a dedicated AI limit.
    expect(getRequestBodyLimit("/api/ai/conversations/chat/import/")).toBe(
      55 * MEBIBYTE,
    );
    expect(getRequestBodyLimit("/api/ai/conversations/chat")).toBe(
      55 * MEBIBYTE,
    );
  });

  test("rejects an oversized declared Content-Length before reading", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(MAX_AI_CONVERSATION_REQUEST_BYTES + 1),
      },
      body: "{}",
    });

    await expect(
      readRequestBytes(request, MAX_AI_CONVERSATION_REQUEST_BYTES),
    ).rejects.toBeInstanceOf(StandaloneRequestBodyTooLargeError);
    expect(request.bodyUsed).toBe(false);
  });

  test("cancels a chunked body as soon as it exceeds the route limit", async () => {
    let chunksReadFromSource = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksReadFromSource += 1;
        controller.enqueue(new Uint8Array(MEBIBYTE));
        if (chunksReadFromSource >= GLOBAL_BODY_CHUNKS) {
          controller.close();
        }
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      duplex: "half",
    } satisfies RequestInit & { duplex: "half" });

    await expect(
      readRequestBytes(request, MAX_AI_CONVERSATION_REQUEST_BYTES),
    ).rejects.toBeInstanceOf(StandaloneRequestBodyTooLargeError);

    expect(cancelled).toBe(true);
    expect(chunksReadFromSource).toBeLessThanOrEqual(10);
    expect(chunksReadFromSource).toBeLessThan(GLOBAL_BODY_CHUNKS);
  });

  test("returns an empty byte array when the request has no body", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
    });

    expect(
      await readRequestBytes(request, MAX_AI_CONVERSATION_REQUEST_BYTES),
    ).toHaveLength(0);
  });
});
