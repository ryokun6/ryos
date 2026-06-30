import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  createLogger,
  isApiDebugLoggingEnabled,
  summarizeForApiLog,
} from "../api/_utils/_logging";

const originalConsoleLog = console.log;
const originalEnv = {
  API_DEBUG_LOGS: process.env.API_DEBUG_LOGS,
  NODE_ENV: process.env.NODE_ENV,
  RYOS_DEBUG: process.env.RYOS_DEBUG,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("API logging", () => {
  afterEach(() => {
    console.log = originalConsoleLog;
    restoreEnv();
  });

  test("redacts sensitive request fields while preserving error messages", () => {
    const summarized = summarizeForApiLog({
      authorization: "Bearer secret",
      password: "secret",
      body: { prompt: "private prompt" },
      message: "private chat message",
      safe: "ok",
      error: {
        kind: "Error",
        name: "Error",
        message: "Cannot read properties of undefined",
        stack: "TypeError: Cannot read properties of undefined",
      },
    }) as Record<string, unknown>;

    const error = summarized.error as Record<string, unknown>;

    expect(summarized.authorization).toBe("[redacted]");
    expect(summarized.password).toBe("[redacted]");
    expect(summarized.body).toBe("[redacted]");
    expect(summarized.message).toBe("[redacted]");
    expect(summarized.safe).toBe("ok");
    expect(error.message).toBe("Cannot read properties of undefined");
  });

  test("debug output is development-enabled and production opt-in", () => {
    const logCalls: unknown[][] = [];
    console.log = mock((...args: unknown[]) => {
      logCalls.push(args);
    }) as unknown as typeof console.log;

    process.env.NODE_ENV = "production";
    delete process.env.RYOS_DEBUG;
    delete process.env.API_DEBUG_LOGS;

    expect(isApiDebugLoggingEnabled()).toBe(false);
    createLogger("req-test").debug("hidden", { token: "secret" });
    expect(logCalls).toHaveLength(0);

    process.env.RYOS_DEBUG = "1";

    expect(isApiDebugLoggingEnabled()).toBe(true);
    createLogger("req-test").debug("visible", { token: "secret" });
    expect(logCalls).toHaveLength(1);
    expect(String(logCalls[0][0])).toContain("visible");
    expect(String(logCalls[0][0])).toContain("[redacted]");
    expect(String(logCalls[0][0])).not.toContain("secret");
  });
});
