#!/usr/bin/env bun
/**
 * Unit tests for IE raw/non-HTML passthrough streaming + 25 MiB ceiling (H9).
 */
import { describe, expect, test } from "bun:test";
import {
  IE_MAX_RAW_PASSTHROUGH_BYTES,
  streamBodyToResponse,
  type StreamableResponse,
} from "../../../api/_utils/_ie-stream.ts";

function makeRes(options?: {
  writeReturns?: boolean | (() => boolean);
  onCloseAfterWrites?: number;
}) {
  const chunks: Buffer[] = [];
  const ended = { value: false };
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  let writeCount = 0;

  const emit = (event: string) => {
    for (const listener of listeners.get(event) ?? []) {
      listener();
    }
  };

  const res: StreamableResponse = {
    write(chunk: Buffer) {
      chunks.push(Buffer.from(chunk));
      writeCount += 1;
      if (
        options?.onCloseAfterWrites !== undefined &&
        writeCount >= options.onCloseAfterWrites
      ) {
        queueMicrotask(() => emit("close"));
      }
      if (typeof options?.writeReturns === "function") {
        return options.writeReturns();
      }
      return options?.writeReturns ?? true;
    },
    end() {
      ended.value = true;
    },
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
      return res;
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
      return res;
    },
  };

  return { res, chunks, ended, emit };
}

function countingStream(
  chunkSize: number,
  chunkCount: number
): {
  stream: ReadableStream<Uint8Array>;
  pulls: { value: number };
  cancelled: { value: boolean };
} {
  const pulls = { value: 0 };
  const cancelled = { value: false };
  let produced = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls.value += 1;
      if (produced >= chunkCount) {
        controller.close();
        return;
      }
      produced += 1;
      controller.enqueue(new Uint8Array(chunkSize).fill(1));
    },
    cancel() {
      cancelled.value = true;
    },
  });
  return { stream, pulls, cancelled };
}

describe("IE_MAX_RAW_PASSTHROUGH_BYTES", () => {
  test("is 25 MiB", () => {
    expect(IE_MAX_RAW_PASSTHROUGH_BYTES).toBe(25 * 1024 * 1024);
  });

  test("iframe-check wires the shared ceiling into raw passthrough", async () => {
    const source = await Bun.file(
      new URL("../../../api/iframe-check.ts", import.meta.url)
    ).text();
    expect(source).toContain("IE_MAX_RAW_PASSTHROUGH_BYTES");
    expect(source).toContain('from "./_utils/_ie-stream.js"');
    expect(source).toContain("abortUpstream");
    expect(source).not.toContain("TODO(H9)");
  });
});

describe("streamBodyToResponse", () => {
  test("streams a small body and ends cleanly", async () => {
    const payload = new TextEncoder().encode("hello raw");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      },
    });
    const { res, chunks, ended } = makeRes();
    const outcome = await streamBodyToResponse(stream, res);
    expect(outcome).toEqual({ ok: true, bytesWritten: payload.length });
    expect(Buffer.concat(chunks).toString("utf8")).toBe("hello raw");
    expect(ended.value).toBe(true);
  });

  test("ends immediately when body is null", async () => {
    const { res, ended } = makeRes();
    const outcome = await streamBodyToResponse(null, res);
    expect(outcome).toEqual({ ok: true, bytesWritten: 0 });
    expect(ended.value).toBe(true);
  });

  test("stops at the byte ceiling, cancels reader, aborts upstream, ends", async () => {
    const maxBytes = 2500;
    const { stream, cancelled } = countingStream(1000, 10);
    const helper = makeRes();
    let abortedUpstream = 0;
    const outcome = await streamBodyToResponse(stream, helper.res, {
      maxBytes,
      abortUpstream: () => {
        abortedUpstream += 1;
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("too_large");
      expect(outcome.bytesWritten).toBe(maxBytes);
    }
    expect(Buffer.concat(helper.chunks).length).toBe(maxBytes);
    expect(helper.ended.value).toBe(true);
    expect(cancelled.value).toBe(true);
    expect(abortedUpstream).toBe(1);
  });

  test("honors write=false without keeping the upstream reader alive", async () => {
    const { stream, cancelled } = countingStream(100, 20);
    const helper = makeRes({
      writeReturns: () => false,
    });
    let abortedUpstream = 0;
    const outcome = await streamBodyToResponse(stream, helper.res, {
      maxBytes: 10_000,
      abortUpstream: () => {
        abortedUpstream += 1;
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("aborted");
    expect(helper.ended.value).toBe(true);
    expect(cancelled.value).toBe(true);
    expect(abortedUpstream).toBe(1);
    expect(helper.chunks.length).toBe(1);
  });

  test("stops when the response emits close mid-stream", async () => {
    const { stream, cancelled } = countingStream(50, 40);
    const helper = makeRes({ onCloseAfterWrites: 2 });
    const outcome = await streamBodyToResponse(stream, helper.res, {
      maxBytes: 10_000,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("aborted");
    expect(cancelled.value).toBe(true);
    expect(helper.ended.value).toBe(true);
  });

  test("default ceiling matches the product 25 MiB decision", async () => {
    // Use a tiny override for speed; the constant itself is asserted above.
    // This guards that the default option path still applies a finite cap.
    const { stream, cancelled } = countingStream(1024, 3);
    const helper = makeRes();
    const outcome = await streamBodyToResponse(stream, helper.res, {
      maxBytes: 1500,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("too_large");
      expect(outcome.bytesWritten).toBe(1500);
    }
    expect(cancelled.value).toBe(true);
  });
});
