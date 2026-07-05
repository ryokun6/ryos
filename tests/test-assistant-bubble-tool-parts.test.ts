import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ASSISTANT_BUBBLE_TOOL_NAMES,
  getAssistantBubbleToolParts,
} from "../src/components/assistant/assistantBubbleTools";

const assistantOverlaySource = readFileSync(
  join(import.meta.dir, "../src/components/assistant/AssistantOverlay.tsx"),
  "utf8"
);
const specialContentSource = readFileSync(
  join(
    import.meta.dir,
    "../src/components/shared/tool-invocation-message/tryRenderToolInvocationSpecialContent.tsx"
  ),
  "utf8"
);
const bubbleToolPartsSource = readFileSync(
  join(
    import.meta.dir,
    "../src/components/assistant/AssistantBubbleToolParts.tsx"
  ),
  "utf8"
);

function toolPart(name: string, state = "output-available") {
  return { type: `tool-${name}`, toolCallId: `call-${name}`, state };
}

describe("getAssistantBubbleToolParts", () => {
  test("keeps map, HTML preview, and Cursor tool parts in order", () => {
    const message = {
      role: "assistant",
      parts: [
        { type: "step-start" },
        toolPart("mapsSearchPlaces"),
        { type: "text", text: "here you go" },
        toolPart("generateHtml", "input-streaming"),
        toolPart("cursorCloudAgent"),
        toolPart("listCursorCloudAgentRuns"),
      ],
    };
    expect(
      getAssistantBubbleToolParts(message).map((part) => part.type)
    ).toEqual([
      "tool-mapsSearchPlaces",
      "tool-generateHtml",
      "tool-cursorCloudAgent",
      "tool-listCursorCloudAgentRuns",
    ]);
  });

  test("drops unsupported tools and text parts", () => {
    const message = {
      role: "assistant",
      parts: [
        toolPart("launchApp"),
        toolPart("aquarium"),
        { type: "text", text: "hello" },
      ],
    };
    expect(getAssistantBubbleToolParts(message)).toEqual([]);
  });

  test("returns nothing for user messages or missing messages", () => {
    expect(
      getAssistantBubbleToolParts({
        role: "user",
        parts: [toolPart("generateHtml")],
      })
    ).toEqual([]);
    expect(getAssistantBubbleToolParts(undefined)).toEqual([]);
  });

  test("covers exactly the map, HTML preview, and Cursor tools", () => {
    expect([...ASSISTANT_BUBBLE_TOOL_NAMES].sort()).toEqual([
      "cursorCloudAgent",
      "generateHtml",
      "listCursorCloudAgentRuns",
      "mapsSearchPlaces",
    ]);
  });
});

describe("assistant bubble tool embeds wiring", () => {
  test("overlay renders the tool parts section inside the bubble", () => {
    expect(assistantOverlaySource).toContain("AssistantBubbleToolParts");
    expect(assistantOverlaySource).toContain(
      "parts={bubbleToolParts}"
    );
  });

  test("interacting with an embedded preview holds the bubble open", () => {
    expect(assistantOverlaySource).toContain(
      "holdOpen: isLoading || isInteractingWithPreview"
    );
    expect(assistantOverlaySource).toContain(
      "onInteractionChange={setIsInteractingWithPreview}"
    );
  });

  test("tool embed lifecycle feeds the bubble measure key", () => {
    expect(assistantOverlaySource).toContain("toolPartsMeasureKey");
  });

  test("shared special-content renderer supports compact bubble sizing", () => {
    expect(specialContentSource).toContain("compact = false");
    expect(specialContentSource).toContain("htmlPreviewSizing");
    expect(specialContentSource).toContain(
      'minWidth={compact ? undefined : "320px"}'
    );
  });

  test("embed scroll area leaves room for the preview's outset outline", () => {
    // The HTML preview draws its 1px border as an outset box-shadow; without
    // horizontal padding the wrapper's overflow clipping shaves it off.
    expect(bubbleToolPartsSource).toContain("px-0.5");
    expect(bubbleToolPartsSource).toContain("overflow-y-auto");
  });

  test("compact mode drops card shadows and redundant status rows", () => {
    expect(specialContentSource).toContain(
      '"tool-inline-card-compact !shadow-none"'
    );
    expect(specialContentSource).toContain(
      "(!compact || results.length === 0)"
    );
    expect(specialContentSource).toContain("(!compact || runs.length === 0)");
    expect(specialContentSource).toContain(
      "introMessage={compact ? undefined : out.message}"
    );
  });

  test("compact aqua cards get a crisp panel and hairline border on yellow", () => {
    const aquaCss = readFileSync(
      join(import.meta.dir, "../src/styles/themes/aqua.css"),
      "utf8"
    );
    const compactRule = aquaCss.match(
      /\.maps-place-card-aqua\.tool-inline-card-compact\s*\{[^}]*\}/
    )?.[0];
    expect(compactRule).toBeDefined();
    expect(compactRule).toContain("border: 1px solid");
    expect(compactRule).toContain("background-color");
    // Cascade order: the compact rule must precede the dark Aqua override
    // (equal specificity) so dark mode keeps its own panel + border.
    const darkRuleIndex = aquaCss.indexOf(
      ':root[data-os-theme="macosx"][data-os-color-scheme="dark"] .maps-place-card-aqua'
    );
    expect(darkRuleIndex).toBeGreaterThan(
      aquaCss.indexOf(".maps-place-card-aqua.tool-inline-card-compact")
    );
  });

  test("compact preview height fits inside the bubble's embed scroll area", () => {
    // max-h-56 wrapper (224px) must exceed the compact preview cap plus its
    // vertical margins so a single preview never scrolls or clips.
    expect(bubbleToolPartsSource).toContain("max-h-56");
    expect(specialContentSource).toContain('maxHeight: "200px"');
    expect(specialContentSource).toContain('minHeight: "140px"');
  });
});
