import { describe, expect, test } from "bun:test";
import { recordRotationAndEvaluate } from "../src/apps/ipod/utils/fastScrollVelocity";

const config = {
  windowSize: 6,
  activateMaxMs: 500,
  deactivateMaxMs: 900,
};

function feed(
  intervals: number[],
  startActive = false,
  startAt = 1_000
): {
  decisions: string[];
  finalTimestamps: number[];
  finalActive: boolean;
} {
  const timestamps: number[] = [];
  let active = startActive;
  let now = startAt;
  const decisions: string[] = [];
  for (let i = 0; i < intervals.length; i++) {
    now += intervals[i];
    const decision = recordRotationAndEvaluate(timestamps, now, active, config);
    decisions.push(decision);
    if (decision === "activate") active = true;
    if (decision === "deactivate") active = false;
  }
  return { decisions, finalTimestamps: timestamps, finalActive: active };
}

describe("recordRotationAndEvaluate", () => {
  test("emits 'none' while window is not yet full", () => {
    const timestamps: number[] = [];
    let active = false;
    // 5 ultra-fast rotations: still under windowSize=6, must stay "none".
    for (let i = 0; i < 5; i++) {
      const decision = recordRotationAndEvaluate(
        timestamps,
        1_000 + i * 50,
        active,
        config
      );
      expect(decision).toBe("none");
      if (decision === "activate") active = true;
    }
    expect(active).toBe(false);
    expect(timestamps.length).toBe(5);
  });

  test("slow browsing never activates letter mode, even after many rotations", () => {
    // 500ms per rotation = right at the edge of the old 600ms reset
    // window: under the old count-based logic this would have
    // activated after 30 rotations. With the velocity-based logic the
    // window span is 6 * 500ms = 2500ms — well above the 500ms
    // activate threshold — so we never enter letter mode.
    const intervals = new Array(60).fill(500);
    const { decisions, finalActive } = feed(intervals);
    expect(finalActive).toBe(false);
    expect(decisions.some((d) => d === "activate")).toBe(false);
  });

  test("moderate browsing (200ms / rotation) does not activate either", () => {
    const intervals = new Array(40).fill(200);
    const { decisions, finalActive } = feed(intervals);
    expect(finalActive).toBe(false);
    expect(decisions.includes("activate")).toBe(false);
  });

  test("rapid wheel spin activates exactly once the window fills", () => {
    // 70ms per rotation → 6 rotations span 350ms (≤ 500ms), so the
    // sixth rotation should produce "activate".
    const intervals = new Array(10).fill(70);
    const { decisions } = feed(intervals);
    // First five rotations: window not yet full -> "none".
    expect(decisions.slice(0, 5).every((d) => d === "none")).toBe(true);
    // Sixth rotation completes the window and triggers activation.
    expect(decisions[5]).toBe("activate");
    // Subsequent rotations stay in active mode (no further decisions
    // from the helper, since "activate" is a one-shot edge).
    expect(decisions.slice(6).every((d) => d === "none")).toBe(true);
  });

  test("once active, dropping to slow speed deactivates without waiting", () => {
    // Warm up: six fast rotations to enter letter mode.
    const fastIntervals = new Array(6).fill(60);
    // Then six slow rotations (200ms each) → 6 * 200ms = 1200ms span
    // > 900ms deactivate threshold once they dominate the window.
    const slowIntervals = new Array(6).fill(200);
    const { decisions, finalActive } = feed([
      ...fastIntervals,
      ...slowIntervals,
    ]);
    expect(decisions[5]).toBe("activate");
    expect(decisions.slice(6)).toContain("deactivate");
    expect(finalActive).toBe(false);
  });

  test("brief jitter inside the spin does not bounce out of fast mode", () => {
    // Fast spin to engage…
    const fastIntervals = new Array(6).fill(60);
    // …then one slightly slower step (~120ms) — window span becomes
    // 5 * 60 + 120 = 420ms, still well under deactivateMaxMs (900ms).
    const jitter = [120];
    const { decisions, finalActive } = feed([...fastIntervals, ...jitter]);
    expect(decisions[5]).toBe("activate");
    expect(decisions[6]).toBe("none");
    expect(finalActive).toBe(true);
  });

  test("after deactivation, rapid scrolling can re-activate", () => {
    const fast = new Array(6).fill(60);
    const slow = new Array(6).fill(200);
    const fastAgain = new Array(6).fill(60);
    const { decisions, finalActive } = feed([...fast, ...slow, ...fastAgain]);
    expect(decisions).toContain("activate");
    expect(decisions).toContain("deactivate");
    // Last segment should re-activate eventually as the fast
    // timestamps push the slow ones out of the window.
    const lastActivateIdx = decisions.lastIndexOf("activate");
    const lastDeactivateIdx = decisions.lastIndexOf("deactivate");
    expect(lastActivateIdx).toBeGreaterThan(lastDeactivateIdx);
    expect(finalActive).toBe(true);
  });

  test("ring buffer is bounded by windowSize", () => {
    const intervals = new Array(50).fill(80);
    const { finalTimestamps } = feed(intervals);
    expect(finalTimestamps.length).toBe(config.windowSize);
  });
});
