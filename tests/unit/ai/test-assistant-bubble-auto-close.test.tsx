import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act, useCallback, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ASSISTANT_BUBBLE_AUTO_CLOSE_MS,
  ASSISTANT_BUBBLE_AUTO_CLOSE_TOUCH_MS,
  useAssistantBubbleAutoClose,
} from "../../../src/components/assistant/useAssistantBubbleAutoClose";

let registeredDomForSuite = false;
let host: HTMLDivElement | null = null;
let root: Root | null = null;

function AutoCloseProbe({
  onAutoClose,
  resetKey = "clippy",
  holdOpen = false,
}: {
  onAutoClose: () => void;
  resetKey?: string;
  holdOpen?: boolean;
}) {
  const [bubbleOpen, setBubbleOpen] = useState(true);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeBubble = useCallback(() => {
    onAutoClose();
    setBubbleOpen(false);
  }, [onAutoClose]);
  const autoClose = useAssistantBubbleAutoClose({
    bubbleOpen,
    bubbleRef,
    inputRef,
    onClose: closeBubble,
    resetKey,
    holdOpen,
  });

  const toggleBubble = () => {
    autoClose.cancelAutoClose();
    const willOpen = !bubbleOpen;
    setBubbleOpen(willOpen);
    if (willOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <>
      {bubbleOpen && (
        <div
          data-bubble
          ref={bubbleRef}
          onBlur={autoClose.onBlur}
          onFocus={autoClose.onFocus}
          onPointerDown={autoClose.onPointerDown}
          onWheel={autoClose.onWheel}
        >
          <input
            data-input
            ref={inputRef}
            onCompositionStart={autoClose.onCompositionStart}
            onCompositionEnd={autoClose.onCompositionEnd}
          />
          <button type="button" data-inside>
            Inside
          </button>
          <div data-scrollable>Scrollable text</div>
          <button
            type="button"
            data-composition-start
            onClick={autoClose.onCompositionStart}
          >
            Start composition
          </button>
          <button
            type="button"
            data-composition-end
            onClick={autoClose.onCompositionEnd}
          >
            End composition
          </button>
        </div>
      )}
      <button type="button" data-character onClick={toggleBubble}>
        Character
      </button>
      <button type="button" data-outside>
        Outside
      </button>
    </>
  );
}

function queryElement<T extends Element>(selector: string): T {
  const element = host?.querySelector<T>(selector);
  if (!element) throw new Error(`Missing test element: ${selector}`);
  return element;
}

function focusElement(selector: string) {
  act(() => {
    queryElement<HTMLElement>(selector).focus();
  });
}

function advanceTimers(milliseconds: number) {
  act(() => {
    jest.advanceTimersByTime(milliseconds);
  });
}

beforeAll(() => {
  if (typeof document === "undefined") {
    GlobalRegistrator.register();
    registeredDomForSuite = true;
  }
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });
});

beforeEach(() => {
  jest.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  jest.useRealTimers();
  root = null;
  host?.remove();
  host = null;
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  if (registeredDomForSuite && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

describe("assistant bubble auto-close", () => {
  test("stays open before five seconds and closes at the deadline", async () => {
    let closeCount = 0;
    await act(async () => {
      root?.render(
        <AutoCloseProbe onAutoClose={() => (closeCount += 1)} />
      );
    });

    focusElement("[data-input]");
    focusElement("[data-outside]");
    advanceTimers(0);
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS - 1);

    expect(host?.querySelector("[data-bubble]")).not.toBeNull();
    expect(closeCount).toBe(0);

    advanceTimers(1);

    expect(host?.querySelector("[data-bubble]")).toBeNull();
    expect(closeCount).toBe(1);
  });

  test("cancels a pending close when focus returns inside", async () => {
    let closeCount = 0;
    await act(async () => {
      root?.render(
        <AutoCloseProbe onAutoClose={() => (closeCount += 1)} />
      );
    });

    focusElement("[data-input]");
    focusElement("[data-outside]");
    advanceTimers(0);
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS - 1);
    focusElement("[data-input]");
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS * 2);

    expect(host?.querySelector("[data-bubble]")).not.toBeNull();
    expect(closeCount).toBe(0);
  });

  test("does not start a timer for focus transfer inside the bubble", async () => {
    let closeCount = 0;
    await act(async () => {
      root?.render(
        <AutoCloseProbe onAutoClose={() => (closeCount += 1)} />
      );
    });

    focusElement("[data-input]");
    focusElement("[data-inside]");
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS);

    expect(host?.querySelector("[data-bubble]")).not.toBeNull();
    expect(closeCount).toBe(0);
  });

  test("defers a null-related-target blur and checks activeElement", async () => {
    await act(async () => {
      root?.render(<AutoCloseProbe onAutoClose={() => {}} />);
    });

    focusElement("[data-input]");
    act(() => {
      queryElement("[data-input]").dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: null })
      );
    });
    advanceTimers(0);
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS);

    expect(host?.querySelector("[data-bubble]")).not.toBeNull();

    act(() => queryElement<HTMLElement>("[data-input]").blur());
    advanceTimers(0);
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS);

    expect(host?.querySelector("[data-bubble]")).toBeNull();
  });

  test("restarts the grace period for pointer interaction inside", async () => {
    await act(async () => {
      root?.render(<AutoCloseProbe onAutoClose={() => {}} />);
    });

    focusElement("[data-input]");
    focusElement("[data-outside]");
    advanceTimers(0);
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS - 1_000);
    act(() => {
      queryElement("[data-scrollable]").dispatchEvent(
        new Event("pointerdown", { bubbles: true })
      );
    });
    advanceTimers(1_000);

    expect(host?.querySelector("[data-bubble]")).not.toBeNull();

    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS - 1_001);
    expect(host?.querySelector("[data-bubble]")).not.toBeNull();

    advanceTimers(1);
    expect(host?.querySelector("[data-bubble]")).toBeNull();
  });

  test("waits for IME composition to finish before counting down", async () => {
    await act(async () => {
      root?.render(<AutoCloseProbe onAutoClose={() => {}} />);
    });

    focusElement("[data-input]");
    act(() => queryElement<HTMLElement>("[data-composition-start]").click());
    focusElement("[data-outside]");
    advanceTimers(0);
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS);

    expect(host?.querySelector("[data-bubble]")).not.toBeNull();

    act(() => queryElement<HTMLElement>("[data-composition-end]").click());
    advanceTimers(0);
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS);

    expect(host?.querySelector("[data-bubble]")).toBeNull();
  });

  test("character close and reopen cancels the old timer", async () => {
    let closeCount = 0;
    await act(async () => {
      root?.render(
        <AutoCloseProbe onAutoClose={() => (closeCount += 1)} />
      );
    });

    focusElement("[data-input]");
    focusElement("[data-outside]");
    advanceTimers(0);
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS - 1_000);
    act(() => queryElement<HTMLElement>("[data-character]").click());
    expect(host?.querySelector("[data-bubble]")).toBeNull();

    act(() => queryElement<HTMLElement>("[data-character]").click());
    advanceTimers(16);
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS * 2);

    expect(host?.querySelector("[data-bubble]")).not.toBeNull();
    expect(closeCount).toBe(0);
  });

  test("cleans pending timers on character switch and unmount", async () => {
    let closeCount = 0;
    const onAutoClose = () => {
      closeCount += 1;
    };
    await act(async () => {
      root?.render(<AutoCloseProbe onAutoClose={onAutoClose} />);
    });

    focusElement("[data-input]");
    focusElement("[data-outside]");
    advanceTimers(0);
    await act(async () => {
      root?.render(
        <AutoCloseProbe onAutoClose={onAutoClose} resetKey="rover" />
      );
    });
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS);

    expect(host?.querySelector("[data-bubble]")).not.toBeNull();

    focusElement("[data-input]");
    focusElement("[data-outside]");
    advanceTimers(0);
    await act(async () => root?.unmount());
    root = null;
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS);

    expect(closeCount).toBe(0);
  });

  test("never closes while holdOpen is active, restarts fresh after", async () => {
    let closeCount = 0;
    const onAutoClose = () => {
      closeCount += 1;
    };
    await act(async () => {
      root?.render(<AutoCloseProbe onAutoClose={onAutoClose} holdOpen />);
    });

    // Blur out while a reply is generating (e.g. mobile keyboard dismissed).
    focusElement("[data-input]");
    focusElement("[data-outside]");
    advanceTimers(0);
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS * 3);

    expect(host?.querySelector("[data-bubble]")).not.toBeNull();
    expect(closeCount).toBe(0);

    // Reply finished: the full grace period restarts from zero.
    await act(async () => {
      root?.render(
        <AutoCloseProbe onAutoClose={onAutoClose} holdOpen={false} />
      );
    });
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS - 1);

    expect(host?.querySelector("[data-bubble]")).not.toBeNull();
    expect(closeCount).toBe(0);

    advanceTimers(1);

    expect(host?.querySelector("[data-bubble]")).toBeNull();
    expect(closeCount).toBe(1);
  });

  test("holdOpen interrupts a running countdown and restarts it fresh", async () => {
    let closeCount = 0;
    const onAutoClose = () => {
      closeCount += 1;
    };
    await act(async () => {
      root?.render(<AutoCloseProbe onAutoClose={onAutoClose} />);
    });

    focusElement("[data-input]");
    focusElement("[data-outside]");
    advanceTimers(0);
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS - 1);

    // A new reply starts streaming just before the deadline.
    await act(async () => {
      root?.render(<AutoCloseProbe onAutoClose={onAutoClose} holdOpen />);
    });
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS * 3);

    expect(host?.querySelector("[data-bubble]")).not.toBeNull();
    expect(closeCount).toBe(0);

    await act(async () => {
      root?.render(
        <AutoCloseProbe onAutoClose={onAutoClose} holdOpen={false} />
      );
    });
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS - 1);

    expect(host?.querySelector("[data-bubble]")).not.toBeNull();

    advanceTimers(1);

    expect(host?.querySelector("[data-bubble]")).toBeNull();
    expect(closeCount).toBe(1);
  });

  test("holdOpen without a blur never arms a countdown after it lifts", async () => {
    let closeCount = 0;
    const onAutoClose = () => {
      closeCount += 1;
    };
    await act(async () => {
      root?.render(<AutoCloseProbe onAutoClose={onAutoClose} holdOpen />);
    });

    await act(async () => {
      root?.render(
        <AutoCloseProbe onAutoClose={onAutoClose} holdOpen={false} />
      );
    });
    advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_MS * 3);

    expect(host?.querySelector("[data-bubble]")).not.toBeNull();
    expect(closeCount).toBe(0);
  });

  test("touch devices get the longer grace period", async () => {
    const original = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(navigator),
      "maxTouchPoints"
    );
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    try {
      let closeCount = 0;
      await act(async () => {
        root?.render(
          <AutoCloseProbe onAutoClose={() => (closeCount += 1)} />
        );
      });

      focusElement("[data-input]");
      focusElement("[data-outside]");
      advanceTimers(0);
      advanceTimers(ASSISTANT_BUBBLE_AUTO_CLOSE_TOUCH_MS - 1);

      expect(host?.querySelector("[data-bubble]")).not.toBeNull();
      expect(closeCount).toBe(0);

      advanceTimers(1);

      expect(host?.querySelector("[data-bubble]")).toBeNull();
      expect(closeCount).toBe(1);
    } finally {
      Reflect.deleteProperty(navigator, "maxTouchPoints");
      if (original) {
        Object.defineProperty(
          Object.getPrototypeOf(navigator),
          "maxTouchPoints",
          original
        );
      }
    }
  });
});
