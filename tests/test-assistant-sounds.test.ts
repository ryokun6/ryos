import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  AssistantSoundPlayer,
  canPlayAssistantSounds,
  markAssistantSoundInteraction,
  resetAssistantSoundStateForTests,
  resolveAssistantSoundSrc,
} from "../src/components/assistant/assistantSounds";
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
      addEventListener() {}
      removeEventListener() {}
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
});
