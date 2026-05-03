import { describe, expect, test } from "bun:test";
import {
  computeSpeedScore,
  musicQuizMaxScore,
  MUSIC_QUIZ_MAX_POINTS_PER_ROUND,
  MUSIC_QUIZ_SNIPPET_MS,
} from "../src/apps/ipod/utils/musicQuizScoring";

describe("computeSpeedScore", () => {
  test("instant answer earns full points", () => {
    expect(computeSpeedScore(0)).toBe(MUSIC_QUIZ_MAX_POINTS_PER_ROUND);
  });

  test("half window earns half points", () => {
    expect(computeSpeedScore(MUSIC_QUIZ_SNIPPET_MS / 2)).toBe(100);
  });

  test("timeout earns zero", () => {
    expect(computeSpeedScore(MUSIC_QUIZ_SNIPPET_MS)).toBe(0);
    expect(computeSpeedScore(MUSIC_QUIZ_SNIPPET_MS + 1)).toBe(0);
  });

  test("max game score scales with rounds", () => {
    expect(musicQuizMaxScore(5)).toBe(1_000);
  });
});
