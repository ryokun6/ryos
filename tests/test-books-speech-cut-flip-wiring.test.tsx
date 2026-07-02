/**
 * Wiring test for read-aloud across a page boundary that cuts a sentence in
 * half: the page must flip while the cut sentence is being spoken (at the
 * cut), the in-flight utterance must survive the flip, and speech on the new
 * page must continue with the next sentence instead of repeating the cut one
 * — even when epub.js detaches the previous page's DOM nodes.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React from "react";
import { createRoot, type Root } from "react-dom/client";

if (typeof document === "undefined") {
  GlobalRegistrator.register();
}

const { useBooksSpeech } = await import(
  "../src/apps/books/hooks/useBooksSpeech"
);
type SpeechRenditionLike =
  import("../src/apps/books/utils/booksSpeech").SpeechRenditionLike;

class FakeUtterance {
  text: string;
  lang = "";
  rate = 1;
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onboundary: ((event: { charIndex: number }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

const spoken: FakeUtterance[] = [];
const synth = {
  speaking: false,
  pending: false,
  cancelCount: 0,
  cancel() {
    this.cancelCount += 1;
    this.speaking = false;
    this.pending = false;
  },
  resume() {},
  getVoices: () => [] as SpeechSynthesisVoice[],
  speak(utterance: FakeUtterance) {
    spoken.push(utterance);
    this.speaking = true;
  },
};

(window as unknown as { speechSynthesis: unknown }).speechSynthesis = synth;
(
  globalThis as unknown as { SpeechSynthesisUtterance: unknown }
).SpeechSynthesisUtterance = FakeUtterance;

// One paragraph; the page boundary cuts the middle sentence after
// "Gamma delta". Page 1 shows [0, CUT); page 2 shows [CUT, end).
const BOOK_HTML = "<p>Alpha beta. Gamma delta epsilon zeta. Eta theta.</p>";
const CUT = "Alpha beta. Gamma delta".length;

function bookTextNode(): Text {
  return document.querySelector("#book p")!.firstChild as Text;
}

function finishUtterance(utterance: FakeUtterance) {
  synth.speaking = false;
  utterance.onend?.();
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for speech wiring state");
}

let page = 1;
let advanceCalls = 0;
let controls: ReturnType<typeof useBooksSpeech> | null = null;

const rendition: SpeechRenditionLike = {
  currentLocation: () =>
    page === 1
      ? { start: { cfi: "epubcfi(p1-start)" }, end: { cfi: "epubcfi(p1-end)" } }
      : {
          start: { cfi: "epubcfi(p2-start)" },
          end: { cfi: "epubcfi(p2-end)" },
        },
  getRange: (cfi: string) => {
    const node = bookTextNode();
    const range = document.createRange();
    if (cfi.includes("p1-start")) range.setStart(node, 0);
    else if (cfi.includes("p1-end") || cfi.includes("p2-start")) {
      range.setStart(node, CUT);
    } else range.setStart(node, node.data.length);
    range.collapse(true);
    return range;
  },
};

function SpeechProbe() {
  controls = useBooksSpeech({
    getRendition: () => rendition,
    getSpeechLanguage: () => "en-US",
    getSpeechRate: () => 1,
    canAdvancePage: () => page === 1,
    advancePage: () => {
      advanceCalls += 1;
      page = 2;
      // epub.js replaces section views on a page turn, detaching the nodes
      // the previous page's carry-over pointed at.
      document.querySelector("#book")!.innerHTML = BOOK_HTML;
      // epub.js delivers `relocated` asynchronously after a turn.
      setTimeout(() => controls?.handleRelocated(), 20);
    },
  });
  return null;
}

let root: Root | null = null;

afterEach(async () => {
  controls?.stopSpeaking();
  root?.unmount();
  root = null;
  controls = null;
  document.body.replaceChildren();
  // Let React's scheduler flush before happy-dom is torn down.
  await new Promise((resolve) => setTimeout(resolve, 20));
});

afterAll(() => {
  if (GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

describe("read-aloud across a mid-sentence page boundary", () => {
  test("flips at the cut and resumes with the next sentence (no repeat)", async () => {
    document.body.innerHTML = `<div id="book">${BOOK_HTML}</div>`;
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    root.render(React.createElement(SpeechProbe));
    await waitFor(() => controls !== null);

    controls!.startSpeaking();
    await waitFor(() => spoken.length === 1);
    expect(spoken[0].text).toBe("Alpha beta.");
    spoken[0].onstart?.();
    finishUtterance(spoken[0]);

    // The cut sentence is spoken whole (extended past the page boundary).
    await waitFor(() => spoken.length === 2);
    expect(spoken[1].text).toBe("Gamma delta epsilon zeta.");
    spoken[1].onstart?.();

    // Speech crosses the page cut -> the page flips immediately...
    const cancelsBeforeFlip = synth.cancelCount;
    spoken[1].onboundary?.({ charIndex: "Gamma delta ".length });
    expect(advanceCalls).toBe(1);
    expect(page).toBe(2);

    // ...and the relocation does NOT cancel the in-flight utterance.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(synth.cancelCount).toBe(cancelsBeforeFlip);
    expect(synth.speaking).toBe(true);

    // The sentence tail finishes after the flip; speech resumes on the new
    // page with the NEXT sentence instead of repeating the cut sentence —
    // even though the previous page's carry-over nodes are now detached.
    finishUtterance(spoken[1]);
    await waitFor(() => spoken.length === 3);
    expect(spoken[2].text).toBe("Eta theta.");
    expect(spoken.map((utterance) => utterance.text)).not.toContain(
      "epsilon zeta."
    );
    // No extra page turns were issued for the crossing.
    expect(advanceCalls).toBe(1);
  }, 10000);

  test("flips on a timer for Chinese when boundary events never fire", async () => {
    // CJK voices rarely emit word boundaries (no spaces). The rate-based cut
    // timer must turn the page without an onboundary event.
    const chineseHtml = "<p>甲乙丙。丁戊己庚辛壬癸。子丑寅。</p>";
    const chineseCut = "甲乙丙。丁戊己".length;
    page = 1;
    advanceCalls = 0;
    spoken.length = 0;
    synth.cancelCount = 0;
    synth.speaking = false;

    document.body.innerHTML = `<div id="book">${chineseHtml}</div>`;
    const host = document.createElement("div");
    document.body.appendChild(host);

    const chineseRendition: SpeechRenditionLike = {
      currentLocation: () =>
        page === 1
          ? {
              start: { cfi: "epubcfi(p1-start)" },
              end: { cfi: "epubcfi(p1-end)" },
            }
          : {
              start: { cfi: "epubcfi(p2-start)" },
              end: { cfi: "epubcfi(p2-end)" },
            },
      getRange: (cfi: string) => {
        const node = document.querySelector("#book p")!.firstChild as Text;
        const range = document.createRange();
        if (cfi.includes("p1-start")) range.setStart(node, 0);
        else if (cfi.includes("p1-end") || cfi.includes("p2-start")) {
          range.setStart(node, chineseCut);
        } else range.setStart(node, node.data.length);
        range.collapse(true);
        return range;
      },
    };

    function ChineseSpeechProbe() {
      controls = useBooksSpeech({
        getRendition: () => chineseRendition,
        getSpeechLanguage: () => "zh-CN",
        getSpeechRate: () => 1,
        canAdvancePage: () => page === 1,
        advancePage: () => {
          advanceCalls += 1;
          page = 2;
          document.querySelector("#book")!.innerHTML = chineseHtml;
          setTimeout(() => controls?.handleRelocated(), 20);
        },
      });
      return null;
    }

    root = createRoot(host);
    root.render(React.createElement(ChineseSpeechProbe));
    await waitFor(() => controls !== null);

    controls!.startSpeaking();
    await waitFor(() => spoken.length === 1);
    expect(spoken[0].text).toBe("甲乙丙。");
    spoken[0].onstart?.();
    finishUtterance(spoken[0]);

    await waitFor(() => spoken.length === 2);
    expect(spoken[1].text).toBe("丁戊己庚辛壬癸。");
    // Mid-sentence cut must be detected for the timer to arm.
    expect(typeof spoken[1].onboundary).toBe("function");
    spoken[1].onstart?.();
    // Deliberately do NOT fire onboundary — CJK engines usually don't.

    await waitFor(() => advanceCalls === 1, 2000);
    expect(page).toBe(2);
    // Let `relocated` resume speech before finishing the cut utterance, same
    // as a real epub.js page turn (cut audio continues across the flip).
    await new Promise((resolve) => setTimeout(resolve, 60));

    finishUtterance(spoken[1]);
    await waitFor(() => spoken.length === 3);
    expect(spoken[2].text).toBe("子丑寅。");
    expect(spoken.map((utterance) => utterance.text)).not.toContain("庚辛壬癸。");
    expect(advanceCalls).toBe(1);
  }, 10000);
});
