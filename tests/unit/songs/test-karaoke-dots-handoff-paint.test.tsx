/**
 * The dots→lyric handoff must not leave Motion exit nodes in the DOM.
 * happy-dom does not finish AnimatePresence exits, so a lingering dot or a
 * second copy of the incoming line fails this suite immediately.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LyricsAlignment, type LyricLine, type RomanizationSettings } from "../../../src/types/lyrics";
import { LyricsDisplayLines } from "../../../src/apps/ipod/components/lyrics-display/LyricsDisplayLines";
import { useLyricsVisibleLines } from "../../../src/apps/ipod/components/lyrics-display/useLyricsVisibleLines";
import type { LyricsDisplayViewModel } from "../../../src/apps/ipod/components/lyrics-display/useLyricsDisplayController";
import { isInterludePlaceholderLine } from "../../../src/utils/karaokeInterludeDisplay";

const DOT = "\u25CF";

const romanization: RomanizationSettings = {
  enabled: false,
  japaneseFurigana: false,
  japaneseRomaji: false,
  korean: false,
  chinese: false,
  chineseZhuyin: false,
  chineseLyricsLanguage: "auto",
  soramimi: false,
  soramamiTargetLanguage: "en",
};

function line(startTimeMs: number, words: string): LyricLine {
  return {
    startTimeMs: String(startTimeMs),
    words,
    wordTimings: [{ text: words, startTimeMs: 0, durationMs: 2000 }],
  };
}

const lines = [
  line(0, "Older"),
  line(4000, "Finished past"),
  line(20000, "Show me after"),
  line(24000, "The sky and the ocean"),
  line(28000, "Following"),
];

let registeredDomHere = false;
let host: HTMLDivElement | null = null;
let root: Root | null = null;

const originalActEnvironment = Object.getOwnPropertyDescriptor(
  globalThis,
  "IS_REACT_ACT_ENVIRONMENT"
);

beforeAll(() => {
  if (typeof document === "undefined" || !GlobalRegistrator.isRegistered) {
    if (!GlobalRegistrator.isRegistered) {
      GlobalRegistrator.register();
      registeredDomHere = true;
    }
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
  if (originalActEnvironment) {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", originalActEnvironment);
  } else {
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
  if (registeredDomHere && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

afterEach(() => {
  act(() => {
    root?.render(<div />);
  });
});

function paintedText(): string {
  return host?.textContent ?? "";
}

function rowCount(words: string): number {
  return host?.querySelectorAll(`[data-lyric-line="${words}"]`).length ?? 0;
}

function ProbeLines({
  alignment,
  currentIndex,
  currentTimeMs,
  showInterludeEllipsis,
}: {
  alignment: LyricsAlignment;
  currentIndex: number;
  currentTimeMs: number;
  showInterludeEllipsis: boolean;
}) {
  const { visibleLines, introInterludeLead, gapInterludeLead, currentAnchorIdx } =
    useLyricsVisibleLines({
      alignment,
      displayOriginalLines: lines,
      actualCurrentLine: currentIndex,
      visible: true,
      currentTimeMs,
      showInterludeEllipsis,
    });

  const vm: LyricsDisplayViewModel = {
    alignment,
    fontClassName: "font-lyrics-sans",
    romanization,
    showKoreanRomanization: false,
    hasTranslation: false,
    displayOriginalLines: lines,
    actualCurrentLine: currentIndex,
    translationMap: new Map(),
    translationByIndex: [],
    visibleLines,
    introInterludeLead,
    gapInterludeLead,
    currentAnchorIdx,
    currentTimeMs,
    isOldSchoolKaraoke: false,
    isColoredGlow: false,
    isGradientStyle: false,
    highlightColor: "#fff",
    baseColorResolved: undefined,
    glowFilterStr: "",
    glowShadowHighlight: "",
    furiganaMap: new Map(),
    soramimiMap: new Map(),
    renderWithFurigana: (_lyric, text) => text,
    processText: (text) => text,
    textSizeClass: "text-[12px]",
    lineHeightClass: "leading-[1.1]",
    interactive: false,
    gapClass: "gap-2",
    bottomPaddingClass: "pb-5",
    containerStyle: undefined,
    handleWheel: () => {},
    handleTouchStart: () => {},
    handleTouchMove: () => {},
    handleTouchEnd: () => {},
    handleTouchCancel: () => {},
  };

  return <LyricsDisplayLines vm={vm} />;
}

function renderLines(
  alignment: LyricsAlignment,
  currentIndex: number,
  currentTimeMs: number,
  showInterludeEllipsis = true
) {
  act(() => {
    root!.render(
      <ProbeLines
        alignment={alignment}
        currentIndex={currentIndex}
        currentTimeMs={currentTimeMs}
        showInterludeEllipsis={showInterludeEllipsis}
      />
    );
  });
}

describe("dots to first-line handoff paint", () => {
  test("center drops dots immediately and does not duplicate the incoming line", () => {
    renderLines(LyricsAlignment.Center, 1, 9000);
    expect(rowCount("dots")).toBe(1);
    expect(rowCount("Finished past")).toBe(0);
    expect(rowCount("Show me after")).toBe(1);

    renderLines(LyricsAlignment.Center, 2, 20000);
    expect(rowCount("dots")).toBe(0);
    expect(rowCount("Finished past")).toBe(0);
    expect(rowCount("Show me after")).toBe(1);
    expect(paintedText()).not.toContain(DOT);
    expect(host?.querySelector("[data-lyrics-handoff]")?.getAttribute("data-lyrics-handoff")).toBe(
      "1"
    );
  });

  test("focus three does not paint the completed line or leftover dots after the gap", () => {
    renderLines(LyricsAlignment.FocusThree, 1, 9000);
    expect(rowCount("dots")).toBe(1);
    expect(rowCount("Finished past")).toBe(0);

    renderLines(LyricsAlignment.FocusThree, 2, 20000);
    expect(rowCount("dots")).toBe(0);
    expect(rowCount("Finished past")).toBe(0);
    expect(rowCount("Older")).toBe(0);
    expect(rowCount("Show me after")).toBe(1);
    expect(rowCount("The sky and the ocean")).toBe(1);
    expect(rowCount("Following")).toBe(1);
    expect(paintedText()).not.toContain(DOT);
  });

  test("alternating inline dots unmount on the handoff frame", () => {
    renderLines(LyricsAlignment.Alternating, 1, 9000);
    expect(rowCount("dots")).toBe(0);
    expect(paintedText()).toContain(DOT);
    expect(rowCount("Finished past")).toBe(0);

    renderLines(LyricsAlignment.Alternating, 2, 20000);
    expect(rowCount("dots")).toBe(0);
    expect(rowCount("Finished past")).toBe(0);
    expect(rowCount("Show me after")).toBe(1);
    expect(rowCount("The sky and the ocean")).toBe(1);
    expect(paintedText()).not.toContain(DOT);
  });

  test("short gaps and iPod lyrics still keep the previous focus-three row", () => {
    const short = [
      line(0, "One"),
      line(4000, "Two"),
      line(8000, "Three"),
    ];

    function WindowProbe({
      source,
      currentIndex,
      currentTimeMs,
      showInterludeEllipsis,
    }: {
      source: LyricLine[];
      currentIndex: number;
      currentTimeMs: number;
      showInterludeEllipsis: boolean;
    }) {
      const { visibleLines } = useLyricsVisibleLines({
        alignment: LyricsAlignment.FocusThree,
        displayOriginalLines: source,
        actualCurrentLine: currentIndex,
        visible: true,
        currentTimeMs,
        showInterludeEllipsis,
      });
      return (
        <div data-lines>
          {visibleLines
            .map((row) => (isInterludePlaceholderLine(row) ? "dots" : row.words))
            .join("|")}
        </div>
      );
    }

    act(() => {
      root!.render(
        <WindowProbe
          source={short}
          currentIndex={1}
          currentTimeMs={5000}
          showInterludeEllipsis
        />
      );
    });
    expect(host?.querySelector("[data-lines]")?.textContent).toBe("One|Two|Three");

    act(() => {
      root!.render(
        <WindowProbe
          source={lines}
          currentIndex={2}
          currentTimeMs={20000}
          showInterludeEllipsis={false}
        />
      );
    });
    expect(host?.querySelector("[data-lines]")?.textContent).toBe(
      "Finished past|Show me after|The sky and the ocean"
    );
  });
});
