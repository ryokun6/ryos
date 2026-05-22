import { describe, expect, test } from "bun:test";
import { getLabelClipWidth } from "../src/apps/ipod/components/screen/ScrollingText";

function mockElement(
  rect: Partial<DOMRect>,
  opts?: { clientWidth?: number; endCap?: boolean }
): HTMLElement {
  const el = {
    getBoundingClientRect: () =>
      ({
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
        ...rect,
      }) as DOMRect,
    clientWidth: opts?.clientWidth ?? 0,
    querySelector: opts?.endCap
      ? () => endCapEl
      : () => null,
  } as unknown as HTMLElement;

  const endCapEl = {
    getBoundingClientRect: () =>
      ({
        left: 70,
        top: 0,
        right: 80,
        bottom: 20,
        width: 10,
        height: 20,
        x: 70,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  } as unknown as HTMLElement;

  return el;
}

describe("getLabelClipWidth", () => {
  test("uses row end cap left edge minus container left edge", () => {
    const container = mockElement({ left: 10 }, { clientWidth: 200 });
    const row = mockElement({}, { endCap: true });
    expect(getLabelClipWidth(container, row)).toBe(60);
  });

  test("falls back to clientWidth when row has no end cap", () => {
    const container = mockElement({}, { clientWidth: 42 });
    expect(getLabelClipWidth(container, null)).toBe(42);
  });
});
