import { describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { createRoot } from "react-dom/client";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { JournalScrap } from "../../../src/apps/journal/types";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
});
if (typeof document === "undefined" || !GlobalRegistrator.isRegistered) {
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register();
  }
}

const DAY_ID = "2026-10-28";

const textScrap: JournalScrap = {
  id: "scrap-note",
  pageId: DAY_ID,
  kind: "text",
  photo: null,
  songId: null,
  songTitle: null,
  songArtist: null,
  songCover: null,
  canvasPageId: null,
  x: 10,
  y: 10,
  w: 30,
  rotate: 0,
};

const songScrap: JournalScrap = {
  id: "scrap-song",
  pageId: DAY_ID,
  kind: "song",
  photo: null,
  songId: "scrap-song",
  songTitle: "Same Song",
  songArtist: "Ryo",
  songCover: null,
  canvasPageId: null,
  x: 40,
  y: 10,
  w: 24,
  rotate: 0,
};

describe("journal page selection", () => {
  test("text blocks have no ring and cards keep one", async () => {
    class FakeAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};
      createGain() {
        return {
          gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} },
          context: this,
          connect() {},
          disconnect() {},
        };
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: FakeAudioContext,
    });
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: undefined,
    });
    const { DailyJournal } = await import("../../../src/apps/journal/components/GeneratedView");
    const { useJournalLogic } = await import("../../../src/apps/journal/hooks/useJournalLogic");
    const { createInitialJournalState } = await import("../../../src/apps/journal/logic");
    const { useJournalStore } = await import("../../../src/stores/useJournalStore");
    const { useAudioSettingsStore } = await import("../../../src/stores/useAudioSettingsStore");
    useAudioSettingsStore.setState({ uiSoundsEnabled: false });
    useJournalStore.setState({
      journal: {
        ...createInitialJournalState(),
        selectedDayId: DAY_ID,
        scraps: [textScrap, songScrap],
      },
      notice: null,
    });
    const i18n = i18next.createInstance();
    await i18n.use(initReactI18next).init({
      lng: "en",
      fallbackLng: "en",
      resources: { en: { translation: {} } },
      interpolation: { escapeValue: false },
      returnNull: false,
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    function Page() {
      const l = useJournalLogic();
      return <DailyJournal l={l} isMobileLayout={false} />;
    }

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <Page />
        </I18nextProvider>
      );
    });

    function card(id: string) {
      const node = container.querySelector(`[data-journal-page-card="${id}"]`);
      if (!(node instanceof HTMLElement)) throw new Error(`page card ${id} missing`);
      return node;
    }

    await act(async () => {
      useJournalStore.getState().selectCard("oct28-note");
    });
    expect(card("oct28-note").className).not.toContain("ring-2");
    expect(card("oct28-photo").className).not.toContain("ring-2");

    await act(async () => {
      useJournalStore.getState().selectCard("oct28-photo");
    });
    expect(card("oct28-note").className).not.toContain("ring-2");
    expect(card("oct28-photo").className).toContain("ring-2");

    await act(async () => {
      useJournalStore.getState().selectCard(textScrap.id);
    });
    expect(card(textScrap.id).className).not.toContain("ring-2");
    expect(card("oct28-photo").className).not.toContain("ring-2");

    await act(async () => {
      useJournalStore.getState().selectCard(songScrap.id);
    });
    expect(card(songScrap.id).className).toContain("ring-2");
    expect(card(textScrap.id).className).not.toContain("ring-2");

    await act(async () => {
      root.unmount();
    });
    container.remove();
    useJournalStore.setState({ journal: createInitialJournalState(), notice: null });
  });
});
