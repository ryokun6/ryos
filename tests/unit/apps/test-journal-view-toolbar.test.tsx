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
import { createInitialJournalState } from "../../../src/apps/journal/logic";

type JournalLogic = import("../../../src/apps/journal/hooks/useJournalLogic").JournalLogic;
type JournalStore = typeof import("../../../src/stores/useJournalStore").useJournalStore;

type ToolbarProps = {
  l: JournalLogic;
  open: boolean;
  pages: "canvas" | "none";
};

let useJournalLogic: typeof import("../../../src/apps/journal/hooks/useJournalLogic").useJournalLogic;
let useJournalStore: JournalStore;

let ViewToolbar: (props: ToolbarProps) => React.JSX.Element;

function installAudioContext() {
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    onstatechange: (() => void) | null = null;
    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
        },
        context: this,
        connect() {},
        disconnect() {},
      };
    }
    resume() {
      return Promise.resolve();
    }
  }
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    writable: true,
    value: FakeAudioContext,
  });
}

const originalActEnvironment = Object.getOwnPropertyDescriptor(
  globalThis,
  "IS_REACT_ACT_ENVIRONMENT"
);
let registeredDomHere = false;

if (typeof document === "undefined" || !GlobalRegistrator.isRegistered) {
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register();
    registeredDomHere = true;
  }
}

const i18n = i18next.createInstance();
let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Harness({
  pages,
  open,
}: {
  pages: "canvas" | "none";
  open: boolean;
}) {
  const l = useJournalLogic();
  return <ViewToolbar l={l} open={open} pages={pages} />;
}

function button(label: string) {
  const buttons = container?.querySelectorAll("button");
  if (!buttons) return null;
  for (const node of buttons) {
    if (node.getAttribute("aria-label") === label) return node;
  }
  return null;
}

function dividerCount(): number {
  return container?.querySelectorAll(".journal-view-toolbar .w-px").length ?? 0;
}

function expectEntering(node: HTMLElement | null) {
  const opacity = Number(node?.style.opacity);
  const scale = /scale\(([0-9.]+)\)/.exec(node?.style.transform ?? "");
  expect(opacity).toBeGreaterThanOrEqual(0);
  expect(opacity).toBeLessThan(0.5);
  expect(scale).not.toBeNull();
  expect(Number(scale?.[1])).toBeLessThan(0.85);
}

async function renderToolbar(pages: "canvas" | "none") {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <I18nextProvider i18n={i18n}>
        <Harness pages={pages} open />
      </I18nextProvider>
    );
  });
}

beforeAll(async () => {
  installAudioContext();
  ({ useJournalLogic } = await import("../../../src/apps/journal/hooks/useJournalLogic"));
  ({ useJournalStore } = await import("../../../src/stores/useJournalStore"));
  ({ JournalViewToolbar: ViewToolbar } = await import(
    "../../../src/apps/journal/components/JournalViewToolbar"
  ));
  const { useAudioSettingsStore } = await import("../../../src/stores/useAudioSettingsStore");
  useAudioSettingsStore.setState({ uiSoundsEnabled: false });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    resources: { en: { translation: {} } },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
});

beforeAll(() => {
  // happy-dom rejects a canceled Web Animations call, and motion does not
  // catch that rejection when a toolbar spring is torn down.
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: undefined,
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  useJournalStore.setState({
    journal: createInitialJournalState(),
    notice: null,
  });
});

afterAll(() => {
  if (originalActEnvironment) {
    Object.defineProperty(
      globalThis,
      "IS_REACT_ACT_ENVIRONMENT",
      originalActEnvironment
    );
  } else {
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
  if (registeredDomHere && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

describe("journal view toolbar", () => {
  test("keeps previous visible but disabled on the first page", async () => {
    await renderToolbar("canvas");

    const previous = button("apps.journal.toolbar.previous");
    expect(previous).not.toBeNull();
    expect(previous?.disabled).toBe(true);
    expect(button("apps.journal.toolbar.delete")).toBeNull();
    expect(button("apps.journal.toolbar.addNote")).not.toBeNull();
    expect(dividerCount()).toBe(1);

    await act(async () => {
      useJournalStore.getState().selectCard("oct27-note");
    });

    const deleteButton = button("apps.journal.toolbar.delete");
    expect(deleteButton).not.toBeNull();
    expect(deleteButton?.disabled).toBe(false);
    expect(dividerCount()).toBe(1);
    expectEntering(deleteButton);

    await act(async () => {
      useJournalStore.getState().addCanvasPage();
    });

    const enabledPrevious = button("apps.journal.toolbar.previous");
    expect(enabledPrevious).not.toBeNull();
    expect(enabledPrevious?.disabled).toBe(false);
    expect(dividerCount()).toBe(1);
  });

  test("daily toolbar has no divider and reveals delete only for a selected card", async () => {
    await renderToolbar("none");

    expect(dividerCount()).toBe(0);
    expect(button("apps.journal.toolbar.delete")).toBeNull();
    expect(button("apps.journal.toolbar.previous")).toBeNull();

    await act(async () => {
      useJournalStore.getState().selectCard("oct27-note");
    });

    const deleteButton = button("apps.journal.toolbar.delete");
    expect(deleteButton).not.toBeNull();
    expect(dividerCount()).toBe(0);

    await act(async () => {
      deleteButton?.click();
    });

    expect(button("apps.journal.toolbar.delete")).toBeNull();
    expect(useJournalStore.getState().journal.selectedCardId).toBeNull();
    expect(useJournalStore.getState().journal.removedFragmentIds).toContain("oct27-note");
  });
});
