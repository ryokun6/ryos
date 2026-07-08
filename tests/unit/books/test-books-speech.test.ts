import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  BOOKS_SPEECH_ACTIVE_CLASS,
  BOOKS_SPEECH_HIGHLIGHT_BLOCK_CLASS,
  BOOKS_SPEECH_HIGHLIGHT_NAME,
  collectSpeechChunksFromRange,
  getVisiblePageRange,
  applySpeechSpokenHighlight,
  clearSpeechHighlight,
  isRangeEndOnVisiblePage,
  isRangeOnVisiblePage,
  estimateMsUntilCharIndex,
  filterChunksAfterCarryOver,
  applyCarryOverSpokenHits,
  rangeEndsAtOrBefore,
  rangeForSpokenPrefix,
  rangeForSpokenSlice,
  splitTextIntoSentences,
  splitTextIntoSpeechSegments,
  type SpeechRenditionLike,
} from "../../../src/apps/books/utils/booksSpeech";
import {
  BOOKS_SPEECH_RATE_MAX,
  BOOKS_SPEECH_RATE_MIN,
  DEFAULT_BOOKS_SETTINGS,
  normalizeBooksSpeechRate,
} from "../../../src/stores/useBooksStore";

beforeAll(() => {
  if (typeof document === "undefined") {
    GlobalRegistrator.register();
  }
});

afterAll(() => {
  if (GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

const segmentTexts = (text: string) =>
  splitTextIntoSentences(text).map((s) => text.slice(s.start, s.end));

describe("splitTextIntoSentences", () => {
  test("splits Latin sentences on terminators followed by whitespace", () => {
    expect(segmentTexts("Hello world. How are you? Fine!")).toEqual([
      "Hello world.",
      "How are you?",
      "Fine!",
    ]);
  });

  test("does not split decimals or interior periods", () => {
    expect(segmentTexts("Pi is 3.14159 exactly. Next sentence.")).toEqual([
      "Pi is 3.14159 exactly.",
      "Next sentence.",
    ]);
  });

  test("keeps closing quotes attached to the sentence", () => {
    expect(segmentTexts("\u201cStop!\u201d she said. Then silence.")).toEqual([
      "\u201cStop!\u201d",
      "she said.",
      "Then silence.",
    ]);
  });

  test("splits CJK sentences without requiring whitespace", () => {
    expect(segmentTexts("你好。今天天气很好！我们走吧？")).toEqual([
      "你好。",
      "今天天气很好！",
      "我们走吧？",
    ]);
  });

  test("groups runs of terminators", () => {
    expect(segmentTexts("What?! Really... Yes.")).toEqual([
      "What?!",
      "Really...",
      "Yes.",
    ]);
  });

  test("returns the whole text when no terminator exists", () => {
    expect(segmentTexts("A title without punctuation")).toEqual([
      "A title without punctuation",
    ]);
  });
});

describe("splitTextIntoSpeechSegments", () => {
  test("splits overlong sentences at soft breaks", () => {
    const clause = "a very long clause that keeps going";
    const text = `${clause}, ${clause}, ${clause}.`;
    const segments = splitTextIntoSpeechSegments(text, 60);
    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) {
      expect(segment.end - segment.start).toBeLessThanOrEqual(60);
    }
    // Nothing is lost: joined pieces cover the text (modulo trimmed spaces).
    const joined = segments
      .map((s) => text.slice(s.start, s.end))
      .join(" ")
      .replace(/\s+/g, " ");
    expect(joined).toBe(text.replace(/\s+/g, " "));
  });

  test("keeps short sentences intact", () => {
    const segments = splitTextIntoSpeechSegments("Short one. Short two.");
    expect(segments.length).toBe(2);
  });
});

// Uses the registered global document: happy-dom's Range implementation
// mis-tracks boundaries on detached documents from createHTMLDocument.
function createBookDocument(bodyHtml: string): Document {
  document.body.innerHTML = bodyHtml;
  return document;
}

function rangeOver(doc: Document): Range {
  const range = doc.createRange();
  range.setStart(doc.body, 0);
  range.setEnd(doc.body, doc.body.childNodes.length);
  return range;
}

class FakeHighlight extends Set<AbstractRange> implements Highlight {
  priority = 0;
  type: HighlightType = "highlight";
  addCalls = 0;
  deleteCalls = 0;

  constructor(...ranges: AbstractRange[]) {
    super();
    for (const range of ranges) super.add(range);
  }

  override add(range: AbstractRange): this {
    this.addCalls += 1;
    return super.add(range);
  }

  override delete(range: AbstractRange): boolean {
    this.deleteCalls += 1;
    return super.delete(range);
  }
}

class TrackingHighlightRegistry extends Map<string, Highlight> {
  setCalls = 0;

  override set(name: string, highlight: Highlight): this {
    this.setCalls += 1;
    return super.set(name, highlight);
  }
}

function installFakeHighlightApi(): {
  registry: TrackingHighlightRegistry;
  restore: () => void;
} {
  const win = document.defaultView;
  if (!win) throw new Error("Book test document has no window");

  const originalHighlight = Object.getOwnPropertyDescriptor(win, "Highlight");
  const originalCss = Object.getOwnPropertyDescriptor(win, "CSS");
  const registry = new TrackingHighlightRegistry();
  Object.defineProperty(win, "Highlight", {
    configurable: true,
    value: FakeHighlight,
  });
  Object.defineProperty(win, "CSS", {
    configurable: true,
    value: { highlights: registry },
  });

  return {
    registry,
    restore: () => {
      if (originalHighlight) {
        Object.defineProperty(win, "Highlight", originalHighlight);
      } else {
        Reflect.deleteProperty(win, "Highlight");
      }
      if (originalCss) {
        Object.defineProperty(win, "CSS", originalCss);
      } else {
        Reflect.deleteProperty(win, "CSS");
      }
    },
  };
}

describe("collectSpeechChunksFromRange", () => {
  test("collects sentence chunks per paragraph with ranges", () => {
    const doc = createBookDocument(
      "<p>First sentence. Second sentence.</p><p>Another paragraph.</p>"
    );
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    expect(chunks.map((c) => c.text)).toEqual([
      "First sentence.",
      "Second sentence.",
      "Another paragraph.",
    ]);
    expect(chunks[0].range.toString()).toBe("First sentence.");
    expect(chunks[1].range.toString()).toBe("Second sentence.");
  });

  test("keeps sentences spanning inline elements whole", () => {
    const doc = createBookDocument(
      "<p>He said <em>hello there</em> to me. Done.</p>"
    );
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    expect(chunks.map((c) => c.text)).toEqual([
      "He said hello there to me.",
      "Done.",
    ]);
    expect(chunks[0].range.toString()).toBe("He said hello there to me.");
  });

  test("does not merge separate paragraphs into one sentence", () => {
    const doc = createBookDocument(
      "<h1>Chapter One</h1><p>It begins here</p>"
    );
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    expect(chunks.map((c) => c.text)).toEqual([
      "Chapter One",
      "It begins here",
    ]);
  });

  test("respects partial page boundaries inside a paragraph", () => {
    const doc = createBookDocument("<p>Alpha beta. Gamma delta.</p>");
    const textNode = doc.querySelector("p")!.firstChild as Text;
    const range = doc.createRange();
    // Start mid-paragraph, as a page boundary would.
    range.setStart(textNode, "Alpha beta. ".length);
    range.setEnd(textNode, textNode.data.length);
    const chunks = collectSpeechChunksFromRange(range);
    expect(chunks.map((c) => c.text)).toEqual(["Gamma delta."]);
  });

  test("skips scripts, styles, and hidden content", () => {
    const doc = createBookDocument(
      "<p>Visible text.</p><style>p { color: red; }</style>" +
        "<script>var x = 1;</script><p aria-hidden='true'>Hidden note.</p>"
    );
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    expect(chunks.map((c) => c.text)).toEqual(["Visible text."]);
  });

  test("treats <br> as a line break in verse", () => {
    const doc = createBookDocument("<p>Line one<br>Line two</p>");
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    expect(chunks.map((c) => c.text)).toEqual(["Line one", "Line two"]);
  });

  test("normalizes whitespace in spoken text", () => {
    const doc = createBookDocument("<p>Spaced   \n   out. </p>");
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    expect(chunks.map((c) => c.text)).toEqual(["Spaced out."]);
  });
});

describe("sentences cut off by the page boundary", () => {
  test("extends a cut sentence to its end and marks the page cut index", () => {
    const doc = createBookDocument(
      "<p>Alpha beta. Gamma delta epsilon zeta. Eta theta.</p>"
    );
    const textNode = doc.querySelector("p")!.firstChild as Text;
    const range = doc.createRange();
    range.setStart(textNode, 0);
    // Page ends mid-way through the second sentence.
    range.setEnd(textNode, "Alpha beta. Gamma delta".length);
    const chunks = collectSpeechChunksFromRange(range);
    expect(chunks.map((c) => c.text)).toEqual([
      "Alpha beta.",
      "Gamma delta epsilon zeta.",
    ]);
    expect(chunks[0].pageEndCutIndex).toBeUndefined();
    // The cut falls right after "Gamma delta" within the extended sentence.
    expect(chunks[1].pageEndCutIndex).toBe("Gamma delta".length);
    expect(chunks[1].range.toString()).toBe("Gamma delta epsilon zeta.");
  });

  test("does not extend when the page ends at a sentence boundary", () => {
    const doc = createBookDocument("<p>Alpha beta. Gamma delta.</p>");
    const textNode = doc.querySelector("p")!.firstChild as Text;
    const range = doc.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, "Alpha beta. ".length);
    const chunks = collectSpeechChunksFromRange(range);
    expect(chunks.map((c) => c.text)).toEqual(["Alpha beta."]);
    expect(chunks[0].pageEndCutIndex).toBeUndefined();
  });

  test("extends a cut sentence across inline elements", () => {
    const doc = createBookDocument(
      "<p>He said <em>hello there</em> to me. Done.</p>"
    );
    const firstText = doc.querySelector("p")!.firstChild as Text;
    const range = doc.createRange();
    range.setStart(firstText, 0);
    // Page ends inside the first word run, mid-sentence.
    range.setEnd(firstText, "He sa".length);
    const chunks = collectSpeechChunksFromRange(range);
    expect(chunks.map((c) => c.text)).toEqual(["He said hello there to me."]);
    expect(chunks[0].pageEndCutIndex).toBe("He sa".length);
  });

  test("does not extend past the cut paragraph into the next block", () => {
    const doc = createBookDocument(
      "<p>An unterminated fragment</p><p>Next paragraph.</p>"
    );
    const firstText = doc.querySelector("p")!.firstChild as Text;
    const range = doc.createRange();
    range.setStart(firstText, 0);
    range.setEnd(firstText, "An untermi".length);
    const chunks = collectSpeechChunksFromRange(range);
    // The fragment finishes its own block but never leaks into the next <p>.
    expect(chunks.map((c) => c.text)).toEqual(["An unterminated fragment"]);
    expect(chunks[0].pageEndCutIndex).toBe("An untermi".length);
  });

  test("stops the extension at a <br> line break", () => {
    const doc = createBookDocument("<p>Line one more<br>Line two</p>");
    const firstText = doc.querySelector("p")!.firstChild as Text;
    const range = doc.createRange();
    range.setStart(firstText, 0);
    range.setEnd(firstText, "Line one".length);
    const chunks = collectSpeechChunksFromRange(range);
    expect(chunks.map((c) => c.text)).toEqual(["Line one more"]);
    expect(chunks[0].pageEndCutIndex).toBe("Line one".length);
  });


  test("extends a cut Chinese sentence and marks the page cut index", () => {
    const doc = createBookDocument(
      "<p>甲乙丙。丁戊己庚辛壬癸。子丑寅。</p>"
    );
    const textNode = doc.querySelector("p")!.firstChild as Text;
    const range = doc.createRange();
    range.setStart(textNode, 0);
    // Page ends mid-way through the second sentence (no spaces in CJK).
    range.setEnd(textNode, "甲乙丙。丁戊己".length);
    const chunks = collectSpeechChunksFromRange(range);
    expect(chunks.map((c) => c.text)).toEqual([
      "甲乙丙。",
      "丁戊己庚辛壬癸。",
    ]);
    expect(chunks[0].pageEndCutIndex).toBeUndefined();
    expect(chunks[1].pageEndCutIndex).toBe("丁戊己".length);
  });

  test("mid-paragraph page start plus cut sentence keeps offsets aligned", () => {
    const doc = createBookDocument(
      "<p>Alpha beta. Gamma delta epsilon. Eta theta.</p>"
    );
    const textNode = doc.querySelector("p")!.firstChild as Text;
    const range = doc.createRange();
    // Page starts mid-paragraph and ends mid-sentence.
    range.setStart(textNode, "Alpha beta. ".length);
    range.setEnd(textNode, "Alpha beta. Gamma delta".length);
    const chunks = collectSpeechChunksFromRange(range);
    expect(chunks.map((c) => c.text)).toEqual(["Gamma delta epsilon."]);
    expect(chunks[0].pageEndCutIndex).toBe("Gamma delta".length);
    expect(chunks[0].range.toString()).toBe("Gamma delta epsilon.");
  });
});

describe("rangeEndsAtOrBefore", () => {
  test("identifies chunks already spoken before the carry-over point", () => {
    const doc = createBookDocument("<p>Alpha beta. Gamma delta.</p>");
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    expect(chunks.length).toBe(2);
    const carryOver = {
      endContainer: chunks[0].range.endContainer,
      endOffset: chunks[0].range.endOffset,
      spokenText: chunks[0].text,
    };
    expect(rangeEndsAtOrBefore(chunks[0].range, carryOver)).toBe(true);
    expect(rangeEndsAtOrBefore(chunks[1].range, carryOver)).toBe(false);
  });

  test("is lenient across documents", () => {
    const doc = createBookDocument("<p>Alpha beta.</p>");
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    const detached = doc.implementation.createHTMLDocument("other");
    detached.body.innerHTML = "<p>Other doc.</p>";
    const carryOver = {
      endContainer: detached.querySelector("p")!.firstChild as Node,
      endOffset: 5,
      spokenText: "Other doc.",
    };
    expect(rangeEndsAtOrBefore(chunks[0].range, carryOver)).toBe(false);
  });
});

describe("filterChunksAfterCarryOver", () => {
  test("skips the spoken sentence and its page-tail by text identity", () => {
    const doc = createBookDocument(
      "<p>Alpha beta. Gamma delta epsilon zeta. Eta theta.</p>"
    );
    const full = collectSpeechChunksFromRange(rangeOver(doc));
    expect(full.map((chunk) => chunk.text)).toEqual([
      "Alpha beta.",
      "Gamma delta epsilon zeta.",
      "Eta theta.",
    ]);
    const spoken = full[1];
    const cutIndex = "Gamma delta".length;
    // Page 2 would still see the cut sentence (range overshoot / re-render)
    // plus the next sentence.
    const pageTwo = full.slice(1);
    const filtered = filterChunksAfterCarryOver(pageTwo, {
      endContainer: spoken.range.endContainer,
      endOffset: spoken.range.endOffset,
      spokenText: spoken.text,
      pageEndCutIndex: cutIndex,
    });
    expect(filtered.map((chunk) => chunk.text)).toEqual(["Eta theta."]);
  });

  test("still skips already-spoken text when carry-over nodes are detached", () => {
    const doc = createBookDocument(
      "<p>Alpha beta. Gamma delta epsilon zeta. Eta theta.</p>"
    );
    const full = collectSpeechChunksFromRange(rangeOver(doc));
    const spoken = full[1];
    const carryOver = {
      endContainer: spoken.range.endContainer,
      endOffset: spoken.range.endOffset,
      spokenText: spoken.text,
      pageEndCutIndex: "Gamma delta".length,
    };
    // Simulate epub.js replacing the section DOM on the page turn.
    doc.body.innerHTML =
      "<p>Alpha beta. Gamma delta epsilon zeta. Eta theta.</p>";
    expect(carryOver.endContainer.isConnected).toBe(false);
    const pageTwo = collectSpeechChunksFromRange(rangeOver(doc)).slice(1);
    // DOM comparison alone fails open on detached nodes.
    expect(
      pageTwo.some((chunk) => rangeEndsAtOrBefore(chunk.range, carryOver))
    ).toBe(false);
    const filtered = filterChunksAfterCarryOver(pageTwo, carryOver);
    expect(filtered.map((chunk) => chunk.text)).toEqual(["Eta theta."]);
  });

  test("skips a page-lead fragment that matches the spoken remainder", () => {
    const doc = createBookDocument(
      "<p>Alpha beta. Gamma delta epsilon zeta. Eta theta.</p>"
    );
    const node = doc.querySelector("p")!.firstChild as Text;
    const cut = "Alpha beta. Gamma delta".length;
    const pageTwoRange = doc.createRange();
    pageTwoRange.setStart(node, cut);
    pageTwoRange.setEnd(node, node.data.length);
    const pageTwo = collectSpeechChunksFromRange(pageTwoRange);
    expect(pageTwo.map((chunk) => chunk.text)).toEqual([
      "epsilon zeta.",
      "Eta theta.",
    ]);
    const spokenText = "Gamma delta epsilon zeta.";
    // Detached endpoints from the previous view.
    const detached = doc.implementation.createHTMLDocument("prev");
    detached.body.innerHTML = `<p>${spokenText}</p>`;
    const spokenNode = detached.querySelector("p")!.firstChild as Text;
    const filtered = filterChunksAfterCarryOver(pageTwo, {
      endContainer: spokenNode,
      endOffset: spokenNode.data.length,
      spokenText,
      pageEndCutIndex: "Gamma delta".length,
    });
    expect(filtered.map((chunk) => chunk.text)).toEqual(["Eta theta."]);
  });

  test("skips a Chinese page-lead fragment without relying on spaces", () => {
    const doc = createBookDocument(
      "<p>甲乙丙。丁戊己庚辛壬癸。子丑寅。</p>"
    );
    const node = doc.querySelector("p")!.firstChild as Text;
    const cut = "甲乙丙。丁戊己".length;
    const pageTwoRange = doc.createRange();
    pageTwoRange.setStart(node, cut);
    pageTwoRange.setEnd(node, node.data.length);
    const pageTwo = collectSpeechChunksFromRange(pageTwoRange);
    expect(pageTwo.map((chunk) => chunk.text)).toEqual([
      "庚辛壬癸。",
      "子丑寅。",
    ]);
    const spokenText = "丁戊己庚辛壬癸。";
    const detached = doc.implementation.createHTMLDocument("prev");
    detached.body.innerHTML = `<p>${spokenText}</p>`;
    const spokenNode = detached.querySelector("p")!.firstChild as Text;
    const filtered = filterChunksAfterCarryOver(pageTwo, {
      endContainer: spokenNode,
      endOffset: spokenNode.data.length,
      spokenText,
      pageEndCutIndex: "丁戊己".length,
    });
    expect(filtered.map((chunk) => chunk.text)).toEqual(["子丑寅。"]);
  });
});

describe("applyCarryOverSpokenHits", () => {
  test("keeps later sentences only and carries the page-lead remainder for highlight", () => {
    const doc = createBookDocument(
      "<p>Alpha beta. Gamma delta epsilon zeta. Eta theta.</p>"
    );
    const node = doc.querySelector("p")!.firstChild as Text;
    const cut = "Alpha beta. Gamma delta".length;
    const pageTwoRange = doc.createRange();
    pageTwoRange.setStart(node, cut);
    pageTwoRange.setEnd(node, node.data.length);
    const pageTwo = collectSpeechChunksFromRange(pageTwoRange);
    const spokenText = "Gamma delta epsilon zeta.";
    const detached = doc.implementation.createHTMLDocument("prev");
    detached.body.innerHTML = `<p>${spokenText}</p>`;
    const spokenNode = detached.querySelector("p")!.firstChild as Text;
    const { kept, prelit, carryTails } = applyCarryOverSpokenHits(pageTwo, {
      endContainer: spokenNode,
      endOffset: spokenNode.data.length,
      spokenText,
      pageEndCutIndex: "Gamma delta".length,
    });
    expect(kept.map((chunk) => chunk.text)).toEqual(["Eta theta."]);
    expect(carryTails.map((chunk) => chunk.text)).toEqual(["epsilon zeta."]);
    expect(prelit).toHaveLength(0);
    // Remainder is highlight-only — never in the speak list.
    expect(kept.some((chunk) => chunk.text.includes("epsilon"))).toBe(false);
  });

  test("splits a full cut sentence into prelit prefix and carry-tail suffix", () => {
    const doc = createBookDocument(
      "<p>Gamma delta epsilon zeta. Eta theta.</p>"
    );
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    const spoken = chunks[0];
    const cutIndex = "Gamma delta".length;
    const { kept, prelit, carryTails } = applyCarryOverSpokenHits(chunks, {
      endContainer: spoken.range.endContainer,
      endOffset: spoken.range.endOffset,
      spokenText: spoken.text,
      pageEndCutIndex: cutIndex,
    });
    expect(kept.map((chunk) => chunk.text)).toEqual(["Eta theta."]);
    expect(carryTails).toHaveLength(1);
    expect(carryTails[0].text).toBe("epsilon zeta.");
    expect(prelit).toHaveLength(1);
    expect(prelit[0].toString().replace(/\s+/g, " ").trim()).toBe("Gamma delta");
  });
});

describe("rangeForSpokenSlice", () => {
  test("builds a DOM range for a mid-chunk slice", () => {
    const doc = createBookDocument("<p>Gamma delta epsilon zeta.</p>");
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    const slice = rangeForSpokenSlice(
      chunks[0].range,
      "Gamma delta".length,
      chunks[0].text.length,
      chunks[0].text.length
    );
    expect(slice).not.toBeNull();
    expect(slice!.toString().replace(/\s+/g, " ").trim()).toBe("epsilon zeta.");
  });
});

describe("estimateMsUntilCharIndex", () => {
  test("estimates longer delays for CJK than for Latin at the same length", () => {
    const latin = estimateMsUntilCharIndex(6, "abcdef", 1);
    const cjk = estimateMsUntilCharIndex(6, "甲乙丙丁戊己", 1);
    expect(cjk).toBeGreaterThan(latin);
    expect(latin).toBeGreaterThan(0);
  });

  test("scales inversely with speech rate", () => {
    const slow = estimateMsUntilCharIndex(4, "丁戊己庚", 0.5);
    const normal = estimateMsUntilCharIndex(4, "丁戊己庚", 1);
    expect(slow).toBeGreaterThan(normal);
  });
});

describe("isRangeEndOnVisiblePage", () => {
  test("is lenient outside an iframe (no layout geometry)", () => {
    const doc = createBookDocument("<p>Alpha beta.</p>");
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    expect(isRangeEndOnVisiblePage(chunks[0].range)).toBe(true);
  });
});

describe("getVisiblePageRange", () => {
  test("builds a range spanning the start and end CFIs", () => {
    const doc = createBookDocument("<p>One two three four five.</p>");
    const textNode = doc.querySelector("p")!.firstChild as Text;
    const startRange = doc.createRange();
    startRange.setStart(textNode, 4);
    startRange.collapse(true);
    const endRange = doc.createRange();
    endRange.setStart(textNode, 13);
    endRange.collapse(true);

    const rendition: SpeechRenditionLike = {
      currentLocation: () => ({
        start: { cfi: "epubcfi(start)" },
        end: { cfi: "epubcfi(end)" },
      }),
      getRange: (cfi: string) =>
        cfi === "epubcfi(start)" ? startRange : endRange,
    };

    const range = getVisiblePageRange(rendition);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe("two three");
  });

  test("falls back to end of section when no end CFI resolves", () => {
    const doc = createBookDocument("<p>Alpha beta.</p>");
    const textNode = doc.querySelector("p")!.firstChild as Text;
    const startRange = doc.createRange();
    startRange.setStart(textNode, 0);
    startRange.collapse(true);

    const rendition: SpeechRenditionLike = {
      currentLocation: () => ({ start: { cfi: "epubcfi(start)" } }),
      getRange: () => startRange,
    };

    const range = getVisiblePageRange(rendition);
    expect(range).not.toBeNull();
    expect(range!.toString()).toContain("Alpha beta.");
  });

  test("returns null when there is no location", () => {
    const rendition: SpeechRenditionLike = {
      currentLocation: () => null,
      getRange: () => null,
    };
    expect(getVisiblePageRange(rendition)).toBeNull();
  });
});

describe("normalizeBooksSpeechRate", () => {
  test("defaults to normal speed", () => {
    expect(DEFAULT_BOOKS_SETTINGS.speechRate).toBe(1);
  });

  test("passes through valid rates", () => {
    expect(normalizeBooksSpeechRate(0.8)).toBe(0.8);
    expect(normalizeBooksSpeechRate(1)).toBe(1);
    expect(normalizeBooksSpeechRate(1.5)).toBe(1.5);
    expect(normalizeBooksSpeechRate(BOOKS_SPEECH_RATE_MIN)).toBe(
      BOOKS_SPEECH_RATE_MIN
    );
    expect(normalizeBooksSpeechRate(BOOKS_SPEECH_RATE_MAX)).toBe(
      BOOKS_SPEECH_RATE_MAX
    );
  });

  test("coerces missing/invalid rates to the default (normal)", () => {
    // Pre-v5 persisted settings lack speechRate entirely; assigning a
    // non-finite rate to SpeechSynthesisUtterance throws in Chrome.
    expect(normalizeBooksSpeechRate(undefined)).toBe(1);
    expect(normalizeBooksSpeechRate(null)).toBe(1);
    expect(normalizeBooksSpeechRate(Number.NaN)).toBe(1);
    expect(normalizeBooksSpeechRate("1.2")).toBe(1);
    expect(normalizeBooksSpeechRate(0)).toBe(1);
    expect(normalizeBooksSpeechRate(99)).toBe(1);
  });
});

describe("isRangeOnVisiblePage", () => {
  test("is lenient outside an iframe (no layout geometry)", () => {
    const doc = createBookDocument("<p>Alpha beta.</p>");
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    expect(chunks.length).toBeGreaterThan(0);
    // happy-dom documents aren't framed; the filter must not drop chunks.
    expect(isRangeOnVisiblePage(chunks[0].range)).toBe(true);
  });
});

describe("rangeForSpokenPrefix", () => {
  test("maps a normalized char index to a DOM prefix range", () => {
    const doc = createBookDocument("<p>Hello world. Next.</p>");
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    const prefix = rangeForSpokenPrefix(
      chunks[0].range,
      5,
      chunks[0].text.length
    );
    expect(prefix).not.toBeNull();
    expect(prefix!.toString()).toBe("Hello");
  });

  test("collapses whitespace the same way as chunk text", () => {
    const doc = createBookDocument("<p>Spaced   out.</p>");
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    expect(chunks[0].text).toBe("Spaced out.");
    const prefix = rangeForSpokenPrefix(
      chunks[0].range,
      "Spaced out".length,
      chunks[0].text.length
    );
    expect(prefix).not.toBeNull();
    expect(prefix!.toString().replace(/\s+/g, " ").trim()).toBe("Spaced out");
  });

  test("returns the full chunk range at text length", () => {
    const doc = createBookDocument("<p>Hello world.</p>");
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    const prefix = rangeForSpokenPrefix(
      chunks[0].range,
      chunks[0].text.length,
      chunks[0].text.length
    );
    expect(prefix).not.toBeNull();
    expect(prefix!.toString()).toBe(chunks[0].range.toString());
  });

  test("returns null before any character is spoken", () => {
    const doc = createBookDocument("<p>Hello world.</p>");
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    expect(rangeForSpokenPrefix(chunks[0].range, 0)).toBeNull();
  });
});

describe("speech highlight", () => {
  test("mutates the registered Highlight so WebKit repaints progress", () => {
    const { registry, restore } = installFakeHighlightApi();
    const doc = createBookDocument("<p>Hello world.</p>");
    try {
      const chunks = collectSpeechChunksFromRange(rangeOver(doc));
      applySpeechSpokenHighlight(chunks, 0, 5);

      const highlight = registry.get(BOOKS_SPEECH_HIGHLIGHT_NAME);
      expect(highlight).toBeInstanceOf(FakeHighlight);
      if (!(highlight instanceof FakeHighlight)) {
        throw new Error("Expected the fake Highlight instance");
      }
      expect(registry.setCalls).toBe(1);
      expect(Array.from(highlight)).toHaveLength(1);
      expect(Array.from(highlight)[0]?.endOffset).toBe(5);

      applySpeechSpokenHighlight(chunks, 0, 11);

      expect(registry.setCalls).toBe(1);
      expect(registry.get(BOOKS_SPEECH_HIGHLIGHT_NAME)).toBe(highlight);
      expect(Array.from(highlight)).toHaveLength(1);
      expect(Array.from(highlight)[0]?.endOffset).toBe(11);
      expect(highlight.addCalls).toBe(1);
      expect(highlight.deleteCalls).toBe(1);
    } finally {
      clearSpeechHighlight(doc);
      restore();
    }
  });

  test("dims the page and lights spoken blocks without the Highlight API", () => {
    const doc = createBookDocument("<p>First sentence. Second sentence.</p>");
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    applySpeechSpokenHighlight(chunks, 0, chunks[0].text.length);
    expect(
      doc.documentElement.classList.contains(BOOKS_SPEECH_ACTIVE_CLASS)
    ).toBe(true);
    const paragraph = doc.querySelector("p")!;
    expect(
      paragraph.classList.contains(BOOKS_SPEECH_HIGHLIGHT_BLOCK_CLASS)
    ).toBe(true);

    clearSpeechHighlight(doc);
    expect(
      doc.documentElement.classList.contains(BOOKS_SPEECH_ACTIVE_CLASS)
    ).toBe(false);
    expect(
      paragraph.classList.contains(BOOKS_SPEECH_HIGHLIGHT_BLOCK_CLASS)
    ).toBe(false);
  });

  test("does not light the current sentence before any chars are spoken", () => {
    const doc = createBookDocument("<p>First sentence. Second sentence.</p>");
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    applySpeechSpokenHighlight(chunks, 0, 0);
    expect(
      doc.documentElement.classList.contains(BOOKS_SPEECH_ACTIVE_CLASS)
    ).toBe(true);
    expect(
      doc.querySelector("p")!.classList.contains(BOOKS_SPEECH_HIGHLIGHT_BLOCK_CLASS)
    ).toBe(false);
  });

  test("lights prior sentences fully when progressive speak advances", () => {
    const doc = createBookDocument(
      "<p>First sentence.</p><p>Second sentence.</p>"
    );
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    applySpeechSpokenHighlight(chunks, 1, 3);
    const paragraphs = doc.querySelectorAll("p");
    expect(
      paragraphs[0].classList.contains(BOOKS_SPEECH_HIGHLIGHT_BLOCK_CLASS)
    ).toBe(true);
    expect(
      paragraphs[1].classList.contains(BOOKS_SPEECH_HIGHLIGHT_BLOCK_CLASS)
    ).toBe(true);
  });
});
