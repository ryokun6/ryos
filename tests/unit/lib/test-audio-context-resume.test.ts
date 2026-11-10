import { describe, expect, test } from "bun:test";
import {
  AUDIO_RESUME_TIMEOUT_MS,
  raceAudioContextResume,
} from "../../../src/lib/audioContext";

/**
 * R4: a Chromium resume() issued without a user gesture stays pending
 * forever. raceAudioContextResume must settle so resumeInProgress can clear.
 */

describe("raceAudioContextResume", () => {
  test("returns timeout when resume() never settles", async () => {
    const started = Date.now();
    const outcome = await raceAudioContextResume(
      () => new Promise<void>(() => {}),
      80
    );
    const elapsed = Date.now() - started;
    expect(outcome).toBe("timeout");
    expect(elapsed).toBeGreaterThanOrEqual(70);
    expect(elapsed).toBeLessThan(1500);
  });

  test("returns settled when resume() resolves", async () => {
    const outcome = await raceAudioContextResume(
      () => Promise.resolve(),
      AUDIO_RESUME_TIMEOUT_MS
    );
    expect(outcome).toBe("settled");
  });

  test("returns failed when resume() rejects", async () => {
    const outcome = await raceAudioContextResume(
      () => Promise.reject(new Error("NotAllowedError")),
      AUDIO_RESUME_TIMEOUT_MS
    );
    expect(outcome).toBe("failed");
  });
});
