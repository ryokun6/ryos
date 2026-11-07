import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { JournalLogic } from "../../../src/apps/journal/hooks/useJournalLogic";
import type { JournalDoc, JournalScrap, JournalState } from "../../../src/apps/journal/types";
import { installHappyDom, uninstallHappyDom } from "../../helpers/register-happy-dom";

const installedHappyDom = installHappyDom();

class FakeGainNode {
  gain = {
    value: 1,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
  };
  context = { state: "running" };
  connect() {}
  disconnect() {}
}

class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  onstatechange: (() => void) | null = null;
  createGain() {
    return new FakeGainNode();
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

const originalAudioContext = window.AudioContext;
const originalAnimate = Element.prototype.animate;
window.AudioContext = FakeAudioContext as unknown as typeof AudioContext;

const finishedAnimation = Promise.resolve();
Element.prototype.animate = () =>
  ({
    cancel() {},
    finish() {},
    play() {},
    pause() {},
    reverse() {},
    persist() {},
    commitStyles() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
    finished: finishedAnimation,
    ready: finishedAnimation,
    playState: "finished",
    pending: false,
    currentTime: 0,
    startTime: 0,
    playbackRate: 1,
    effect: null,
    timeline: null,
    id: "",
    onfinish: null,
    oncancel: null,
    onremove: null,
    replaceState: "active",
    updatePlaybackRate() {},
  }) as unknown as Animation;

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
});

const i18n = i18next.createInstance();

const { FreeformCanvas, CANVAS_TEXT_DOUBLE_CLICK_MS } = await import(
  "../../../src/apps/journal/components/FreeformCanvas"
);
const { createInitialJournalState, plainTextFromDoc } = await import(
  "../../../src/apps/journal/logic"
);
const { JOURNAL_FRAGMENTS, journalText } = await import(
  "../../../src/apps/journal/sampleContent"
);
const { getActiveIpodCurrentSongId, useIpodStore } = await import(
  "../../../src/stores/useIpodStore"
);

const noteFragment = JOURNAL_FRAGMENTS.find((item) => item.kind === "text" && item.text);
const photoFragment = JOURNAL_FRAGMENTS.find((item) => item.kind === "photo" && item.photo);
if (!noteFragment?.text || !photoFragment) {
  throw new Error("journal sample is missing a text card and a photo card");
}
const noteText = journalText(noteFragment.text, "en");

const songScrap: JournalScrap = {
  id: "scrap-song",
  pageId: "2026-11-01",
  kind: "song",
  photo: null,
  songId: "scrap-song",
  songTitle: "Same Song",
  songArtist: "Ryo",
  songCover: null,
  canvasPageId: "board",
  x: 70,
  y: 8,
  w: 24,
  rotate: 0,
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    resources: {
      en: {
        translation: {
          apps: {
            journal: {
              photo: { alt: "Sample photo" },
              toolbar: {
                emptyNote: "Note",
                write: "Write something...",
                addSong: "Add Song",
                tools: "Page Tools",
                previous: "Previous Page",
                next: "Next Page",
                newPage: "New Page",
                page: "Page {{count}}",
                addNote: "Add Note",
                addImage: "Add Image",
                delete: "Delete",
                noSongs: "No Songs",
              },
            },
          },
        },
      },
    },
    interpolation: { escapeValue: false },
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  const ipod = useIpodStore.getState();
  ipod.setLibrarySource("youtube");
  ipod.setIsPlaying(false);
  ipod.setCurrentSongId(null);
  ipod.setAppleMusicCurrentSongId(null);
  const { settleAllPersistWrites } = await import(
    "../../../src/utils/persistWriteQueue"
  );
  await settleAllPersistWrites();
});

afterAll(async () => {
  window.AudioContext = originalAudioContext;
  Element.prototype.animate = originalAnimate;
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  await uninstallHappyDom(installedHappyDom);
});

function harness(journal: JournalState = createInitialJournalState()) {
  const opened: string[] = [];
  const selected: Array<string | null> = [];
  const saved: Array<{ id: string; text: string }> = [];
  const moved: string[] = [];
  const logic = {
    t: i18n.t.bind(i18n),
    language: "en",
    journal,
    api: {
      selectCard: (id: string | null) => {
        selected.push(id);
      },
      setEntryText: (id: string, doc: JournalDoc) => {
        saved.push({ id, text: plainTextFromDoc(doc) });
      },
      selectCanvasPage: () => {},
      addCanvasPage: () => {},
      addScrap: () => {},
      removeCard: () => {},
      moveCard: () => {},
    },
  } as JournalLogic;
  return { opened, selected, saved, moved, logic };
}

async function renderCanvas(
  props: {
    journal?: JournalState;
    scraps?: JournalScrap[];
  } = {}
) {
  const state = harness(props.journal);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      React.createElement(
        I18nextProvider,
        { i18n },
        React.createElement(FreeformCanvas, {
          l: state.logic,
          positions: {},
          texts: state.logic.journal.texts,
          scraps: props.scraps ?? state.logic.journal.scraps,
          showDates: false,
          interactive: true,
          activePageId: "2026-11-01",
          onMove: (id) => {
            state.moved.push(id);
          },
          onOpenDay: (pageId) => {
            state.opened.push(pageId);
          },
        })
      )
    );
  });
  return state;
}

function cardWithText(text: string): HTMLElement {
  const card = [...(container?.querySelectorAll("article") ?? [])].find((article) =>
    article.textContent?.includes(text)
  );
  if (!card) throw new Error(`missing card: ${text}`);
  return card;
}

async function clickCard(card: HTMLElement, x = 12, y = 12) {
  await act(async () => {
    card.dispatchEvent(pointer("pointerdown", x, y));
    card.dispatchEvent(pointer("pointerup", x, y));
  });
}

function pointer(type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: "mouse",
  });
}

async function waitPastDoubleClick() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, CANVAS_TEXT_DOUBLE_CLICK_MS + 40));
  });
}

describe("freeform canvas card editing", () => {
  test("an empty text card shows the writing placeholder", async () => {
    await renderCanvas({
      scraps: [
        {
          ...songScrap,
          id: "empty-note",
          kind: "text",
          songId: null,
          songTitle: null,
          songArtist: null,
        },
      ],
    });
    const placeholder = container?.querySelector(
      '[data-journal-card="empty-note"] [data-journal-placeholder]'
    );
    expect(placeholder?.textContent).toBe("Write something...");
  });

  test("a selected text card keeps its ring on the board", async () => {
    const journal = createInitialJournalState();
    journal.selectedCardId = noteFragment.id;
    await renderCanvas({ journal });
    const card = container?.querySelector(`[data-journal-card="${noteFragment.id}"]`);
    expect(card?.className).toContain("ring-2");
  });

  test("a single click on a text card still opens its day", async () => {
    const state = await renderCanvas();
    const card = cardWithText(noteText);
    await clickCard(card);
    expect(state.selected).toEqual([noteFragment.id]);
    expect(state.opened).toEqual([]);
    expect(container?.querySelector("textarea")).toBeNull();
    await waitPastDoubleClick();
    expect(state.opened).toEqual([noteFragment.dayId]);
    expect(container?.querySelector("textarea")).toBeNull();
  });

  test("a double click edits the card text and does not open the day", async () => {
    const state = await renderCanvas();
    const card = cardWithText(noteText);
    await clickCard(card);
    await clickCard(card);
    const editor = container?.querySelector("textarea");
    expect(editor).toBeInstanceOf(HTMLTextAreaElement);
    expect(editor?.value).toBe(noteText);
    expect(state.opened).toEqual([]);
    await waitPastDoubleClick();
    expect(state.opened).toEqual([]);
    expect(state.selected).toEqual([noteFragment.id, noteFragment.id]);
  });

  test("blurring the editor saves the text and Escape discards it", async () => {
    const state = await renderCanvas();
    const card = cardWithText(noteText);
    await clickCard(card);
    await clickCard(card);
    const editor = container?.querySelector("textarea");
    if (!(editor instanceof HTMLTextAreaElement)) throw new Error("editor missing");
    editor.value = "Kept this fragment";
    await act(async () => {
      editor.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
      editor.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(state.saved).toEqual([{ id: noteFragment.id, text: "Kept this fragment" }]);

    const again = cardWithText(noteText);
    await clickCard(again);
    await clickCard(again);
    const next = container?.querySelector("textarea");
    if (!(next instanceof HTMLTextAreaElement)) throw new Error("editor missing");
    next.value = "Discarded";
    await act(async () => {
      next.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
    });
    expect(state.saved).toEqual([{ id: noteFragment.id, text: "Kept this fragment" }]);
    expect(container?.querySelector("textarea")).toBeNull();
  });

  test("Enter saves the edit", async () => {
    const state = await renderCanvas();
    const card = cardWithText(noteText);
    await clickCard(card);
    await clickCard(card);
    const editor = container?.querySelector("textarea");
    if (!(editor instanceof HTMLTextAreaElement)) throw new Error("editor missing");
    editor.value = "A shorter note";
    await act(async () => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
      );
    });
    expect(state.saved).toEqual([{ id: noteFragment.id, text: "A shorter note" }]);
    expect(container?.querySelector("textarea")).toBeNull();
  });

  test("a photo click and a song click keep their own actions", async () => {
    const state = await renderCanvas({ scraps: [songScrap] });
    const photo = container?.querySelector("img")?.closest("article");
    if (!(photo instanceof HTMLElement)) throw new Error("photo card missing");
    await clickCard(photo);
    expect(state.opened).toEqual([photoFragment.dayId]);
    expect(container?.querySelector("textarea")).toBeNull();

    const song = cardWithText("Same Song");
    useIpodStore.getState().setLibrarySource("appleMusic");
    const songBefore = getActiveIpodCurrentSongId(useIpodStore.getState());
    await clickCard(song);
    expect(state.opened).toEqual([photoFragment.dayId]);
    expect(getActiveIpodCurrentSongId(useIpodStore.getState())).toBe(songBefore);
    const play = song.querySelector("[data-journal-song-play]");
    if (!(play instanceof HTMLElement)) throw new Error("album art play control missing");
    await act(async () => {
      play.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(getActiveIpodCurrentSongId(useIpodStore.getState())).toBe(songScrap.songId);
    expect(container?.querySelector("textarea")).toBeNull();
  });

  test("dragging a text card does not open it or start editing", async () => {
    const state = await renderCanvas();
    const card = cardWithText(noteText);
    await act(async () => {
      card.dispatchEvent(pointer("pointerdown", 10, 10));
      card.dispatchEvent(pointer("pointermove", 40, 10));
      card.dispatchEvent(pointer("pointerup", 40, 10));
    });
    expect(state.moved).toEqual([noteFragment.id]);
    expect(state.opened).toEqual([]);
    expect(container?.querySelector("textarea")).toBeNull();
    await waitPastDoubleClick();
    expect(state.opened).toEqual([]);
  });
});
