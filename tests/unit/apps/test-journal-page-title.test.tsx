import { afterAll, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JournalPageTitle } from "../../../src/apps/journal/components/JournalPageTitle";
import { DailyJournal } from "../../../src/apps/journal/components/GeneratedView";
import { formatJournalDay, sampleJournalTitle } from "../../../src/apps/journal/sampleContent";
import { journalSidebarDays, todayDayId } from "../../../src/apps/journal/logic";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { installHappyDom, uninstallHappyDom } from "../../helpers/register-happy-dom";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
});
const installedHappyDom = installHappyDom();

describe("journal page title", () => {
  test("shows the date until a double click saves a new title", async () => {
    const saved: Array<{ id: string; title: string }> = [];
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);

    function render(title: string) {
      root.render(
        <JournalPageTitle
          pageId="2026-11-01"
          defaultTitle="Nov 1"
          title={title}
          onSave={(id, next) => saved.push({ id, title: next })}
        />
      );
    }

    await act(async () => {
      render("Nov 1");
    });
    const heading = container.querySelector("h2");
    expect(heading?.textContent).toBe("Nov 1");
    await act(async () => {
      heading?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const editor = container.querySelector("input");
    if (!(editor instanceof HTMLInputElement)) throw new Error("title editor missing");
    expect(editor.value).toBe("Nov 1");
    editor.value = "Taipei";
    await act(async () => {
      editor.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
      editor.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(saved).toEqual([{ id: "2026-11-01", title: "Taipei" }]);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  test("a blank title clears back to the date", async () => {
    const saved: string[] = [];
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(
        <JournalPageTitle
          pageId="2026-11-01"
          defaultTitle="Nov 1"
          title="Taipei"
          onSave={(_id, title) => saved.push(title)}
        />
      );
    });
    await act(async () => {
      container.querySelector("h2")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const editor = container.querySelector("input");
    if (!(editor instanceof HTMLInputElement)) throw new Error("title editor missing");
    editor.value = "   ";
    await act(async () => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
      );
    });
    expect(saved).toEqual([""]);
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  test("shows the date under the mood faces only for a custom title", async () => {
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
    const { useJournalLogic } = await import("../../../src/apps/journal/hooks/useJournalLogic");
    const { useJournalStore } = await import("../../../src/stores/useJournalStore");
    const { useAudioSettingsStore } = await import("../../../src/stores/useAudioSettingsStore");
    const { createInitialJournalState } = await import("../../../src/apps/journal/logic");
    useAudioSettingsStore.setState({ uiSoundsEnabled: false });
    useJournalStore.setState({ journal: createInitialJournalState(), notice: null });
    const i18n = i18next.createInstance();
    await i18n.use(initReactI18next).init({
      lng: "en",
      fallbackLng: "en",
      resources: { en: { translation: {} } },
      interpolation: { escapeValue: false },
      returnNull: false,
    });
    const dayId = useJournalStore.getState().journal.selectedDayId;
    const dateLabel = formatJournalDay(dayId, "en");
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
    expect(container.querySelector("[data-journal-title-date]")?.textContent).toBe(dateLabel);
    expect(container.textContent).not.toContain("apps.journal.mood.label");
    expect(container.querySelector("h2")?.textContent).toBe(sampleJournalTitle(dayId, "en"));
    expect(container.textContent).not.toContain(formatJournalDay("2026-11-02", "en"));
    const today = todayDayId();
    if (!journalSidebarDays(useJournalStore.getState().journal).includes(today)) {
      const button = [...container.querySelectorAll("button")].find(
        (node) => node.textContent === "apps.journal.sidebar.newJournal"
      );
      if (!(button instanceof HTMLButtonElement)) throw new Error("New Journal button missing");
      const dayRow = [...container.querySelectorAll("button")].find(
        (node) => node.textContent === sampleJournalTitle(dayId, "en")
      );
      expect(dayRow).toBeTruthy();
      expect(dayRow!.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      await act(async () => {
        button.click();
      });
      expect(useJournalStore.getState().journal.selectedDayId).toBe(today);
      expect(container.textContent).toContain(formatJournalDay(today, "en"));
      expect(container.textContent).not.toContain("apps.journal.sidebar.newJournal");
      await act(async () => {
        useJournalStore.getState().selectDay(dayId);
      });
    }

    await act(async () => {
      useJournalStore.getState().setPageTitle(dayId, "Taipei");
    });
    expect(container.querySelector("[data-journal-title-date]")?.textContent).toBe(dateLabel);
    expect(container.querySelector("h2")?.textContent).toBe("Taipei");

    await act(async () => {
      useJournalStore.getState().setPageTitle(dayId, dateLabel);
    });
    expect(container.querySelector("[data-journal-title-date]")).toBeNull();

    await act(async () => {
      useJournalStore.getState().setPageTitle(dayId, "");
    });
    expect(container.querySelector("[data-journal-title-date]")?.textContent).toBe(dateLabel);
    expect(container.querySelector("h2")?.textContent).toBe(sampleJournalTitle(dayId, "en"));

    await act(async () => {
      root.unmount();
    });
    container.remove();
    useJournalStore.setState({ journal: createInitialJournalState(), notice: null });
  });
});

afterAll(async () => {
  await uninstallHappyDom(installedHappyDom);
});
