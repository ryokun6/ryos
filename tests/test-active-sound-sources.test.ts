import { beforeEach, describe, expect, test } from "bun:test";
import {
  canStartSoundSource,
  getActiveSoundSourceCount,
  releaseSoundSource,
  resetActiveSoundSources,
  stopAndReleaseOwnedSoundSources,
  trackSoundSource,
} from "../src/utils/activeSoundSources";

const createSource = (
  options: { stopThrows?: boolean } = {}
): {
  source: AudioBufferSourceNode;
  calls: { disconnect: number; stop: number };
} => {
  const calls = { disconnect: 0, stop: 0 };
  const source = {
    disconnect: () => {
      calls.disconnect += 1;
    },
    stop: () => {
      calls.stop += 1;
      if (options.stopThrows) throw new Error("context closed");
    },
  } as unknown as AudioBufferSourceNode;
  return { source, calls };
};

beforeEach(() => {
  resetActiveSoundSources();
});

describe("active UI sound source tracking", () => {
  test("enforces the concurrency cap without allowing an extra source", () => {
    const owner = new Set<AudioBufferSourceNode>();

    for (let index = 0; index < 16; index += 1) {
      trackSoundSource(createSource().source, owner);
    }

    expect(getActiveSoundSourceCount()).toBe(16);
    expect(canStartSoundSource(16)).toBe(false);
  });

  test("manual stop releases sources even when no ended event fires", () => {
    const owner = new Set<AudioBufferSourceNode>();
    const { source, calls } = createSource();
    trackSoundSource(source, owner);

    stopAndReleaseOwnedSoundSources(owner);

    expect(calls).toEqual({ disconnect: 1, stop: 1 });
    expect(owner.size).toBe(0);
    expect(getActiveSoundSourceCount()).toBe(0);
  });

  test("context reset clears every owner even when stale sources throw", () => {
    const firstOwner = new Set<AudioBufferSourceNode>();
    const secondOwner = new Set<AudioBufferSourceNode>();
    const first = createSource();
    const stale = createSource({ stopThrows: true });
    trackSoundSource(first.source, firstOwner);
    trackSoundSource(stale.source, secondOwner);

    resetActiveSoundSources();

    expect(firstOwner.size).toBe(0);
    expect(secondOwner.size).toBe(0);
    expect(getActiveSoundSourceCount()).toBe(0);
    expect(first.calls).toEqual({ disconnect: 1, stop: 1 });
    expect(stale.calls).toEqual({ disconnect: 1, stop: 1 });

    // A late `ended` callback remains harmless after the reset.
    releaseSoundSource(first.source);
    expect(getActiveSoundSourceCount()).toBe(0);
  });
});
