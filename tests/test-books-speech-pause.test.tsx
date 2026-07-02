/**
 * Wiring tests for the Books read-aloud pause/resume controls
 * (useBooksSpeech): pausing cancels the engine but keeps the position,
 * resuming re-speaks the interrupted sentence, and page relocation while
 * paused resumes playback on the new page.
 */
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React from "react";
import { createRoot, type Root } from "react-dom/client";

if (typeof document === "undefined") {
  GlobalRegistrator.register();
}

class FakeUtterance {
  text: string;
  lang = "";
  rate = 1;
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}
(globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance =
  FakeUtterance;

const spoken: FakeUtterance[] = [];
const synth = {
  speaking: false,
  pending: false,
  paused: false,
  cancelCalls: 0,
  speak(utterance: FakeUtterance) {
    spoken.push(utterance);
    this.speaking = true;
    utterance.onstart?.();
  },
  cancel() {
    this.cancelCalls += 1;
    this.speaking = false;
    this.pending = false;
  },
  resume() {},
  pause() {},
  getVoices: () => [],
};
Object.defineProperty(globalThis.window, "speechSynthesis", {
  value: synth,
  configurable: true,
});

function finishCurrentUtterance() {
  const utterance = spoken[spoken.length - 1];
  synth.speaking = false;
  utterance?.onend?.();
}

const { useBooksSpeech } = await import(
  "../src/apps/books/hooks/useBooksSpeech"
);
type SpeechResult = ReturnType<typeof useBooksSpeech>;

// Rendition stub: one "page" whose start/end CFIs resolve to the boundaries
// of a single paragraph, so the chunker yields one chunk per sentence.
function getPageTextNode(): Text {
  return document.querySelector("#page p")!.firstChild as Text;
}
const rendition = {
  currentLocation: () => ({
    start: { cfi: "cfi-start" },
    end: { cfi: "cfi-end" },
  }),
  getRange: (cfi: string) => {
    const node = getPageTextNode();
    const range = document.createRange();
    const offset = cfi === "cfi-start" ? 0 : node.data.length;
    range.setStart(node, offset);
    range.setEnd(node, offset);
    return range;
  },
};

let latest: SpeechResult | null = null;
function SpeechProbe() {
  latest = useBooksSpeech({
    getRendition: () => rendition,
    getSpeechLanguage: () => "en-US",
    getSpeechRate: () => 1,
    canAdvancePage: () => false,
    advancePage: () => {},
  });
  return null;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for condition");
}

let container: HTMLElement | null = null;
let root: Root | null = null;

beforeEach(async () => {
  document.body.innerHTML =
    '<div id="page"><p>First sentence. Second sentence.</p></div>';
  spoken.length = 0;
  synth.speaking = false;
  synth.pending = false;
  synth.cancelCalls = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(React.createElement(SpeechProbe));
  await waitFor(() => latest !== null);
});

afterEach(async () => {
  root?.unmount();
  root = null;
  container?.remove();
  container = null;
  latest = null;
  // Drain React's scheduler before happy-dom is unregistered.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

afterAll(() => {
  if (GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

describe("useBooksSpeech pause/resume", () => {
  test("pause cancels the engine and resume re-speaks the interrupted sentence", async () => {
    latest!.startSpeaking();
    await waitFor(() => spoken.length === 1);
    expect(spoken[0].text).toBe("First sentence.");
    await waitFor(() => latest!.isSpeaking);
    expect(latest!.isPaused).toBe(false);

    finishCurrentUtterance();
    await waitFor(() => spoken.length === 2);
    expect(spoken[1].text).toBe("Second sentence.");

    const cancelsBeforePause = synth.cancelCalls;
    latest!.pauseSpeaking();
    await waitFor(() => latest!.isPaused);
    expect(latest!.isSpeaking).toBe(true);
    expect(synth.cancelCalls).toBeGreaterThan(cancelsBeforePause);
    expect(spoken.length).toBe(2);

    latest!.resumeSpeaking();
    await waitFor(() => spoken.length === 3);
    expect(spoken[2].text).toBe("Second sentence.");
    await waitFor(() => !latest!.isPaused);
    expect(latest!.isSpeaking).toBe(true);

    latest!.stopSpeaking();
    await waitFor(() => !latest!.isSpeaking);
    expect(latest!.isPaused).toBe(false);
  });

  test("relocating while paused clears the pause and restarts on the visible page", async () => {
    latest!.startSpeaking();
    await waitFor(() => spoken.length === 1);

    latest!.pauseSpeaking();
    await waitFor(() => latest!.isPaused);

    // Simulate a page turn (e.g. overlay rewind/skip) while paused.
    latest!.handleRelocated();
    await waitFor(() => !latest!.isPaused);
    // Speech restarts from the freshly visible page after the settle delay.
    await waitFor(() => spoken.length === 2);
    expect(spoken[1].text).toBe("First sentence.");
    expect(latest!.isSpeaking).toBe(true);

    latest!.stopSpeaking();
    await waitFor(() => !latest!.isSpeaking);
  });

  test("pausing mid-first-sentence resumes from that sentence's start", async () => {
    latest!.startSpeaking();
    await waitFor(() => spoken.length === 1);

    latest!.pauseSpeaking();
    await waitFor(() => latest!.isPaused);

    latest!.resumeSpeaking();
    await waitFor(() => spoken.length === 2);
    expect(spoken[1].text).toBe("First sentence.");

    latest!.stopSpeaking();
    await waitFor(() => !latest!.isSpeaking);
  });
});
