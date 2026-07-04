import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  AssistantSoundPlayer,
  canPlayAssistantSounds,
  getCachedAssistantSoundCountForTests,
  markAssistantSoundInteraction,
  resetAssistantSoundPlaybackGapForTests,
  resetAssistantSoundStateForTests,
  resolveAssistantSoundSrc,
} from "../src/components/assistant/assistantSounds";
import { ASSISTANT_SOUND_MAPS } from "../src/components/assistant/sounds";
import { useAudioSettingsStore } from "../src/stores/useAudioSettingsStore";

describe("assistant sound mapping", () => {
  test("maps frame sound ids to clippy.js MP3 data URLs for every character", () => {
    for (const characterId of [
      "clippy",
      "links",
      "f1",
      "genius",
      "rocky",
      "merlin",
      "genie",
      "peedy",
      "rover",
    ] as const) {
      const src = resolveAssistantSoundSrc(characterId, "1");
      expect(src).toStartWith("data:audio/mpeg;base64,");
    }
  });

  test("returns undefined for unknown sound ids", () => {
    expect(resolveAssistantSoundSrc("clippy", "999")).toBeUndefined();
  });
});

describe("assistant sound playback gates", () => {
  afterEach(() => {
    resetAssistantSoundStateForTests();
    useAudioSettingsStore.setState({ uiSoundsEnabled: true });
  });

  test("requires user interaction before playback is allowed", () => {
    expect(canPlayAssistantSounds()).toBe(false);
    markAssistantSoundInteraction();
    expect(canPlayAssistantSounds()).toBe(true);
  });

  test("respects global UI sound mute setting", () => {
    markAssistantSoundInteraction();
    useAudioSettingsStore.setState({ uiSoundsEnabled: false });
    expect(canPlayAssistantSounds()).toBe(false);
  });
});

describe("AssistantSoundPlayer", () => {
  afterEach(() => {
    resetAssistantSoundStateForTests();
    useAudioSettingsStore.setState({ uiSoundsEnabled: true });
  });

  test("loadCharacter no-ops when sound map is missing", () => {
    const originalAudio = globalThis.Audio;
    class MockAudio {
      preload = "";
      volume = 1;
      currentTime = 0;
      src = "";
      play() {
        return Promise.resolve();
      }
      pause() {}
      addEventListener() {}
      removeEventListener() {}
    }
    // @ts-expect-error test double
    globalThis.Audio = MockAudio;

    try {
      const player = new AssistantSoundPlayer();
      expect(() =>
        player.loadCharacter("missing" as "clippy")
      ).not.toThrow();
      player.play("1");
    } finally {
      globalThis.Audio = originalAudio;
    }
  });

  test("does not call HTMLAudioElement.play before user interaction", () => {
    const play = mock(() => Promise.resolve());
    const originalAudio = globalThis.Audio;
    class MockAudio {
      preload = "";
      volume = 1;
      currentTime = 0;
      src = "";
      play = play;
      pause() {}
      load() {}
      addEventListener() {}
      removeEventListener() {}
      removeAttribute() {}
    }
    // @ts-expect-error test double
    globalThis.Audio = MockAudio;

    try {
      const player = new AssistantSoundPlayer();
      player.loadCharacter("clippy");
      player.play("1");
      expect(play).not.toHaveBeenCalled();

      markAssistantSoundInteraction();
      player.play("1");
      expect(play).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.Audio = originalAudio;
    }
  });

  test("creates audio elements lazily on play, never on loadCharacter", () => {
    let created = 0;
    const originalAudio = globalThis.Audio;
    class MockAudio {
      preload = "";
      volume = 1;
      currentTime = 0;
      src = "";
      constructor() {
        created += 1;
      }
      play() {
        return Promise.resolve();
      }
      pause() {}
      load() {}
      addEventListener() {}
      removeEventListener() {}
      removeAttribute() {}
    }
    // @ts-expect-error test double
    globalThis.Audio = MockAudio;

    try {
      markAssistantSoundInteraction();
      const player = new AssistantSoundPlayer();
      player.loadCharacter("rocky");
      expect(created).toBe(0);

      player.play("1");
      expect(created).toBe(1);
      expect(getCachedAssistantSoundCountForTests()).toBe(1);
    } finally {
      globalThis.Audio = originalAudio;
    }
  });

  test("reuses cached clips across player instances and character switches", () => {
    let created = 0;
    const originalAudio = globalThis.Audio;
    class MockAudio {
      preload = "";
      volume = 1;
      currentTime = 0;
      src = "";
      constructor() {
        created += 1;
      }
      play() {
        return Promise.resolve();
      }
      pause() {}
      load() {}
      addEventListener() {}
      removeEventListener() {}
      removeAttribute() {}
    }
    // @ts-expect-error test double
    globalThis.Audio = MockAudio;

    try {
      markAssistantSoundInteraction();

      const first = new AssistantSoundPlayer();
      first.loadCharacter("clippy");
      first.play("1");
      first.dispose();
      expect(created).toBe(1);

      // Remounted sprite (character switch back) reuses the cached element.
      const second = new AssistantSoundPlayer();
      second.loadCharacter("clippy");
      resetAssistantSoundPlaybackGapForTests();
      second.play("1");
      expect(created).toBe(1);
      expect(getCachedAssistantSoundCountForTests()).toBe(1);
    } finally {
      globalThis.Audio = originalAudio;
    }
  });

  test("caps the shared clip cache and releases evicted elements", () => {
    const released: string[] = [];
    const originalAudio = globalThis.Audio;
    class MockAudio {
      preload = "";
      volume = 1;
      currentTime = 0;
      src: string;
      constructor(src: string) {
        this.src = src;
      }
      play() {
        return Promise.resolve();
      }
      pause() {}
      load() {}
      addEventListener() {}
      removeEventListener() {}
      removeAttribute(name: string) {
        if (name === "src") released.push(this.src);
      }
    }
    // @ts-expect-error test double
    globalThis.Audio = MockAudio;

    try {
      markAssistantSoundInteraction();
      const player = new AssistantSoundPlayer();
      player.loadCharacter("rocky");

      const soundIds = Object.keys(ASSISTANT_SOUND_MAPS.rocky);
      for (const soundId of soundIds) {
        resetAssistantSoundPlaybackGapForTests();
        player.play(soundId);
      }

      expect(getCachedAssistantSoundCountForTests()).toBeLessThanOrEqual(24);
      expect(released.length).toBe(
        Math.max(0, soundIds.length - 24)
      );
    } finally {
      globalThis.Audio = originalAudio;
    }
  });
});
