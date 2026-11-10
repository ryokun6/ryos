/**
 * Streaming helpers for Internet Explorer raw / non-HTML passthrough.
 *
 * HTML goes through `readResponseTextWithLimit` (~2.5 MB). Raw and other
 * non-HTML bodies are streamed without buffering; this module caps how much
 * of that stream we will accept so a single `?raw=1` request cannot hold an
 * arbitrarily large upstream download in the API process.
 */

export const IE_MAX_RAW_PASSTHROUGH_BYTES = 25 * 1024 * 1024;

export type StreamableResponse = {
  write: (chunk: Buffer) => unknown;
  end: () => unknown;
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  off?: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

export type StreamBodyOutcome =
  | { ok: true; bytesWritten: number }
  | {
      ok: false;
      reason: "aborted" | "too_large" | "error";
      bytesWritten: number;
    };

export type StreamBodyOptions = {
  /** Hard ceiling; defaults to {@link IE_MAX_RAW_PASSTHROUGH_BYTES}. */
  maxBytes?: number;
  /** Abort the upstream fetch when streaming stops early. */
  abortUpstream?: () => void;
};

/**
 * Stream an undici/web `ReadableStream` response body to the Node-style
 * response without buffering the whole payload in memory. Works with the
 * standalone Bun server's response shim (`write`/`end`) as well as a plain
 * Node `ServerResponse`.
 *
 * Stops and cancels the upstream reader when:
 * - the client disconnects (`aborted`/`close`) or `write` returns false
 * - cumulative bytes would exceed `maxBytes` (default 25 MiB)
 *
 * On the byte ceiling, already-written bytes are left as-is (response status
 * / headers were already committed), the overflowing portion is not written,
 * the reader is cancelled, `abortUpstream` is invoked when provided, and
 * `res.end()` is called so the client sees a cleanly closed truncated body
 * rather than a hung connection.
 */
export async function streamBodyToResponse(
  body: ReadableStream<Uint8Array> | null,
  res: StreamableResponse,
  options: StreamBodyOptions = {}
): Promise<StreamBodyOutcome> {
  const maxBytes = options.maxBytes ?? IE_MAX_RAW_PASSTHROUGH_BYTES;
  const abortUpstream = options.abortUpstream;

  if (!body) {
    res.end();
    return { ok: true, bytesWritten: 0 };
  }

  const reader = body.getReader();
  let aborted = false;
  let bytesWritten = 0;
  const markAborted = () => {
    aborted = true;
  };
  res.on?.("aborted", markAborted);
  res.on?.("close", markAborted);

  const cancelReader = async () => {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  };

  const stopEarly = async (
    reason: "aborted" | "too_large"
  ): Promise<StreamBodyOutcome> => {
    aborted = true;
    await cancelReader();
    try {
      abortUpstream?.();
    } catch {
      /* ignore */
    }
    try {
      res.end();
    } catch {
      /* ignore */
    }
    return { ok: false, reason, bytesWritten };
  };

  try {
    for (;;) {
      if (aborted) {
        return await stopEarly("aborted");
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (aborted) {
        return await stopEarly("aborted");
      }
      if (value && value.length > 0) {
        const remaining = maxBytes - bytesWritten;
        if (remaining <= 0) {
          return await stopEarly("too_large");
        }

        let chunk: Buffer = Buffer.from(value);
        let hitCeiling = false;
        if (chunk.length > remaining) {
          chunk = chunk.subarray(0, remaining);
          hitCeiling = true;
        }

        const ok = res.write(chunk);
        bytesWritten += chunk.length;

        // Honor write=false: client gone / stream closed. Do not keep reading
        // upstream into a dead response.
        if (ok === false) {
          return await stopEarly("aborted");
        }
        if (hitCeiling) {
          return await stopEarly("too_large");
        }
      }
    }
    if (aborted) {
      return await stopEarly("aborted");
    }
    res.end();
    return { ok: true, bytesWritten };
  } catch {
    await cancelReader();
    try {
      abortUpstream?.();
    } catch {
      /* ignore */
    }
    try {
      res.end();
    } catch {
      /* ignore */
    }
    return { ok: false, reason: "error", bytesWritten };
  } finally {
    res.off?.("aborted", markAborted);
    res.off?.("close", markAborted);
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}
