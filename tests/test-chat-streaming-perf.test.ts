/**
 * Chat streaming performance guardrails.
 *
 * Long applet (generateHtml) streams used to stall the chat UI because every
 * throttled token delta re-wrapped the entire message list and re-ran the
 * expensive full-document HTML scaffold. These tests pin the fixes:
 *
 * 1. buildDisplayMessages keeps referential identity for unchanged messages.
 * 2. useAiChat caches timestamp wrappers per message id.
 * 3. useProcessedHtml skips generateProcessedHtmlContent while streaming and
 *    defers the save variant until a save is requested.
 * 4. useStreamPreview throttles with a trailing render and skips redundant
 *    sanitization passes.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import type { AIChatMessage } from "../src/types/chat";
import { buildDisplayMessages } from "../src/apps/chats/utils/messages";
import { getStreamPreviewThrottleMs } from "../src/components/shared/html-preview/hooks/useStreamPreview";

const readSource = (relPath: string): string =>
  readFileSync(resolve(process.cwd(), relPath), "utf-8");

const makeAiMessage = (id: string, role: "user" | "assistant", text: string): AIChatMessage => ({
  id,
  role,
  parts: [{ type: "text", text }],
  metadata: { createdAt: new Date("2026-01-01T00:00:00Z") },
});

describe("buildDisplayMessages referential stability", () => {
  const baseParams = {
    currentRoomId: null,
    currentRoomMessagesLimited: [],
    messageRenderLimit: 100,
    username: "alice",
  };

  test("returns the same display objects when source messages are unchanged", () => {
    const user = makeAiMessage("u1", "user", "make me an applet");
    const assistant = makeAiMessage("a1", "assistant", "sure!");
    const aiMessages = [user, assistant];

    const first = buildDisplayMessages({ ...baseParams, aiMessages });
    const second = buildDisplayMessages({ ...baseParams, aiMessages });

    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
  });

  test("only the changed message gets a new wrapper across streaming ticks", () => {
    const user = makeAiMessage("u1", "user", "make me an applet");
    const streamingTick1 = makeAiMessage("a1", "assistant", "<html>");
    const streamingTick2 = makeAiMessage("a1", "assistant", "<html><body>");

    const first = buildDisplayMessages({
      ...baseParams,
      aiMessages: [user, streamingTick1],
    });
    const second = buildDisplayMessages({
      ...baseParams,
      aiMessages: [user, streamingTick2],
    });

    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
    expect(second[1].parts).toBe(streamingTick2.parts);
  });

  test("re-wraps user messages when the username changes", () => {
    const user = makeAiMessage("u1", "user", "hello");

    const first = buildDisplayMessages({ ...baseParams, aiMessages: [user] });
    const second = buildDisplayMessages({
      ...baseParams,
      username: "bob",
      aiMessages: [user],
    });

    expect(first[0].username).toBe("alice");
    expect(second[0].username).toBe("bob");
    expect(second[0]).not.toBe(first[0]);
  });

  test("preserves display message content and role", () => {
    const user = makeAiMessage("u1", "user", "hello");
    const assistant = makeAiMessage("a1", "assistant", "hi!");

    const result = buildDisplayMessages({
      ...baseParams,
      aiMessages: [user, assistant],
    });

    expect(result[0].role).toBe("user");
    expect(result[0].username).toBe("alice");
    expect(result[1].role).toBe("assistant");
    expect(result[1].username).toBe("Ryo");
  });
});

describe("useAiChat timestamp wrapper cache wiring", () => {
  const source = readSource("src/apps/chats/hooks/useAiChat.ts");

  test("keeps a per-id cache of timestamp-wrapped messages", () => {
    expect(source).toContain("timestampedMessageCacheRef");
    expect(source).toContain("cached.source === msg");
  });

  test("reuses cached wrappers instead of cloning every message", () => {
    expect(source).toContain("return cached.wrapped;");
    // The old pattern cloned unconditionally on every render tick.
    expect(source).not.toMatch(
      /currentSdkMessages as UIMessage\[\]\)\.map\(\(msg\) => \(\{\s*\.\.\.msg,/
    );
  });

  test("onFinish reuses pinned createdAt from the streaming cache", () => {
    expect(source).toContain(
      "timestampedMessageCacheRef.current.get(msg.id)?.createdAt"
    );
  });
});

describe("useProcessedHtml streaming gate wiring", () => {
  const source = readSource(
    "src/components/shared/html-preview/hooks/useProcessedHtml.ts"
  );

  test("skips full document generation while streaming", () => {
    expect(source).toMatch(/if \(isStreaming\) return "";/);
  });

  test("computes the save variant lazily on demand", () => {
    expect(source).toContain("getProcessedHtmlContentForSave");
    // The save variant must not run eagerly inside a useMemo on content change.
    expect(source).not.toMatch(
      /const processedHtmlContentForSave = useMemo/
    );
  });

  test("HtmlPreview passes isStreaming to useProcessedHtml and memoizes the component", () => {
    const previewSource = readSource(
      "src/components/shared/html-preview/HtmlPreview.tsx"
    );
    expect(previewSource).toMatch(
      /useProcessedHtml\(htmlContent, normalizedBaseUrl, isTrustedApplet, isStreaming\)/
    );
    expect(previewSource).toContain("export default memo(HtmlPreview);");
  });
});

describe("useStreamPreview throttle wiring", () => {
  const source = readSource(
    "src/components/shared/html-preview/hooks/useStreamPreview.ts"
  );

  test("schedules a trailing render so final chunks are never dropped", () => {
    expect(source).toContain("trailingTimerRef");
    expect(source).toMatch(/setTimeout\(/);
    expect(source).toMatch(/throttleMs - elapsed/);
  });

  test("preview keeps streaming but backs off as content grows", () => {
    // Small applets keep the original 500ms cadence (no UX change).
    expect(getStreamPreviewThrottleMs(1_000)).toBe(500);
    expect(getStreamPreviewThrottleMs(32_768)).toBe(500);
    // Larger documents repaint less frequently, but still repaint.
    expect(getStreamPreviewThrottleMs(64_000)).toBe(1000);
    expect(getStreamPreviewThrottleMs(200_000)).toBe(2000);
  });

  test("skips sanitization when extracted HTML is unchanged", () => {
    expect(source).toContain("lastExtractedRef");
    expect(source).toMatch(/extracted !== lastExtractedRef.current/);
  });

  test("reads the latest content via ref inside scheduled renders", () => {
    expect(source).toContain("latestContentRef.current = htmlContent;");
    expect(source).toMatch(/extractHtmlContent\(\s*latestContentRef.current\s*\)/);
  });
});
