import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { SongSearchDialogProps } from "../../../src/components/dialogs/song-search-dialog/types";
import type { ListenQueueItem } from "../../../src/shared/listen/queue";

let registeredDomForSuite = false;
if (typeof document === "undefined") {
  GlobalRegistrator.register();
  registeredDomForSuite = true;
}

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
});

const i18n = i18next.createInstance();

const { KaraokeQueueList } = await import(
  "../../../src/apps/karaoke/components/KaraokeQueueList"
);
const { useSongSearchDialog } = await import(
  "../../../src/components/dialogs/song-search-dialog/hooks/useSongSearchDialog"
);
const { useThemeStore } = await import("../../../src/stores/useThemeStore");

const YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const queuedSong = {
  videoId: "dQw4w9WgXcQ",
  title: "Never Gonna Give You Up",
  channelTitle: "Rick Astley",
  thumbnail: "https://example.com/thumb.jpg",
  publishedAt: "2009-10-25",
};

function queueItem(entryId: string, title: string): ListenQueueItem {
  return {
    entryId,
    trackId: "dQw4w9WgXcQ",
    title,
    artist: "Rick Astley",
    requestedBy: "ryo",
    addedAt: 1,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalFetch: typeof globalThis.fetch;

beforeAll(async () => {
  originalFetch = globalThis.fetch;
  useThemeStore.setState({ current: "macosx" });
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    resources: {
      en: {
        translation: {
          apps: {
            karaoke: {
              queue: {
                title: "Up Next",
                empty: "Nothing queued",
                add: "Add to Queue",
                addSongs: "Add Songs",
                addSongsHint: "Search, then add to the queue",
                playNext: "Play Next",
                remove: "Remove",
                from: "{{name}}",
              },
            },
            ipod: {
              dialogs: {
                songSearchError: "search failed",
                songSearchEmptyQuery: "enter a song",
                songSearchSearching: "searching…",
                songSearchNoResults: "no results",
                songSearchQuotaExhausted: "quota",
                songSearchUnavailable: "unavailable",
                songSearchHttpError: "http {{status}}",
                songSearchHttpErrorWithHint: "{{error}} {{hint}}",
                songSearchInvalidResponse: "bad response",
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
  globalThis.fetch = originalFetch;
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  if (registeredDomForSuite && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

async function render(node: React.ReactElement): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(React.createElement(I18nextProvider, { i18n }, node));
  });
  return container;
}

function addButtons(host: ParentNode): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>("[data-karaoke-queue-add]")];
}

describe("Karaoke queue add songs", () => {
  test("empty state shows one add songs button and clicking it opens search", async () => {
    let opened = 0;
    const host = await render(
      React.createElement(KaraokeQueueList, {
        items: [],
        canEdit: true,
        onBump: () => {},
        onRemove: () => {},
        onAddSongs: () => {
          opened += 1;
        },
      })
    );

    expect(host.textContent).toContain("Nothing queued");
    const buttons = addButtons(host);
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe("Add Songs");
    expect(buttons[0]?.className).toContain("aqua-button");
    expect(buttons[0]?.className).toContain("primary");
    expect(buttons[0]?.className).toContain("w-full");
    expect(buttons[0]?.closest("ul")).toBeNull();
    const emptyRow = host.querySelector("ul li");
    expect(emptyRow?.textContent).toContain("Nothing queued");
    expect(emptyRow?.className).toContain("items-center");
    expect(emptyRow?.className).toContain("justify-center");
    expect(emptyRow?.className).toContain("flex-1");

    await act(async () => {
      buttons[0]?.click();
    });
    expect(opened).toBe(1);
  });

  test("a filled queue keeps add songs in the footer, once", async () => {
    let opened = 0;
    const host = await render(
      React.createElement(KaraokeQueueList, {
        items: [queueItem("entry-one", "First"), queueItem("entry-two", "Second")],
        canEdit: true,
        onBump: () => {},
        onRemove: () => {},
        onAddSongs: () => {
          opened += 1;
        },
      })
    );

    const buttons = addButtons(host);
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.className).toContain("w-full");
    expect(buttons[0]?.closest("ul")).toBeNull();
    const playNext = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Play Next"]'
    );
    expect(playNext?.getAttribute("title")).toBe("Play Next");
    expect(playNext?.querySelector("svg")).not.toBeNull();
    expect(playNext?.textContent?.trim()).toBe("");
    const remove = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove"]'
    );
    expect(remove?.querySelector("svg")).not.toBeNull();

    await act(async () => {
      buttons[0]?.click();
    });
    expect(opened).toBe(1);
  });

  test("a pending add shows the original title instead of an empty queue", async () => {
    const host = await render(
      React.createElement(KaraokeQueueList, {
        items: [
          {
            ...queueItem("pending-1", "Original Title"),
            pending: true,
            artist: "Original Channel",
          },
        ],
        canEdit: true,
        onBump: () => {},
        onRemove: () => {},
        onAddSongs: () => {},
      })
    );

    expect(host.textContent).toContain("Original Title");
    expect(host.textContent).toContain("Original Channel");
    expect(host.textContent).not.toContain("Nothing queued");
    const pending = host.querySelector("li[data-karaoke-queue-pending]");
    expect(pending?.getAttribute("aria-busy")).toBe("true");
    expect(pending?.querySelector("button")).toBeNull();
    expect(addButtons(host)).toHaveLength(1);
  });

  test("read-only viewers do not get an add songs button", async () => {
    const host = await render(
      React.createElement(KaraokeQueueList, {
        items: [],
        canEdit: false,
        onBump: () => {},
        onRemove: () => {},
        onAddSongs: () => {},
      })
    );
    expect(addButtons(host)).toHaveLength(0);
    expect(host.textContent).toContain("Nothing queued");
  });
});

describe("queue-only song search", () => {
  test("choosing a result adds it to the queue and closes the dialog", async () => {
    const opens: boolean[] = [];
    const queued: string[] = [];
    const played: string[] = [];
    const pending: { current: Promise<unknown> } = { current: Promise.resolve() };

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ results: [queuedSong] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    function Harness(props: SongSearchDialogProps) {
      const vm = useSongSearchDialog(props);
      return (
        <div>
          <button
            type="button"
            data-search
            onClick={() => {
              pending.current = vm.handleSearch();
            }}
          >
            search
          </button>
          <button
            type="button"
            data-pick
            onClick={() => vm.dispatch({ type: "setSelectedIndex", index: 0 })}
          >
            pick
          </button>
          <button
            type="button"
            data-add
            onClick={() => {
              pending.current = vm.handleAddSelected();
            }}
          >
            add
          </button>
        </div>
      );
    }

    const host = await render(
      React.createElement(Harness, {
        isOpen: true,
        initialQuery: "never gonna",
        queueOnly: true,
        onOpenChange: (open: boolean) => {
          opens.push(open);
        },
        onSelect: (result) => {
          played.push(result.videoId);
        },
        onQueueSelect: (result) => {
          queued.push(result.videoId);
        },
      })
    );

    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-search]")?.click();
      await pending.current;
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-pick]")?.click();
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-add]")?.click();
      await pending.current;
    });

    expect(queued).toEqual(["dQw4w9WgXcQ"]);
    expect(played).toEqual([]);
    expect(opens).toContain(false);
  });

  test("a queue-only url submits to the queue and closes the dialog", async () => {
    const opens: boolean[] = [];
    const queued: string[] = [];
    const libraryAdds: string[] = [];

    function Harness(props: SongSearchDialogProps) {
      const vm = useSongSearchDialog(props);
      return (
        <button type="button" data-search onClick={() => void vm.handleSearch()}>
          search
        </button>
      );
    }

    const host = await render(
      React.createElement(Harness, {
        isOpen: true,
        initialQuery: YOUTUBE_URL,
        queueOnly: true,
        onOpenChange: (open: boolean) => {
          opens.push(open);
        },
        onSelect: () => {},
        onAddUrl: async (url: string) => {
          libraryAdds.push(url);
        },
        onQueueUrl: async (url: string) => {
          queued.push(url);
        },
      })
    );

    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-search]")?.click();
    });

    expect(queued).toEqual([YOUTUBE_URL]);
    expect(libraryAdds).toEqual([]);
    expect(opens).toContain(false);
  });
});
