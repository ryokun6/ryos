import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

import {
  createClientLogger,
  summarizeForLog,
} from "../src/utils/logger";
import {
  DEBUG_FLAG_KEY,
  isDebugEnabled,
  normalizeDebugMode,
  refreshRuntimeDebugFlag,
  resolveDebugEnabled,
  setRuntimeDebugEnabled,
} from "../src/utils/debug";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function listSourceFiles(relativeDir: string): string[] {
  const absoluteDir = resolve(process.cwd(), relativeDir);
  const files: string[] = [];

  for (const entry of readdirSync(absoluteDir)) {
    const absolutePath = resolve(absoluteDir, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      files.push(...listSourceFiles(relative(process.cwd(), absolutePath)));
      continue;
    }

    const extension = entry.includes(".")
      ? entry.slice(entry.lastIndexOf("."))
      : "";
    if (SOURCE_EXTENSIONS.has(extension)) {
      files.push(relative(process.cwd(), absolutePath));
    }
  }

  return files.sort();
}

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
    writable: true,
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
        writable: true,
      });
    }
    refreshRuntimeDebugFlag();
  });

  test("gates debug and info immediately while keeping warnings and errors visible", () => {
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

    setRuntimeDebugEnabled(false);
    logger.debug("hidden again");
    logger.info("hidden again");
    logger.warn("still visible");
    logger.error("still visible");

    expect(logCalls).toHaveLength(1);
    expect(infoCalls).toHaveLength(1);
    expect(warnCalls).toHaveLength(2);
    expect(errorCalls).toHaveLength(1);
    expect(globalThis.localStorage.getItem(DEBUG_FLAG_KEY)).toBeNull();
  });

  test("an explicit disable overrides development and stored defaults", () => {
    expect(
      resolveDebugEnabled({
        runtimeOverride: false,
        storedOverride: true,
        developmentDefault: true,
      })
    ).toBe(false);
    expect(
      resolveDebugEnabled({
        runtimeOverride: null,
        storedOverride: false,
        developmentDefault: true,
      })
    ).toBe(false);
  });

  test("cleans up legacy non-affirmative debug flags at startup", () => {
    for (const storedValue of ["false", "0", "true", "malformed", ""]) {
      globalThis.localStorage.setItem(DEBUG_FLAG_KEY, storedValue);
      refreshRuntimeDebugFlag();

      expect(isDebugEnabled()).toBe(false);
      expect(globalThis.localStorage.getItem(DEBUG_FLAG_KEY)).toBeNull();
    }
  });

  test("normalizes malformed persisted Control Panels values as disabled", () => {
    expect(normalizeDebugMode(true)).toBe(true);
    expect(normalizeDebugMode(false)).toBe(false);
    expect(normalizeDebugMode("false")).toBe(false);
    expect(normalizeDebugMode("0")).toBe(false);
    expect(normalizeDebugMode(1)).toBe(false);
    expect(normalizeDebugMode(null)).toBe(false);
  });

  test("redacts sensitive fields and summarizes large values", () => {
    const summarized = summarizeForLog({
      prompt: "please keep this private",
      message: "private chat text",
      contentMarkdown: "# secret note",
      nested: {
        deviceId: "camera-123",
        safeValue: "x".repeat(220),
      },
      list: Array.from({ length: 12 }, (_, i) => i),
    }) as Record<string, unknown>;

    expect(summarized.prompt).toBe("[redacted]");
    expect(summarized.message).toBe("[redacted]");
    expect(summarized.contentMarkdown).toBe("[redacted]");
    expect((summarized.nested as Record<string, unknown>).deviceId).toBe(
      "[redacted]"
    );
    expect((summarized.nested as Record<string, unknown>).safeValue).toContain(
      "truncated"
    );
    expect(summarized.list).toEqual([0, 1, 2, 3, 4, 5, 6, 7, "... (4 more)"]);
  });

  test("keeps error message, stack, cause, and safe custom fields", () => {
    const cause = new Error("zip container missing package document");
    cause.stack = `Error: zip container missing package document\n${"at epub.js loader\n".repeat(20)}`;
    const error = new Error("failed to display EPUB") as Error & {
      cause?: unknown;
      requestToken?: string;
      sectionHref?: string;
    };
    error.stack = "Error: failed to display EPUB\nat Rendition.display (epubjs.js:1:2)";
    error.cause = cause;
    error.requestToken = "secret-token";
    error.sectionHref = "chapter-1.xhtml";

    const summarized = summarizeForLog(error) as Record<string, unknown>;
    const summarizedCause = summarized.cause as Record<string, unknown>;
    const props = summarized.props as Record<string, unknown>;

    expect(summarized.kind).toBe("Error");
    expect(summarized.message).toBe("failed to display EPUB");
    expect(summarized.stack).toContain("Rendition.display");
    expect(summarizedCause.message).toBe("zip container missing package document");
    expect(summarizedCause.stack).toContain("epub.js loader");
    expect(props.requestToken).toBe("[redacted]");
    expect(props.sectionHref).toBe("chapter-1.xhtml");
  });

  test("preserves serialized error messages without unredacting normal messages", () => {
    const summarized = summarizeForLog({
      message: "user-authored chat message",
      error: {
        kind: "Error",
        name: "Error",
        message: "Cannot read properties of undefined",
        stack: "TypeError: Cannot read properties of undefined\nat book.js:1:2",
      },
    }) as Record<string, unknown>;
    const error = summarized.error as Record<string, unknown>;

    expect(summarized.message).toBe("[redacted]");
    expect(error.message).toBe("Cannot read properties of undefined");
    expect(error.stack).toContain("book.js");
  });
});

describe("client logging guardrails", () => {
  test("Control Panels Debug Mode feeds logger and console capture flags", () => {
    const source = readSource("src/stores/useDisplaySettingsStore.ts");

    expect(source).toContain("setRuntimeDebugEnabled(enabled)");
    expect(source).toContain("setConsoleCaptureEnabled(enabled)");
    expect(source).toContain(
      "const debugEnabled = normalizeDebugMode(state?.debugMode)"
    );
    expect(source).toContain("setRuntimeDebugEnabled(debugEnabled)");
    expect(source).toContain("setConsoleCaptureEnabled(debugEnabled)");
    expect(source).toContain(
      "debugMode: normalizeDebugMode(persisted?.debugMode)"
    );
  });

  test("client code does not use raw console.log or console.debug outside logger sinks", () => {
    const allowedFiles = new Set(["src/utils/debug.ts", "src/utils/logger.ts"]);
    const offenders = listSourceFiles("src")
      .filter((file) => !allowedFiles.has(file))
      .flatMap((file) => {
        const source = readSource(file);
        return ["console.log", "console.debug"]
          .filter((needle) => source.includes(needle))
          .map((needle) => `${file}: ${needle}`);
      });

    expect(offenders).toEqual([]);
  });

  test("legacy debug helper is not imported by feature code", () => {
    const offenders = listSourceFiles("src").flatMap((file) => {
      const source = readSource(file);
      if (!source.includes("@/utils/debug")) return [];
      if (
        file === "src/utils/logger.ts" ||
        file === "src/stores/useDisplaySettingsStore.ts"
      ) {
        return [];
      }
      return [file];
    });

    expect(offenders).toEqual([]);
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

  test("major app lifecycle debug logs stay in shared shell paths", () => {
    const appStoreSource = readSource("src/stores/useAppStore.ts");
    const appManagerSource = readSource(
      "src/apps/base/app-manager/useAppManager.ts"
    );
    const appManagerViewSource = readSource(
      "src/apps/base/app-manager/AppManagerView.tsx"
    );
    const appShellSource = readSource("src/App.tsx");
    const bootstrapSource = readSource("src/main.tsx");

    expect(appStoreSource).toContain('createClientLogger("AppStore")');
    expect(appStoreSource).toContain("describeInitialData(initialData)");
    expect(appStoreSource).toContain('"Launch requested"');
    expect(appStoreSource).toContain('"Created app instance"');
    expect(appStoreSource).toContain('"Focused app instance"');
    expect(appStoreSource).toContain('"Closed app instance"');

    expect(appManagerSource).toContain('createClientLogger("AppManager")');
    expect(appManagerSource).toContain('"Received app launch request"');
    expect(appManagerSource).toContain('"Window manager state changed"');

    expect(appManagerViewSource).toContain(
      'createClientLogger("AppManagerView")'
    );
    expect(appManagerViewSource).toContain(
      '"Managed app instance state changed"'
    );
    expect(appManagerViewSource).toContain('"App instance crashed"');

    expect(appShellSource).toContain('createClientLogger("AppShell")');
    expect(appShellSource).toContain('"Applied display mode"');
    expect(bootstrapSource).toContain('createClientLogger("Bootstrap")');
    expect(bootstrapSource).toContain('"Starting client bootstrap"');
  });

});
