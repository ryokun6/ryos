/**
 * QuickJS (WASM) sandbox for the runJs chat tool.
 *
 * Runs model-written JavaScript inside a QuickJS interpreter compiled to
 * WebAssembly. The VM has zero host access — no filesystem, no network, no
 * timers, no process/env — the only injected binding is a `console` shim that
 * captures log output. CPU-bound runaways are stopped by an interrupt-handler
 * deadline and allocations are capped with a memory limit, so no worker
 * thread or child process is needed.
 */

import { getQuickJS, shouldInterruptAfterDeadline } from "quickjs-emscripten";
import type { QuickJSContext } from "quickjs-emscripten";

export const JS_SANDBOX_DEFAULT_TIMEOUT_MS = 5_000;
export const JS_SANDBOX_MAX_TIMEOUT_MS = 15_000;
export const JS_SANDBOX_MAX_CODE_LENGTH = 20_000;
export const JS_SANDBOX_MAX_OUTPUT_CHARS = 16_000;
const MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const MAX_STACK_SIZE_BYTES = 1024 * 1024;

export interface JsSandboxRunResult {
  success: boolean;
  /** Captured console output, newline-joined. */
  logs: string;
  /** Stringified completion value of the script (absent when undefined). */
  result?: string;
  error?: string;
  durationMs: number;
  /** True when logs or the result were cut to fit the output cap. */
  truncated: boolean;
}

/** Render a dumped VM value for logs / the completion value. */
export function stringifySandboxValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return `${value}n`;
  if (value === undefined) return "undefined";
  if (typeof value === "function") return "[function]";
  try {
    const json = JSON.stringify(value, (_key, val: unknown) =>
      typeof val === "bigint" ? `${val}n` : val
    );
    // JSON.stringify(undefined-like values, e.g. bare Symbol) returns undefined
    return json ?? String(value);
  } catch {
    return String(value);
  }
}

/** Accumulates output lines under a total character budget. */
export function createOutputBuffer(maxChars: number = JS_SANDBOX_MAX_OUTPUT_CHARS) {
  const lines: string[] = [];
  let used = 0;
  let truncated = false;
  return {
    push(line: string) {
      if (truncated) return;
      const remaining = maxChars - used;
      if (remaining <= 0) {
        truncated = true;
        return;
      }
      if (line.length > remaining) {
        lines.push(line.slice(0, remaining) + "…");
        used = maxChars;
        truncated = true;
        return;
      }
      lines.push(line);
      used += line.length + 1; // +1 for the joining newline
    },
    get text() {
      return lines.join("\n");
    },
    get truncated() {
      return truncated;
    },
  };
}

function installConsole(
  ctx: QuickJSContext,
  pushLog: (line: string) => void
): void {
  const consoleHandle = ctx.newObject();
  const levels = ["log", "info", "debug", "warn", "error"] as const;
  for (const level of levels) {
    const fnHandle = ctx.newFunction(level, (...args) => {
      const text = args
        .map((handle) => stringifySandboxValue(ctx.dump(handle)))
        .join(" ");
      pushLog(level === "warn" || level === "error" ? `[${level}] ${text}` : text);
    });
    ctx.setProp(consoleHandle, level, fnHandle);
    fnHandle.dispose();
  }
  ctx.setProp(ctx.global, "console", consoleHandle);
  consoleHandle.dispose();
}

function formatSandboxError(dumped: unknown, timeoutMs: number): string {
  if (dumped && typeof dumped === "object") {
    const err = dumped as { name?: string; message?: string };
    const name = typeof err.name === "string" ? err.name : "Error";
    const message = typeof err.message === "string" ? err.message : "";
    if (name === "InternalError" && message === "interrupted") {
      return `Execution timed out after ${timeoutMs}ms`;
    }
    if (message.includes("out of memory")) {
      return `Script exceeded the sandbox memory limit (${MEMORY_LIMIT_BYTES / (1024 * 1024)}MB)`;
    }
    return message ? `${name}: ${message}` : name;
  }
  return stringifySandboxValue(dumped);
}

export interface RunJsSandboxOptions {
  timeoutMs?: number;
  maxOutputChars?: number;
}

/**
 * Execute JavaScript in a fresh, disposable QuickJS context.
 *
 * Each run is stateless: a new runtime + context is created and disposed per
 * call, so nothing leaks between users or requests. The WASM module itself is
 * memoized by quickjs-emscripten, so warm calls only pay context creation.
 */
export async function runJsInSandbox(
  code: string,
  options: RunJsSandboxOptions = {}
): Promise<JsSandboxRunResult> {
  const timeoutMs = Math.min(
    Math.max(options.timeoutMs ?? JS_SANDBOX_DEFAULT_TIMEOUT_MS, 1),
    JS_SANDBOX_MAX_TIMEOUT_MS
  );
  const output = createOutputBuffer(options.maxOutputChars);
  const startedAt = Date.now();

  const finish = (
    partial: Pick<JsSandboxRunResult, "success" | "result" | "error">
  ): JsSandboxRunResult => ({
    ...partial,
    logs: output.text,
    durationMs: Date.now() - startedAt,
    truncated: output.truncated,
  });

  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
  runtime.setMaxStackSize(MAX_STACK_SIZE_BYTES);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(startedAt + timeoutMs));
  const ctx = runtime.newContext();

  try {
    installConsole(ctx, output.push);

    const evalResult = ctx.evalCode(code, "script.js");
    if (evalResult.error) {
      const dumped = ctx.dump(evalResult.error);
      evalResult.error.dispose();
      return finish({ success: false, error: formatSandboxError(dumped, timeoutMs) });
    }

    const handle = evalResult.value;
    // Drain microtasks so async code / promise chains settle. The sandbox has
    // no timers or I/O, so anything still pending afterwards can never settle.
    const jobs = runtime.executePendingJobs();
    if (jobs.error) jobs.error.dispose();

    const state = ctx.getPromiseState(handle);
    if (state.type === "pending") {
      handle.dispose();
      return finish({
        success: false,
        error:
          "Script returned a promise that never settles — the sandbox has no timers or network. Compute synchronously instead.",
      });
    }
    if (state.type === "rejected") {
      const dumped = ctx.dump(state.error);
      state.error.dispose();
      handle.dispose();
      return finish({ success: false, error: formatSandboxError(dumped, timeoutMs) });
    }

    const dumpedValue = ctx.dump(state.value);
    if (!state.notAPromise) state.value.dispose();
    handle.dispose();

    const result =
      dumpedValue === undefined
        ? undefined
        : stringifySandboxValue(dumpedValue).slice(
            0,
            options.maxOutputChars ?? JS_SANDBOX_MAX_OUTPUT_CHARS
          );
    return finish({ success: true, result });
  } finally {
    ctx.dispose();
    runtime.dispose();
  }
}
