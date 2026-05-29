#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import {
  isClientYInBottomZone,
  shouldRevealDockFromSwipeUp,
} from "../src/utils/dockRevealGesture";

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
