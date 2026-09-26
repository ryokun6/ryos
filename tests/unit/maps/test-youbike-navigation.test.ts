import { describe, expect, test } from "bun:test";
import {
  YOUBIKE_NAV_APPROACH_METERS,
  YOUBIKE_NAV_SPEAK_COOLDOWN_MS,
  youbikeNavAnnounce,
  youbikeNavigationFocusedIndex,
} from "../../../src/apps/maps/youbike/navigation";
import { youbikeStepRemainingMeters } from "../../../src/apps/maps/youbike/routeSteps";

describe("youbikeNavigationFocusedIndex", () => {
  test("prefers an on-route GPS index", () => {
    expect(
      youbikeNavigationFocusedIndex({
        stepCount: 4,
        gpsIndex: 2,
        manualIndex: 0,
      })
    ).toBe(2);
  });

  test("falls back to the manual index when GPS is off the route", () => {
    expect(
      youbikeNavigationFocusedIndex({
        stepCount: 4,
        gpsIndex: null,
        manualIndex: 3,
      })
    ).toBe(3);
    expect(
      youbikeNavigationFocusedIndex({
        stepCount: 4,
        gpsIndex: 9,
        manualIndex: 1,
      })
    ).toBe(1);
  });

  test("clamps an empty or out-of-range manual index", () => {
    expect(
      youbikeNavigationFocusedIndex({
        stepCount: 0,
        gpsIndex: null,
        manualIndex: 2,
      })
    ).toBe(0);
    expect(
      youbikeNavigationFocusedIndex({
        stepCount: 3,
        gpsIndex: null,
        manualIndex: 8,
      })
    ).toBe(2);
  });
});

describe("youbikeStepRemainingMeters", () => {
  const path = [
    { latitude: 25.033, longitude: 121.54 },
    { latitude: 25.034, longitude: 121.54 },
  ];

  test("returns leftover meters along the current step", () => {
    const remaining = youbikeStepRemainingMeters(
      { path },
      { latitude: 25.0335, longitude: 121.54 }
    );
    expect(remaining).not.toBeNull();
    expect(remaining!).toBeGreaterThan(40);
    expect(remaining!).toBeLessThan(70);
  });

  test("is near zero at the step end and null when far off the path", () => {
    const atEnd = youbikeStepRemainingMeters(
      { path },
      { latitude: 25.034, longitude: 121.54 }
    );
    expect(atEnd).not.toBeNull();
    expect(atEnd!).toBeLessThan(2);
    expect(
      youbikeStepRemainingMeters(
        { path },
        { latitude: 25.05, longitude: 121.5 }
      )
    ).toBeNull();
    expect(youbikeStepRemainingMeters({ path }, null)).toBeNull();
  });
});

describe("youbikeNavAnnounce", () => {
  const base = {
    focusedIndex: 0,
    stepCount: 3,
    remainingMeters: 80,
    lastSpokenIndex: null as number | null,
    lastApproachIndex: null as number | null,
    lastSpeakAtMs: 0,
    nowMs: 10_000,
  };

  test("speaks the focused step when navigation starts", () => {
    const result = youbikeNavAnnounce({ ...base, isStarting: true });
    expect(result.kind).toBe("start");
    expect(result.speakIndex).toBe(0);
    expect(result.lastSpokenIndex).toBe(0);
  });

  test("announces the next step once when remaining distance crosses the threshold", () => {
    const first = youbikeNavAnnounce({
      ...base,
      isStarting: false,
      lastSpokenIndex: 0,
      remainingMeters: YOUBIKE_NAV_APPROACH_METERS,
    });
    expect(first.kind).toBe("approach");
    expect(first.speakIndex).toBe(1);
    expect(first.lastApproachIndex).toBe(1);

    const again = youbikeNavAnnounce({
      ...base,
      isStarting: false,
      lastSpokenIndex: 0,
      lastApproachIndex: 1,
      lastSpeakAtMs: first.lastSpeakAtMs,
      nowMs: first.lastSpeakAtMs + 20_000,
      remainingMeters: 10,
    });
    expect(again.kind).toBeNull();
  });

  test("does not re-speak a step that was already announced as the approach", () => {
    const result = youbikeNavAnnounce({
      ...base,
      isStarting: false,
      focusedIndex: 1,
      lastSpokenIndex: 0,
      lastApproachIndex: 1,
      remainingMeters: 5,
    });
    expect(result.kind).toBeNull();
    expect(result.lastSpokenIndex).toBe(1);
  });

  test("speaks an advance when the rider skips the approach cue", () => {
    const result = youbikeNavAnnounce({
      ...base,
      isStarting: false,
      focusedIndex: 1,
      lastSpokenIndex: 0,
      remainingMeters: 60,
    });
    expect(result.kind).toBe("advance");
    expect(result.speakIndex).toBe(1);
  });

  test("holds a second cue until the cooldown elapses", () => {
    const result = youbikeNavAnnounce({
      ...base,
      isStarting: false,
      lastSpokenIndex: 0,
      lastSpeakAtMs: 10_000,
      nowMs: 10_000 + YOUBIKE_NAV_SPEAK_COOLDOWN_MS - 1,
      remainingMeters: 8,
    });
    expect(result.kind).toBeNull();
    expect(result.lastApproachIndex).toBeNull();
  });
});
