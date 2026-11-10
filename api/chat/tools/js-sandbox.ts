/**
 * QuickJS (WASM) sandbox for the runJs chat tool.
 *
 * Runs model-written JavaScript inside a QuickJS interpreter compiled to
 * WebAssembly. The VM has zero host access — no filesystem, no network, no
 * timers, no process/env — the only injected binding is a `console` shim that
 * captures log output. CPU-bound runaways are stopped by an interrupt-handler
 * deadline and allocations are capped with a memory limit.
 *
 * Eval runs in a dedicated Worker so a hostile script cannot freeze the API
 * process event loop for every other request.
 */

import {
  createOutputBuffer,
  JS_SANDBOX_DEFAULT_TIMEOUT_MS,
  JS_SANDBOX_MAX_CODE_LENGTH,
  JS_SANDBOX_MAX_OUTPUT_CHARS,
  JS_SANDBOX_MAX_TIMEOUT_MS,
  runJsInSandboxSync,
  stringifySandboxValue,
  type JsSandboxRunResult,
  type RunJsSandboxOptions,
} from "./js-sandbox-runtime.js";
import type {
  JsSandboxWorkerRequest,
  JsSandboxWorkerResponse,
} from "./js-sandbox-worker.js";

export {
  createOutputBuffer,
  JS_SANDBOX_DEFAULT_TIMEOUT_MS,
  JS_SANDBOX_MAX_CODE_LENGTH,
  JS_SANDBOX_MAX_OUTPUT_CHARS,
  JS_SANDBOX_MAX_TIMEOUT_MS,
  stringifySandboxValue,
  type JsSandboxRunResult,
  type RunJsSandboxOptions,
};

/** Extra grace so a timed-out Worker can still post its interrupt result. */
const WORKER_KILL_GRACE_MS = 1_000;

let nextRequestId = 1;

function workerUnsupportedResult(
  timeoutMs: number,
  startedAt: number,
  error: string
): JsSandboxRunResult {
  return {
    success: false,
    logs: "",
    error,
    durationMs: Date.now() - startedAt,
    truncated: false,
  };
}

/**
 * Execute JavaScript in a fresh, disposable QuickJS context on a Worker.
 *
 * Each run is stateless: a new runtime + context is created and disposed per
 * call inside the worker, so nothing leaks between users or requests. The
 * WASM module itself is memoized by quickjs-emscripten inside the worker.
 *
 * Falls back to in-process eval only when `Worker` is unavailable (kept for
 * exotic runtimes); that path still blocks the calling thread.
 */
export async function runJsInSandbox(
  code: string,
  options: RunJsSandboxOptions = {}
): Promise<JsSandboxRunResult> {
  const timeoutMs = Math.min(
    Math.max(options.timeoutMs ?? JS_SANDBOX_DEFAULT_TIMEOUT_MS, 1),
    JS_SANDBOX_MAX_TIMEOUT_MS
  );
  const startedAt = Date.now();

  if (typeof Worker === "undefined") {
    return runJsInSandboxSync(code, { ...options, timeoutMs });
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL("./js-sandbox-worker.ts", import.meta.url));
  } catch (error) {
    // Worker construction failed — last resort so the tool still answers.
    console.warn(
      "[js-sandbox] Worker unavailable; running on calling thread",
      error
    );
    return runJsInSandboxSync(code, { ...options, timeoutMs });
  }

  const id = nextRequestId++;
  const request: JsSandboxWorkerRequest = {
    id,
    code,
    options: { ...options, timeoutMs },
  };

  return new Promise<JsSandboxRunResult>((resolve) => {
    let settled = false;

    const finish = (result: JsSandboxRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      try {
        worker.terminate();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const killTimer = setTimeout(() => {
      finish({
        success: false,
        logs: "",
        error: `Execution timed out after ${timeoutMs}ms`,
        durationMs: Date.now() - startedAt,
        truncated: false,
      });
    }, timeoutMs + WORKER_KILL_GRACE_MS);

    worker.onmessage = (event: MessageEvent<JsSandboxWorkerResponse>) => {
      const payload = event.data;
      if (!payload || payload.id !== id) return;
      if (payload.result) {
        finish(payload.result);
        return;
      }
      finish(
        workerUnsupportedResult(
          timeoutMs,
          startedAt,
          payload.error || "Sandbox worker failed"
        )
      );
    };

    worker.onerror = (event) => {
      finish(
        workerUnsupportedResult(
          timeoutMs,
          startedAt,
          event.message || "Sandbox worker crashed"
        )
      );
    };

    worker.postMessage(request);
  });
}
