/**
 * Consolidated assistant bubble styling pins (shimmer + rounded font).
 * Behavioral tool-part selection stays in test-assistant-bubble-tool-parts.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aquaThemeCss,
  extractRuleBlock,
  indexCss,
} from "../../helpers/theme-css-fixtures";

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
      "className={ASSISTANT_BUBBLE_BODY_CLASS}"
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

describe("assistant bubble rounded font (macOS theme)", () => {
  test("overlay root exposes the data-assistant-overlay hook and geneva classes", () => {
    expect(assistantOverlaySource).toContain("data-assistant-overlay");
    expect(assistantOverlaySource).toContain("font-geneva-12");
  });

  test("aqua theme maps assistant bubble text + input to the rounded VAG stack", () => {
    const roundedBlock = extractRuleBlock(
      aquaThemeCss,
      ':root[data-os-theme="macosx"] [data-assistant-overlay] .font-geneva-12'
    );

    expect(roundedBlock).toContain('"ryOS VAG Rounded"');
    expect(roundedBlock).toContain('"Chiron GoRound TC WS"');
    expect(roundedBlock).toContain("!important");
  });

  test("macOS Lucida override excludes the assistant overlay", () => {
    const lucidaRuleStart = aquaThemeCss.indexOf(
      "Outside iPod, Karaoke, and Videos LCD"
    );
    const lucidaRule = aquaThemeCss.slice(lucidaRuleStart, lucidaRuleStart + 800);

    expect(lucidaRule).toContain(
      ":not([data-assistant-overlay] .font-geneva-12)"
    );
  });

  test("system-font override keeps the assistant overlay excluded (all themes unaffected)", () => {
    const systemFontRuleStart = indexCss.indexOf(
      ":root[data-os-system-font] .font-geneva-12:not("
    );
    const systemFontRule = indexCss.slice(
      systemFontRuleStart,
      indexCss.indexOf("{", systemFontRuleStart)
    );

    expect(systemFontRule).toContain(
      ":not([data-assistant-overlay] .font-geneva-12)"
    );
  });
});
