/**
 * Guardrail tests for the playback clock throttle + subscription wiring.
 *
 * `elapsedTime` updates ~20x/sec during playback. Two invariants keep that
 * cheap:
 *   1. Both media stores (iPod, Karaoke) gate `setElapsedTime` behind the
 *      shared `shouldUpdatePlaybackTime` epsilon so redundant ticks never
 *      notify subscribers.
 *   2. The big iPod logic hook never subscribes to `elapsedTime` — only leaf
 *      components do (via `useIpodElapsedTime`), so a tick re-renders the
 *      screen subtree instead of the whole app.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test, expect } from "bun:test";

import {
  PLAYBACK_TIME_UPDATE_EPSILON_SECONDS,
  shouldUpdatePlaybackTime,
} from "../src/stores/playbackTime";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("shouldUpdatePlaybackTime", () => {
  test("skips sub-epsilon updates and accepts larger ones", () => {
    expect(shouldUpdatePlaybackTime(10, 10)).toBe(false);
    expect(
      shouldUpdatePlaybackTime(10, 10 + PLAYBACK_TIME_UPDATE_EPSILON_SECONDS / 2)
    ).toBe(false);
    expect(
      shouldUpdatePlaybackTime(10, 10 + PLAYBACK_TIME_UPDATE_EPSILON_SECONDS)
    ).toBe(true);
    expect(shouldUpdatePlaybackTime(10, 11)).toBe(true);
  });

  test("is symmetric (seeks backwards also update)", () => {
    expect(shouldUpdatePlaybackTime(120, 0)).toBe(true);
    expect(
      shouldUpdatePlaybackTime(10, 10 - PLAYBACK_TIME_UPDATE_EPSILON_SECONDS / 2)
    ).toBe(false);
  });
});

describe("store wiring", () => {
  test("iPod store gates setElapsedTime/setTotalTime behind the shared epsilon", () => {
    const source = readSource("src/stores/useIpodStore.ts");
    expect(source).toContain('from "@/stores/playbackTime"');
    expect(source).toMatch(
      /setElapsedTime: \(time\) =>\s*set\(\(state\) =>\s*shouldUpdatePlaybackTime\(state\.elapsedTime, time\)/
    );
    expect(source).toMatch(
      /setTotalTime: \(time\) =>\s*set\(\(state\) =>\s*shouldUpdatePlaybackTime\(state\.totalTime, time\)/
    );
  });

  test("Karaoke store gates setElapsedTime behind the shared epsilon", () => {
    const source = readSource("src/stores/useKaraokeStore.ts");
    expect(source).toContain('from "./playbackTime"');
    expect(source).toMatch(
      /shouldUpdatePlaybackTime\(state\.elapsedTime, next\)/
    );
  });
});

describe("iPod elapsedTime subscription wiring", () => {
  test("useIpodPlayback does not subscribe to the playback clock", () => {
    const source = readSource("src/apps/ipod/hooks/useIpodPlayback.ts");
    expect(source).not.toMatch(/useIpodStore\(\s*\(\s*state\s*\)\s*=>\s*state\.elapsedTime\s*\)/);
  });

  test("useIpodLogic reads the clock via getState() and drives lyrics via store subscription", () => {
    const source = readSource("src/apps/ipod/hooks/useIpodLogic.ts");
    // No reactive selector on elapsedTime anywhere in the logic hook.
    expect(source).not.toMatch(/useIpodStore\(\s*\([^)]*\)\s*=>[^)]*\.elapsedTime/);
    // Lyrics current-line tracking runs off a vanilla store subscription.
    expect(source).toMatch(/useIpodStore\.subscribe\(\(state, prevState\) =>/);
    // The logic hook must not re-expose elapsedTime to the controller bag.
    expect(source).not.toMatch(/^\s{4}elapsedTime,\s*$/m);
  });

  test("leaf components subscribe via useIpodElapsedTime", () => {
    for (const file of [
      "src/apps/ipod/components/ipod-screen/IpodScreen.tsx",
      "src/apps/ipod/components/ipod-app/IpodFullScreenView.tsx",
      "src/apps/ipod/components/ipod-app/IpodAppDialogs.tsx",
    ]) {
      expect(readSource(file)).toContain("useIpodElapsedTime(");
    }
  });
});
