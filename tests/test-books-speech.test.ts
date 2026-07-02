import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  BOOKS_SPEECH_HIGHLIGHT_BLOCK_CLASS,
  collectSpeechChunksFromRange,
  getVisiblePageRange,
  applySpeechHighlight,
  clearSpeechHighlight,
  isRangeEndOnVisiblePage,
  isRangeOnVisiblePage,
  rangeEndsAtOrBefore,
  splitTextIntoSentences,
  splitTextIntoSpeechSegments,
  type SpeechRenditionLike,
} from "../src/apps/books/utils/booksSpeech";
import {
  BOOKS_SPEECH_RATE_MAX,
  BOOKS_SPEECH_RATE_MIN,
  DEFAULT_BOOKS_SETTINGS,
  normalizeBooksSpeechRate,
} from "../src/stores/useBooksStore";

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
    };
    expect(rangeEndsAtOrBefore(chunks[0].range, carryOver)).toBe(false);
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

describe("speech highlight", () => {
  test("falls back to block-class highlight without the Highlight API", () => {
    const doc = createBookDocument("<p>First sentence. Second sentence.</p>");
    const chunks = collectSpeechChunksFromRange(rangeOver(doc));
    applySpeechHighlight(chunks[0].range);
    const paragraph = doc.querySelector("p")!;
    expect(
      paragraph.classList.contains(BOOKS_SPEECH_HIGHLIGHT_BLOCK_CLASS)
    ).toBe(true);

    clearSpeechHighlight(doc);
    expect(
      paragraph.classList.contains(BOOKS_SPEECH_HIGHLIGHT_BLOCK_CLASS)
    ).toBe(false);
  });
});
