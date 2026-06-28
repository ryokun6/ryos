import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createClientLogger,
  summarizeForLog,
} from "../src/utils/logger";
import {
  DEBUG_FLAG_KEY,
  refreshRuntimeDebugFlag,
  setRuntimeDebugEnabled,
} from "../src/utils/debug";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalLocalStorage = globalThis.localStorage;

function installMemoryStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
      clear: () => data.clear(),
    } satisfies Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear">,
  });
}

describe("client logger", () => {
  let logCalls: unknown[][] = [];
  let infoCalls: unknown[][] = [];
  let warnCalls: unknown[][] = [];
  let errorCalls: unknown[][] = [];

  beforeEach(() => {
    installMemoryStorage();
    refreshRuntimeDebugFlag();
    setRuntimeDebugEnabled(false);
    logCalls = [];
    infoCalls = [];
    warnCalls = [];
    errorCalls = [];
    console.log = mock((...args: unknown[]) => {
      logCalls.push(args);
    }) as unknown as typeof console.log;
    console.info = mock((...args: unknown[]) => {
      infoCalls.push(args);
    }) as unknown as typeof console.info;
    console.warn = mock((...args: unknown[]) => {
      warnCalls.push(args);
    }) as unknown as typeof console.warn;
    console.error = mock((...args: unknown[]) => {
      errorCalls.push(args);
    }) as unknown as typeof console.error;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: originalLocalStorage,
      });
    }
    refreshRuntimeDebugFlag();
  });

  test("gates debug and info while keeping warnings visible", () => {
    const logger = createClientLogger("TestScope");

    logger.debug("hidden debug");
    logger.info("hidden info");
    logger.warn("visible warning", { ok: true });

    expect(logCalls).toHaveLength(0);
    expect(infoCalls).toHaveLength(0);
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0][0]).toBe("[TestScope]");

    setRuntimeDebugEnabled(true);
    logger.debug("visible debug", { ok: true });
    logger.info("visible info", { ok: true });

    expect(logCalls).toHaveLength(1);
    expect(infoCalls).toHaveLength(1);
    expect(globalThis.localStorage.getItem(DEBUG_FLAG_KEY)).toBe("1");
  });

  test("redacts sensitive fields and summarizes large values", () => {
    const summarized = summarizeForLog({
      prompt: "please keep this private",
      contentMarkdown: "# secret note",
      nested: {
        deviceId: "camera-123",
        safeValue: "x".repeat(220),
      },
      list: Array.from({ length: 12 }, (_, i) => i),
    }) as Record<string, unknown>;

    expect(summarized.prompt).toBe("[redacted]");
    expect(summarized.contentMarkdown).toBe("[redacted]");
    expect((summarized.nested as Record<string, unknown>).deviceId).toBe(
      "[redacted]"
    );
    expect((summarized.nested as Record<string, unknown>).safeValue).toContain(
      "truncated"
    );
    expect(summarized.list).toEqual([0, 1, 2, 3, 4, 5, 6, 7, "... (4 more)"]);
  });
});

describe("client logging guardrails", () => {
  test("Control Panels Debug Mode feeds the runtime debug logger flag", () => {
    const source = readSource("src/stores/useDisplaySettingsStore.ts");

    expect(source).toContain("setRuntimeDebugEnabled(enabled)");
    expect(source).toContain("setRuntimeDebugEnabled(Boolean(state?.debugMode))");
  });

  test("sensitive/noisy client paths do not use raw console.log", () => {
    const files = [
      "src/apps/chats/hooks/useAiChat.ts",
      "src/apps/chats/hooks/useChatRoom.ts",
      "src/apps/chats/hooks/useSyncedAiMessages.ts",
      "src/apps/chats/components/chats-app/useChatsAppController.tsx",
      "src/apps/chats/tools/appHandlers.ts",
      "src/apps/chats/tools/settingsHandler.ts",
      "src/apps/chats/tools/ipodHandler.ts",
      "src/apps/chats/tools/karaokeHandler.ts",
      "src/apps/finder/hooks/useFileSystem.ts",
      "src/apps/internet-explorer/hooks/useInternetExplorerLogic.ts",
      "src/apps/photo-booth/hooks/usePhotoBoothLogic.ts",
      "src/apps/pc/hooks/usePcLogic.ts",
      "src/utils/prefetch.ts",
    ];

    for (const file of files) {
      expect(readSource(file)).not.toContain("console.log");
    }
  });

  test("high-risk payload logs stay summarized", () => {
    expect(readSource("src/apps/chats/hooks/useAiChat.ts")).not.toContain(
      "Submitting AI chat with system state:"
    );
    expect(readSource("src/apps/chats/hooks/useChatRoom.ts")).not.toContain(
      "Received room-message:"
    );
    expect(readSource("src/apps/finder/hooks/useFileSystem.ts")).not.toContain(
      "Preparing initialData for"
    );
    expect(readSource("src/apps/photo-booth/hooks/usePhotoBoothLogic.ts")).not.toContain(
      "Video track:"
    );
    expect(readSource("src/lib/audioContext.ts")).not.toContain("console.debug");
  });
});
