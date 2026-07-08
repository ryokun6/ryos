/**
 * Unit tests for the runJs chat tool: Zod input schema plus the QuickJS
 * sandbox itself (no server required — the sandbox is a pure in-process
 * WASM interpreter).
 */

import { describe, expect, test } from "bun:test";
import { runJsSchema } from "../../../api/chat/tools/schemas";
import {
  createOutputBuffer,
  runJsInSandbox,
  stringifySandboxValue,
} from "../../../api/chat/tools/js-sandbox";

describe("runJsSchema", () => {
  test("accepts plain code", () => {
    expect(runJsSchema.safeParse({ code: "1 + 1" }).success).toBe(true);
  });

  test("accepts code with a timeout", () => {
    expect(
      runJsSchema.safeParse({ code: "1 + 1", timeoutSeconds: 10 }).success
    ).toBe(true);
  });

  test("rejects missing code", () => {
    expect(runJsSchema.safeParse({}).success).toBe(false);
  });

  test("rejects empty code", () => {
    expect(runJsSchema.safeParse({ code: "" }).success).toBe(false);
  });

  test("rejects oversized code", () => {
    expect(
      runJsSchema.safeParse({ code: "x".repeat(20_001) }).success
    ).toBe(false);
  });

  test("rejects out-of-range timeouts", () => {
    expect(
      runJsSchema.safeParse({ code: "1", timeoutSeconds: 0 }).success
    ).toBe(false);
    expect(
      runJsSchema.safeParse({ code: "1", timeoutSeconds: 16 }).success
    ).toBe(false);
    expect(
      runJsSchema.safeParse({ code: "1", timeoutSeconds: 2.5 }).success
    ).toBe(false);
  });
});

describe("stringifySandboxValue", () => {
  test("passes strings through", () => {
    expect(stringifySandboxValue("hello")).toBe("hello");
  });

  test("renders BigInt with n suffix", () => {
    expect(stringifySandboxValue(42n)).toBe("42n");
  });

  test("JSON-stringifies objects (BigInt-safe)", () => {
    expect(stringifySandboxValue({ a: 1, b: 2n })).toBe('{"a":1,"b":"2n"}');
  });

  test("renders undefined", () => {
    expect(stringifySandboxValue(undefined)).toBe("undefined");
  });
});

describe("createOutputBuffer", () => {
  test("accumulates lines under the cap", () => {
    const buffer = createOutputBuffer(100);
    buffer.push("one");
    buffer.push("two");
    expect(buffer.text).toBe("one\ntwo");
    expect(buffer.truncated).toBe(false);
  });

  test("truncates once the cap is hit", () => {
    const buffer = createOutputBuffer(10);
    buffer.push("123456789012345");
    expect(buffer.truncated).toBe(true);
    expect(buffer.text).toBe("1234567890…");
    buffer.push("ignored");
    expect(buffer.text).toBe("1234567890…");
  });
});

describe("runJsInSandbox", () => {
  test("computes and returns the completion value", async () => {
    const run = await runJsInSandbox("[1, 2, 3].reduce((a, b) => a + b, 0)");
    expect(run.success).toBe(true);
    expect(run.result).toBe("6");
  });

  test("captures console output", async () => {
    const run = await runJsInSandbox(
      'console.log("a", 1); console.warn("careful"); console.error("bad")'
    );
    expect(run.success).toBe(true);
    expect(run.logs).toBe("a 1\n[warn] careful\n[error] bad");
  });

  test("supports exact BigInt math", async () => {
    const run = await runJsInSandbox("17n ** 23n");
    expect(run.success).toBe(true);
    expect(run.result).toBe("19967568900859523802559065713n");
  });

  test("resolves synchronous async/await code", async () => {
    const run = await runJsInSandbox(
      "async function f() { return 40 + 2 } f()"
    );
    expect(run.success).toBe(true);
    expect(run.result).toBe("42");
  });

  test("reports thrown errors", async () => {
    const run = await runJsInSandbox('throw new Error("boom")');
    expect(run.success).toBe(false);
    expect(run.error).toBe("Error: boom");
  });

  test("reports rejected promises", async () => {
    const run = await runJsInSandbox('Promise.reject(new Error("nope"))');
    expect(run.success).toBe(false);
    expect(run.error).toBe("Error: nope");
  });

  test("fails never-settling promises instead of hanging", async () => {
    const run = await runJsInSandbox("new Promise(() => {})");
    expect(run.success).toBe(false);
    expect(run.error).toContain("never settles");
  });

  test("interrupts infinite loops at the timeout", async () => {
    const run = await runJsInSandbox("while (true) {}", { timeoutMs: 500 });
    expect(run.success).toBe(false);
    expect(run.error).toBe("Execution timed out after 500ms");
    expect(run.durationMs).toBeLessThan(5_000);
  });

  test("has no host APIs (fetch, process, timers)", async () => {
    for (const expression of ["fetch", "process", "setTimeout", "require"]) {
      const run = await runJsInSandbox(`${expression}("x")`);
      expect(run.success).toBe(false);
      expect(run.error).toContain("not defined");
    }
  });

  test(
    "enforces the memory limit",
    async () => {
      const run = await runJsInSandbox(
        "const a = []; while (true) a.push(new Array(1e6).fill(0))",
        { timeoutMs: 15_000 }
      );
      expect(run.success).toBe(false);
      expect(run.error).toContain("memory limit");
    },
    { timeout: 20_000 }
  );

  test("truncates oversized console output", async () => {
    const run = await runJsInSandbox(
      'for (let i = 0; i < 100; i++) console.log("x".repeat(1000))',
      { maxOutputChars: 5_000 }
    );
    expect(run.success).toBe(true);
    expect(run.truncated).toBe(true);
    expect(run.logs.length).toBeLessThanOrEqual(5_001);
  });

  test("runs are stateless between calls", async () => {
    await runJsInSandbox("globalThis.leak = 123");
    const run = await runJsInSandbox("typeof globalThis.leak");
    expect(run.result).toBe("undefined");
  });
});
