import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAssistantBubbleBodyHeightHold } from "../src/components/assistant/useAssistantBubbleBodyHeightHold";

let registeredDomForSuite = false;
let host: HTMLDivElement | null = null;
let root: Root | null = null;

/**
 * Mimics the assistant bubble body: content swaps to a one-line ticker while
 * loading, and the hook must reserve the pre-send height. happy-dom performs
 * no layout, so offsetHeight is mocked per rendered content height.
 */
function HeightHoldProbe({
  isLoading,
  contentHeight,
}: {
  isLoading: boolean;
  contentHeight: number;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentHeightRef = useRef(contentHeight);
  contentHeightRef.current = contentHeight;
  const minHeight = useAssistantBubbleBodyHeightHold(bodyRef, isLoading);

  const attachBody = (element: HTMLDivElement | null) => {
    bodyRef.current = element;
    if (element && !Object.getOwnPropertyDescriptor(element, "offsetHeight")) {
      Object.defineProperty(element, "offsetHeight", {
        configurable: true,
        get: () => contentHeightRef.current,
      });
    }
  };

  return (
    <div
      data-body
      ref={attachBody}
      style={minHeight !== null ? { minHeight } : undefined}
    >
      {isLoading ? "Thinking…" : "reply"}
    </div>
  );
}

function bodyElement(): HTMLElement {
  const element = host?.querySelector<HTMLElement>("[data-body]");
  if (!element) throw new Error("Missing probe body");
  return element;
}

async function renderProbe(isLoading: boolean, contentHeight: number) {
  await act(async () => {
    root?.render(
      <HeightHoldProbe isLoading={isLoading} contentHeight={contentHeight} />
    );
  });
}

beforeAll(() => {
  if (typeof document === "undefined") {
    GlobalRegistrator.register();
    registeredDomForSuite = true;
  }
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });
});

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
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

describe("assistant bubble body height hold", () => {
  test("reserves the pre-send height for the whole turn", async () => {
    // Idle with a tall reply: nothing reserved.
    await renderProbe(false, 120);
    expect(bodyElement().style.minHeight).toBe("");

    // Sending: content collapses to the ticker in the same commit; the body
    // must reserve the previous 120px so the bubble does not displace.
    await renderProbe(true, 20);
    expect(bodyElement().style.minHeight).toBe("120px");

    // Streaming re-renders keep the same reservation (no re-latching).
    await renderProbe(true, 60);
    expect(bodyElement().style.minHeight).toBe("120px");

    // Turn finished: reservation released, content height wins again.
    await renderProbe(false, 80);
    expect(bodyElement().style.minHeight).toBe("");
  });

  test("re-latches the new reply height on the next turn", async () => {
    await renderProbe(false, 120);
    await renderProbe(true, 20);
    await renderProbe(false, 48);
    expect(bodyElement().style.minHeight).toBe("");

    // Next send reserves the latest reply's height, not the first one's.
    await renderProbe(true, 20);
    expect(bodyElement().style.minHeight).toBe("48px");
  });

  test("holds nothing when no idle height was ever measured", async () => {
    await renderProbe(true, 20);
    expect(bodyElement().style.minHeight).toBe("");
  });
});
