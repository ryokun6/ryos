import { describe, expect, test } from "bun:test";
import {
  applyReversalHysteresis,
  applyVolumeDegrees,
  advanceScrubSession,
  centerPressDown,
  centerPressHeld,
  centerPressReleased,
  nextNowPlayingCenterMode,
  scrubDiamondCenterPx,
  scrubDiamondHalfExtentPx,
  scrubDiamondLeftCss,
  scrubDiamondRingColor,
  SCRUB_DIAMOND_COLUMN_GUTTER_PX,
  commitScrubIfIdle,
  initialAccelState,
  initialReversalState,
  initialScrubSession,
  initialVolumeGestureState,
  LIST_ROW_TIERS,
  menuSlideDurationMs,
  nextListRowCount,
  SCRUB_COMMIT_IDLE_MS,
  SCRUB_STEP_SECONDS,
  seekHoldStepSeconds,
  segmentPassesNearHub,
  VOLUME_DEGREES_PER_UNIT,
} from "../../../src/apps/ipod/utils/wheelGesture";
import { planWheelClicks } from "../../../src/apps/ipod/utils/wheelSound";

describe("list acceleration tiers", () => {
  test("stays on one row at or below 180°/s", () => {
    const slow = nextListRowCount(initialAccelState(), {
      direction: 1,
      speedDegPerSec: 180,
      now: 0,
    });
    expect(slow.rows).toBe(1);
    expect(slow.state.aboveSince).toBeNull();
  });

  test("steps 1, 2, 3, 5, 8, 13, 21, 34 every 500ms above 180°/s", () => {
    let state = initialAccelState();
    const rows: number[] = [];
    for (let now = 0; now <= (LIST_ROW_TIERS.length - 1) * 500; now += 100) {
      const next = nextListRowCount(state, {
        direction: 1,
        speedDegPerSec: 250,
        now,
      });
      if (now % 500 === 0) rows.push(next.rows);
      state = next.state;
    }
    expect(rows).toEqual([...LIST_ROW_TIERS]);

    const capped = nextListRowCount(state, {
      direction: 1,
      speedDegPerSec: 400,
      now: (LIST_ROW_TIERS.length - 1) * 500 + 100,
    });
    expect(capped.rows).toBe(34);
  });

  test("resets on reversal, a gap, and slowdown", () => {
    let state = nextListRowCount(initialAccelState(), {
      direction: 1,
      speedDegPerSec: 300,
      now: 0,
    }).state;
    state = nextListRowCount(state, {
      direction: 1,
      speedDegPerSec: 300,
      now: 1000,
    }).state;
    expect(
      nextListRowCount(state, { direction: -1, speedDegPerSec: 300, now: 1100 }).rows
    ).toBe(1);
    expect(
      nextListRowCount(state, { direction: 1, speedDegPerSec: 300, now: 1000 + 251 }).rows
    ).toBe(1);
    expect(
      nextListRowCount(state, { direction: 1, speedDegPerSec: 100, now: 1100 }).rows
    ).toBe(1);
  });

  test("a zero-speed sample (trackpad tick) stays at one row", () => {
    const next = nextListRowCount(initialAccelState(), {
      direction: 1,
      speedDegPerSec: 0,
      now: 0,
    });
    expect(next.rows).toBe(1);
  });
});

describe("reversal hysteresis", () => {
  test("requires 8° of opposite travel and swallows the crossing sample", () => {
    let state = initialReversalState();
    const first = applyReversalHysteresis(state, 15);
    state = first.state;
    expect(first.acceptedDeltaDeg).toBe(15);

    const partial = applyReversalHysteresis(state, -5);
    state = partial.state;
    expect(partial.acceptedDeltaDeg).toBe(0);
    expect(state.sign).toBe(1);
    expect(state.pendingOppositeDeg).toBe(5);

    const crossing = applyReversalHysteresis(state, -4);
    state = crossing.state;
    expect(crossing.acceptedDeltaDeg).toBe(0);
    expect(state.sign).toBe(-1);
    expect(state.pendingOppositeDeg).toBe(0);

    const after = applyReversalHysteresis(state, -15);
    expect(after.acceptedDeltaDeg).toBe(-15);
  });
});

describe("hub rejection", () => {
  test("rejects a segment that passes within 10% of the radius", () => {
    expect(
      segmentPassesNearHub({ x: 100, y: 0 }, { x: -100, y: 0 }, 100)
    ).toBe(true);
    expect(
      segmentPassesNearHub({ x: 100, y: 5 }, { x: -100, y: 5 }, 100)
    ).toBe(true);
  });

  test("keeps a chord that stays outside the hub corridor", () => {
    expect(
      segmentPassesNearHub({ x: 100, y: 20 }, { x: 80, y: 20 }, 100)
    ).toBe(false);
  });
});

describe("hold-to-seek ramp", () => {
  test("repeats 5s, 5s, 5s, 10s, 10s, 10s, then 20s", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map(seekHoldStepSeconds)).toEqual([
      5, 5, 5, 10, 10, 10, 20, 20,
    ]);
  });
});

describe("volume mapping", () => {
  test("uses 4.5° per unit so 1.25 turns cover 0–100", () => {
    expect(VOLUME_DEGREES_PER_UNIT).toBe(4.5);
    let volume = 0;
    let state = initialVolumeGestureState();
    for (let i = 0; i < 450 / 15; i++) {
      const next = applyVolumeDegrees(volume, state, 15);
      volume = next.volume01;
      state = next.state;
    }
    expect(volume).toBe(1);
    expect(state.remainderDeg).toBe(0);
  });

  test("accumulates a partial step and clears it when direction changes", () => {
    const partial = applyVolumeDegrees(0.5, initialVolumeGestureState(), 4);
    expect(partial.volume01).toBe(0.5);
    expect(partial.changed).toBe(false);
    expect(partial.state.remainderDeg).toBe(4);

    const reversed = applyVolumeDegrees(partial.volume01, partial.state, -4.5);
    expect(reversed.volume01).toBeCloseTo(0.49, 10);
    expect(reversed.changed).toBe(true);
  });

  test("clamps at both ends of the shared 0–1 volume", () => {
    const topped = applyVolumeDegrees(1, initialVolumeGestureState(), 45);
    expect(topped.volume01).toBe(1);
    expect(topped.changed).toBe(false);
    expect(topped.state.remainderDeg).toBe(0);

    const bottomed = applyVolumeDegrees(0, initialVolumeGestureState(), -45);
    expect(bottomed.volume01).toBe(0);
    expect(bottomed.changed).toBe(false);
  });
});

describe("scrub commit", () => {
  test("previews 1s steps and commits about 1s after the wheel stops", () => {
    let session = initialScrubSession(10);
    session = advanceScrubSession(session, {
      direction: 1,
      speedDegPerSec: 40,
      now: 1_000,
      durationSeconds: 200,
    });
    expect(session.preview).toBe(11);
    expect(session.committed).toBe(10);

    const early = commitScrubIfIdle(session, 1_000 + SCRUB_COMMIT_IDLE_MS - 1);
    expect(early.commitSeconds).toBeNull();
    expect(early.session.committed).toBe(10);

    const committed = commitScrubIfIdle(session, 1_000 + SCRUB_COMMIT_IDLE_MS);
    expect(committed.commitSeconds).toBe(11);
    expect(committed.session.committed).toBe(11);

    const again = commitScrubIfIdle(committed.session, 5_000);
    expect(again.commitSeconds).toBeNull();
  });

  test("grows the step through 1, 2, 3, then 5 seconds", () => {
    let session = initialScrubSession(0);
    const steps: number[] = [];
    for (let now = 0; now <= (SCRUB_STEP_SECONDS.length - 1) * 500; now += 100) {
      const before = session.preview;
      session = advanceScrubSession(session, {
        direction: 1,
        speedDegPerSec: 300,
        now,
        durationSeconds: 600,
      });
      if (now % 500 === 0) steps.push(session.preview - before);
    }
    expect(steps).toEqual([...SCRUB_STEP_SECONDS]);
  });

  test("a new wheel sample postpones the commit", () => {
    let session = advanceScrubSession(initialScrubSession(0), {
      direction: 1,
      speedDegPerSec: 20,
      now: 0,
      durationSeconds: 100,
    });
    session = advanceScrubSession(session, {
      direction: 1,
      speedDegPerSec: 20,
      now: 900,
      durationSeconds: 100,
    });
    expect(commitScrubIfIdle(session, 1000).commitSeconds).toBeNull();
    expect(commitScrubIfIdle(session, 1900).commitSeconds).toBe(2);
  });
});

describe("click scheduling", () => {
  test("plays one click now and schedules at most one extra inside 50ms", () => {
    const first = planWheelClicks({
      quanta: 1,
      lastPlayedAt: null,
      now: 0,
      hasPending: false,
    });
    expect(first.playNow).toBe(true);
    expect(first.scheduleDelayMs).toBeNull();

    const second = planWheelClicks({
      quanta: 1,
      lastPlayedAt: first.nextLastPlayedAt,
      now: 0,
      hasPending: false,
    });
    expect(second.playNow).toBe(false);
    expect(second.scheduleDelayMs).toBe(30);

    const third = planWheelClicks({
      quanta: 1,
      lastPlayedAt: second.nextLastPlayedAt,
      now: 0,
      hasPending: true,
    });
    expect(third.playNow).toBe(false);
    expect(third.scheduleDelayMs).toBeNull();
  });

  test("drops a click that would land outside the lead window", () => {
    const planned = planWheelClicks({
      quanta: 1,
      lastPlayedAt: 0,
      now: 10,
      hasPending: false,
      minIntervalMs: 80,
      maxLeadMs: 50,
    });
    expect(planned.playNow).toBe(false);
    expect(planned.scheduleDelayMs).toBeNull();
  });
});

describe("center button press", () => {
  test("a short release selects and does not open the menu", () => {
    const down = centerPressDown();
    expect(down).toBe("down");
    const released = centerPressReleased(down);
    expect(released.select).toBe(true);
    expect(released.phase).toBe("idle");
  });

  test("holding opens the menu once, and the release does not also select", () => {
    const down = centerPressDown();
    const held = centerPressHeld(down);
    expect(held.openMenu).toBe(true);
    expect(held.phase).toBe("menu");
    expect(centerPressHeld(held.phase).openMenu).toBe(false);

    const released = centerPressReleased(held.phase);
    expect(released.select).toBe(false);
    expect(released.phase).toBe("idle");
  });

  test("Now Playing cycles seek, then video, then the plain screen", () => {
    expect(nextNowPlayingCenterMode("normal")).toBe("seek");
    expect(nextNowPlayingCenterMode("seek")).toBe("video");
    expect(nextNowPlayingCenterMode("video")).toBe("normal");
  });

  test("a cancelled press neither selects nor opens the menu", () => {
    expect(centerPressReleased("idle").select).toBe(false);
    expect(centerPressHeld("idle").openMenu).toBe(false);
    expect(centerPressHeld("menu").openMenu).toBe(false);
  });
});

describe("scrub diamond", () => {
  test("the center sits on the fill tip at 0%, 50%, and 100%", () => {
    const width = 210;
    expect(scrubDiamondCenterPx(0, width)).toBeCloseTo(0);
    expect(scrubDiamondCenterPx(0.5, width)).toBeCloseTo(width / 2);
    expect(scrubDiamondCenterPx(1, width)).toBeCloseTo(width);
    expect(scrubDiamondCenterPx(Number.NaN, width)).toBeCloseTo(0);
    expect(scrubDiamondCenterPx(-1, width)).toBeCloseTo(0);
    expect(scrubDiamondCenterPx(2, width)).toBeCloseTo(width);
  });

  test("the marker is allowed to hang past the track ends", () => {
    const width = 210;
    const half = scrubDiamondHalfExtentPx();
    expect(scrubDiamondCenterPx(0, width) - half).toBeLessThan(0);
    expect(scrubDiamondCenterPx(1, width) + half).toBeGreaterThan(width);
  });

  test("the hang fits the column gutter and the gap above the bar", () => {
    const half = scrubDiamondHalfExtentPx();
    expect(half).toBeLessThan(SCRUB_DIAMOND_COLUMN_GUTTER_PX);
    // pt-1.5 above the bar is 6px. The top tip stays inside that padding.
    for (const trackHeight of [8, 9]) {
      expect(half - trackHeight / 2).toBeLessThan(6);
    }
  });

  test("the CSS left is the raw fraction, with no inset", () => {
    expect(scrubDiamondLeftCss(0)).toBe("0%");
    expect(scrubDiamondLeftCss(0.5)).toBe("50%");
    expect(scrubDiamondLeftCss(1)).toBe("100%");
    expect(scrubDiamondLeftCss(0)).not.toContain("px");
    expect(scrubDiamondLeftCss(1)).not.toContain("calc");
  });

  test("the knockout ring is the LCD field, not the fill", () => {
    const fills = ["#2260a4", "#0a3667"];
    const rings = [
      scrubDiamondRingColor(true, true),
      scrubDiamondRingColor(true, false),
      scrubDiamondRingColor(false, true),
      scrubDiamondRingColor(false, false),
    ];
    expect(rings).toEqual(["#ffffff", "#ffffff", "#e0f0fc", "#8a9da9"]);
    for (const ring of rings) {
      expect(fills).not.toContain(ring);
    }
  });
});

describe("menu slide duration", () => {
  test("scales 240ms by travel and is instant under reduced motion", () => {
    expect(
      menuSlideDurationMs({
        reducedMotion: false,
        fromPercent: 100,
        toPercent: 0,
      })
    ).toBe(240);
    expect(
      menuSlideDurationMs({
        reducedMotion: false,
        fromPercent: 40,
        toPercent: 0,
      })
    ).toBe(96);
    expect(
      menuSlideDurationMs({
        reducedMotion: true,
        fromPercent: 100,
        toPercent: 0,
      })
    ).toBe(0);
  });
});
