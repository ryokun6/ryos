import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  BOOKS_SPEECH_BAR_TOUCH_OPEN_MS,
  useBooksSpeechBarVisibility,
} from "../src/apps/books/hooks/useBooksSpeechBarVisibility";

if (typeof document === "undefined") {
  GlobalRegistrator.register();
}

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

type SpeechBarVisibility = ReturnType<typeof useBooksSpeechBarVisibility>;

let visibility: SpeechBarVisibility | null = null;
let container: HTMLDivElement | null = null;
let root: Root | null = null;

function SpeechBarProbe() {
  visibility = useBooksSpeechBarVisibility({ isPlaying: false });
  return React.createElement("div", {
    "data-open": visibility.isOpen ? "true" : "false",
  });
}

function getVisibility(): SpeechBarVisibility {
  if (!visibility) throw new Error("Speech bar visibility hook is not ready");
  return visibility;
}

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(React.createElement(SpeechBarProbe));
  });
  jest.useFakeTimers();
});

afterEach(async () => {
  jest.useRealTimers();
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  visibility = null;
});

afterAll(() => {
  if (GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

describe("Books speech bar visibility", () => {
  test("keeps a touch-opened bar visible for three seconds", () => {
    act(() => {
      getVisibility().handlePointerEnter("touch");
    });
    expect(getVisibility().isOpen).toBe(false);

    act(() => {
      getVisibility().handlePointerDown("touch");
      getVisibility().handlePointerLeave("touch");
    });
    expect(getVisibility().isOpen).toBe(true);

    act(() => {
      jest.advanceTimersByTime(BOOKS_SPEECH_BAR_TOUCH_OPEN_MS - 1);
    });
    expect(getVisibility().isOpen).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(getVisibility().isOpen).toBe(false);
  });

  test("still follows mouse hover without the touch hold", () => {
    act(() => {
      getVisibility().handlePointerEnter("mouse");
    });
    expect(getVisibility().isOpen).toBe(true);

    act(() => {
      getVisibility().handlePointerLeave("mouse");
      jest.advanceTimersByTime(159);
    });
    expect(getVisibility().isOpen).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(getVisibility().isOpen).toBe(false);
  });
});
