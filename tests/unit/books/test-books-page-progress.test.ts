import { afterAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  isSameReadingProgress,
  rangeIntersectsVisiblePage,
  readVisiblePageCfi,
  reportedCfiOnVisiblePage,
  resolveSyncedPageProgress,
  visiblePageProbeInFrame,
} from "../../../src/apps/books/utils/booksPageProgress";

let registeredDomForSuite = false;
if (typeof document === "undefined") {
  GlobalRegistrator.register();
  registeredDomForSuite = true;
}

afterAll(() => {
  if (registeredDomForSuite && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

const SECTION_START = "epubcfi(/6/4!/4/2/1:0)";
const VISIBLE_PAGE = "epubcfi(/6/4!/4/2/1:640)";

describe("synced page progress", () => {
  test("a page flip's visible column replaces a section-start report", () => {
    const saved = resolveSyncedPageProgress({
      reportedCfi: SECTION_START,
      visibleCfi: VISIBLE_PAGE,
      reportedOnVisiblePage: false,
      reportedPercentage: 0.1,
      locationsPercentage: 0.42,
    });
    expect(saved).toEqual({ cfi: VISIBLE_PAGE, percentage: 0.42 });
  });

  test("an on-screen reported place is kept so reopen does not creep", () => {
    const saved = resolveSyncedPageProgress({
      reportedCfi: VISIBLE_PAGE,
      visibleCfi: "epubcfi(/6/4!/4/2/1:680)",
      reportedOnVisiblePage: true,
      locationsPercentage: 0.42,
    });
    expect(saved).toEqual({ cfi: VISIBLE_PAGE, percentage: 0.42 });
  });

  test("a missing location map does not wipe a known percentage", () => {
    const saved = resolveSyncedPageProgress({
      visibleCfi: VISIBLE_PAGE,
      locationsPercentage: 0,
      reportedPercentage: 0,
      seededPercentage: 0.33,
    });
    expect(saved).toEqual({ cfi: VISIBLE_PAGE, percentage: 0.33 });
  });

  test("the real start of the book may save percentage 0", () => {
    const saved = resolveSyncedPageProgress({
      reportedCfi: SECTION_START,
      reportedOnVisiblePage: true,
      locationsPercentage: 0,
      atStart: true,
      seededPercentage: 0.33,
    });
    expect(saved).toEqual({ cfi: SECTION_START, percentage: 0 });
  });

  test("returns null when neither probe nor report has a CFI", () => {
    expect(
      resolveSyncedPageProgress({ reportedPercentage: 0.5, seededPercentage: 0.5 })
    ).toBeNull();
  });

  test("identical samples do not count as a new page", () => {
    const existing = {
      cfi: VISIBLE_PAGE,
      percentage: 0.42,
      kosyncProgress: "/body/p",
    };
    expect(
      isSameReadingProgress(existing, {
        cfi: VISIBLE_PAGE,
        percentage: 0.4202,
        kosyncProgress: "/body/p",
      })
    ).toBe(true);
    expect(
      isSameReadingProgress(existing, {
        cfi: "epubcfi(/6/6!/4/2/1:0)",
        percentage: 0.5,
        kosyncProgress: "/body/p",
      })
    ).toBe(false);
    expect(isSameReadingProgress(undefined, existing)).toBe(false);
  });
});

describe("visible page probe", () => {
  const frame = { left: 100, top: 40, right: 500, bottom: 700 };

  test("LTR samples the left edge and RTL the right edge", () => {
    expect(visiblePageProbeInFrame(frame, frame, "ltr")).toEqual({
      x: 28,
      y: 28,
    });
    expect(visiblePageProbeInFrame(frame, frame, "rtl")).toEqual({
      x: 400 - 28,
      y: 28,
    });
  });

  test("returns null when the frame misses the clip", () => {
    expect(
      visiblePageProbeInFrame(
        frame,
        { left: 800, top: 40, right: 900, bottom: 700 },
        "ltr"
      )
    ).toBeNull();
  });

  test("readVisiblePageCfi uses the caret at the leading edge", () => {
    const doc = document;
    const paragraph = doc.createElement("p");
    paragraph.textContent = "Hello from the visible page";
    doc.body.append(paragraph);
    const frameEl = doc.createElement("div");
    const box = {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 600,
      width: 400,
      height: 600,
      toJSON() {
        return {};
      },
    };
    frameEl.getBoundingClientRect = () => box as DOMRect;
    const range = doc.createRange();
    range.setStart(paragraph.firstChild as Text, 6);
    range.collapse(true);
    const caret = doc.caretRangeFromPoint?.bind(doc);
    doc.caretRangeFromPoint = () => range;

    try {
      const cfi = readVisiblePageCfi({
        settings: { direction: "ltr" },
        getContents: () => [
          {
            document: doc,
            window: { frameElement: frameEl },
            cfiFromRange: () => VISIBLE_PAGE,
          },
        ],
      });
      expect(cfi).toBe(VISIBLE_PAGE);
    } finally {
      if (caret) doc.caretRangeFromPoint = caret;
      paragraph.remove();
    }
  });

  test("a section-start rect outside the clip is not the visible page", () => {
    const frameEl = document.createElement("div");
    const rect = (
      left: number,
      top: number,
      width: number,
      height: number
    ): DOMRect =>
      ({
        x: left,
        y: top,
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    frameEl.getBoundingClientRect = () => rect(-1200, 0, 400, 600);
    const range = {
      getBoundingClientRect: () => rect(0, 0, 80, 20),
      startContainer: {
        ownerDocument: { defaultView: { frameElement: frameEl } },
      },
    } as unknown as Range;

    expect(rangeIntersectsVisiblePage(range, frameEl)).toBe(false);
    expect(
      reportedCfiOnVisiblePage({ getRange: () => range }, SECTION_START)
    ).toBe(false);

    frameEl.getBoundingClientRect = () => rect(0, 0, 400, 600);
    expect(rangeIntersectsVisiblePage(range, frameEl)).toBe(true);
    expect(
      reportedCfiOnVisiblePage({ getRange: () => range }, VISIBLE_PAGE)
    ).toBe(true);
  });
});
