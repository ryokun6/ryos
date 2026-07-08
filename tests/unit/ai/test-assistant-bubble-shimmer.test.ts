import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const assistantOverlaySource = readFileSync(
  join(import.meta.dir, "../../../src/components/assistant/AssistantOverlay.tsx"),
  "utf8"
);
const toolInvocationDefaultSource = readFileSync(
  join(
    import.meta.dir,
    "../../../src/components/shared/tool-invocation-message/ToolInvocationMessageDefaultView.tsx"
  ),
  "utf8"
);

describe("assistant bubble loading shimmer", () => {
  test("thinking ticker uses shimmer-gray on rolling status text", () => {
    expect(assistantOverlaySource).toContain("shimmer-gray");
    expect(assistantOverlaySource).toContain("function ThinkingTicker");
  });

  test("thinking, error, and reply states share one padded body wrapper", () => {
    expect(assistantOverlaySource).toContain("ASSISTANT_BUBBLE_BODY_CLASS");
    expect(assistantOverlaySource).toContain(
      'className={ASSISTANT_BUBBLE_BODY_CLASS}'
    );
    expect(assistantOverlaySource).toContain("py-1.5 leading-snug");
    expect(assistantOverlaySource).not.toContain("h-[18px]");
  });

  test("tool-call loading fallback uses shimmer treatment", () => {
    expect(toolInvocationDefaultSource).toContain('className="shimmer"');
    expect(toolInvocationDefaultSource).toContain("leading-snug");
    expect(toolInvocationDefaultSource).not.toContain("py-0.5");
  });

  test("side pops skip cross-axis slide while a reply is in flight", () => {
    expect(assistantOverlaySource).toContain(
      "!bubbleVertical && (isLoading || showTyping || Boolean(bubbleText))"
    );
    expect(assistantOverlaySource).not.toContain(
      "clampAssistantAnchorToVisibleBand"
    );
    expect(assistantOverlaySource).not.toContain("visualViewport?.addEventListener");
  });
});
