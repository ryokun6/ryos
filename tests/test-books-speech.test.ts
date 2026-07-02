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
  splitTextIntoSentences,
  splitTextIntoSpeechSegments,
  type SpeechRenditionLike,
} from "../src/apps/books/utils/booksSpeech";

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
