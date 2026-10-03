#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import {
  isClientXInSideZone,
  isClientYInBottomZone,
  shouldRevealDockFromSwipeUp,
  shouldRevealSideDockFromSwipe,
} from "../../../src/utils/dockRevealGesture";

describe("shouldRevealDockFromSwipeUp", () => {
  test("returns false for taps with negligible movement", () => {
    expect(shouldRevealDockFromSwipeUp(0, 0)).toBe(false);
    expect(shouldRevealDockFromSwipeUp(5, -8)).toBe(false);
  });

  test("returns true for upward swipes past threshold", () => {
    expect(shouldRevealDockFromSwipeUp(10, -60)).toBe(true);
    expect(shouldRevealDockFromSwipeUp(-5, -50)).toBe(true);
  });

  test("returns false for downward or mostly horizontal movement", () => {
    expect(shouldRevealDockFromSwipeUp(0, 60)).toBe(false);
    expect(shouldRevealDockFromSwipeUp(80, -20)).toBe(false);
  });
});

describe("isClientYInBottomZone", () => {
  test("detects coordinates in the bottom band", () => {
    expect(isClientYInBottomZone(950, 1000, 80)).toBe(true);
    expect(isClientYInBottomZone(900, 1000, 80)).toBe(false);
    expect(isClientYInBottomZone(920, 1000, 80)).toBe(true);
  });
});

describe("shouldRevealSideDockFromSwipe", () => {
  test("returns false for taps with negligible movement", () => {
    expect(shouldRevealSideDockFromSwipe(0, 0, "right")).toBe(false);
    expect(shouldRevealSideDockFromSwipe(-8, 5, "left")).toBe(false);
  });

  test("reveals a right dock on a leftward swipe and a left dock on a rightward swipe", () => {
    expect(shouldRevealSideDockFromSwipe(-60, 10, "right")).toBe(true);
    expect(shouldRevealSideDockFromSwipe(60, -10, "left")).toBe(true);
  });

  test("ignores outward and mostly vertical swipes", () => {
    expect(shouldRevealSideDockFromSwipe(60, 0, "right")).toBe(false);
    expect(shouldRevealSideDockFromSwipe(-60, 0, "left")).toBe(false);
    expect(shouldRevealSideDockFromSwipe(-50, -90, "right")).toBe(false);
  });
});

describe("isClientXInSideZone", () => {
  test("detects coordinates in the right strip", () => {
    expect(isClientXInSideZone(440, 466, 84, "right")).toBe(true);
    expect(isClientXInSideZone(382, 466, 84, "right")).toBe(true);
    expect(isClientXInSideZone(381, 466, 84, "right")).toBe(false);
  });

  test("detects coordinates in the left strip", () => {
    expect(isClientXInSideZone(20, 466, 84, "left")).toBe(true);
    expect(isClientXInSideZone(84, 466, 84, "left")).toBe(true);
    expect(isClientXInSideZone(85, 466, 84, "left")).toBe(false);
  });
});
