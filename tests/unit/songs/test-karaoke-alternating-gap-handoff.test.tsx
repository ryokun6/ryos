import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LyricsAlignment, type LyricLine } from "../../../src/types/lyrics";
import { useLyricsVisibleLines } from "../../../src/apps/ipod/components/lyrics-display/useLyricsVisibleLines";
import { isInterludePlaceholderLine } from "../../../src/utils/karaokeInterludeDisplay";

let registeredDomForSuite = false;
let host: HTMLDivElement | null = null;
let root: Root | null = null;

function line(startTimeMs: number, words: string): LyricLine {
  return { startTimeMs: String(startTimeMs), words };
}

function Probe({
  lines,
  currentIndex,
  currentTimeMs,
}: {
  lines: LyricLine[];
  currentIndex: number;
  currentTimeMs: number;
}) {
  const { visibleLines } = useLyricsVisibleLines({
    alignment: LyricsAlignment.Alternating,
    displayOriginalLines: lines,
    actualCurrentLine: currentIndex,
    visible: true,
    currentTimeMs,
    showInterludeEllipsis: true,
  });

  return (
    <div data-lines>
      {visibleLines
        .map((row) => (isInterludePlaceholderLine(row) ? "dots" : row.words))
        .join("|")}
    </div>
  );
}

function renderProbe(
  lines: LyricLine[],
  currentIndex: number,
  currentTimeMs: number
) {
  act(() => {
    root!.render(
      <Probe
        lines={lines}
        currentIndex={currentIndex}
        currentTimeMs={currentTimeMs}
      />
    );
  });
}

function visibleText(): string {
  return host?.querySelector("[data-lines]")?.textContent ?? "";
}

describe("alternating layout after delay dots", () => {
  beforeAll(() => {
    if (!GlobalRegistrator.isRegistered) {
      GlobalRegistrator.register();
      registeredDomForSuite = true;
    }
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      writable: true,
      value: true,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterAll(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    host = null;
    root = null;
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    if (registeredDomForSuite && GlobalRegistrator.isRegistered) {
      GlobalRegistrator.unregister();
    }
  });

  test("does not flash the finished lyric in the second slot when dots end", () => {
    const lines = [
      line(0, "One"),
      line(4000, "Two"),
      line(20000, "Three"),
      line(28000, "Four"),
    ];

    renderProbe(lines, 1, 9000);
    expect(visibleText()).toBe("Three|Four");

    renderProbe(lines, 2, 20000);
    expect(visibleText()).toBe("Three|Four");
    expect(visibleText().includes("Two")).toBe(false);
  });

  test("keeps the post-dot pair when the first gap ends on an even row", () => {
    const lines = [
      line(0, "Finished"),
      line(15000, "After dots"),
      line(22000, "Following"),
    ];

    renderProbe(lines, 0, 5000);
    expect(visibleText()).toBe("Following|After dots");

    renderProbe(lines, 1, 15000);
    expect(visibleText()).toBe("Following|After dots");
    expect(visibleText().includes("Finished")).toBe(false);
  });
});
