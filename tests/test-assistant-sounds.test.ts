import { afterEach, describe, expect, test } from "bun:test";
import {
  AssistantSoundPlayer,
  canPlayAssistantSounds,
  getActiveAssistantSoundCountForTests,
  getCachedAssistantSoundCountForTests,
  markAssistantSoundInteraction,
  resetAssistantSoundPlaybackGapForTests,
  resetAssistantSoundStateForTests,
  resolveAssistantSoundSrc,
  __setAssistantSoundPipelineForTests,
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
      "officelogo",
      "saeko",
      "monkeyking",
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

/** Minimal Web Audio double for the assistant sound pipeline. */
class FakeAssistantAudioContext {
  state: AudioContextState = "running";
  destination = {} as AudioDestinationNode;
  decodeCount = 0;
  started: FakeBufferSource[] = [];

  decodeAudioData(_bytes: ArrayBuffer): Promise<AudioBuffer> {
    this.decodeCount += 1;
    return Promise.resolve({ duration: 0.25 } as AudioBuffer);
  }

  createGain() {
    return {
      gain: { value: 1 },
      connect() {},
      disconnect() {},
    } as unknown as GainNode;
  }

  createBufferSource() {
    const startedList = this.started;
    const source: FakeBufferSource = {
      buffer: null,
      onended: null,
      stopped: false,
      connect() {},
      start() {
        startedList.push(source);
      },
      stop() {
        source.stopped = true;
      },
    };
    return source as unknown as AudioBufferSourceNode;
  }
}

interface FakeBufferSource {
  buffer: AudioBuffer | null;
  onended: (() => void) | null;
  stopped: boolean;
  connect: (node: unknown) => void;
  start: (when?: number) => void;
  stop: () => void;
}

async function flushAsyncPlayback(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AssistantSoundPlayer (Web Audio)", () => {
  let context: FakeAssistantAudioContext;

  function installFakePipeline() {
    context = new FakeAssistantAudioContext();
    __setAssistantSoundPipelineForTests({
      resume: () => Promise.resolve(),
      getContext: () => context as unknown as AudioContext,
    });
  }

  afterEach(() => {
    __setAssistantSoundPipelineForTests(null);
    resetAssistantSoundStateForTests();
    useAudioSettingsStore.setState({ uiSoundsEnabled: true });
  });

  test("does not start playback before user interaction", async () => {
    installFakePipeline();
    const player = new AssistantSoundPlayer();
    player.loadCharacter("clippy");
    player.play("1");
    await flushAsyncPlayback();
    expect(context.started).toHaveLength(0);

    markAssistantSoundInteraction();
    player.play("1");
    await flushAsyncPlayback();
    expect(context.started).toHaveLength(1);
  });

  test("no-ops for unknown characters and sound ids", async () => {
    installFakePipeline();
    markAssistantSoundInteraction();
    const player = new AssistantSoundPlayer();
    player.loadCharacter("missing" as "clippy");
    player.play("1");
    resetAssistantSoundPlaybackGapForTests();
    player.loadCharacter("clippy");
    player.play("999");
    await flushAsyncPlayback();
    expect(context.started).toHaveLength(0);
    expect(context.decodeCount).toBe(0);
  });

  test("decodes clips lazily on play and reuses the cached buffer", async () => {
    installFakePipeline();
    markAssistantSoundInteraction();
    const player = new AssistantSoundPlayer();
    player.loadCharacter("rocky");
    expect(context.decodeCount).toBe(0);

    player.play("1");
    await flushAsyncPlayback();
    expect(context.decodeCount).toBe(1);
    expect(getCachedAssistantSoundCountForTests()).toBe(1);

    // Second play (and a remounted player) reuses the decoded buffer.
    const second = new AssistantSoundPlayer();
    second.loadCharacter("rocky");
    resetAssistantSoundPlaybackGapForTests();
    second.play("1");
    await flushAsyncPlayback();
    expect(context.decodeCount).toBe(1);
    expect(context.started).toHaveLength(2);
  });

  test("caps the shared decoded-clip cache", async () => {
    installFakePipeline();
    markAssistantSoundInteraction();
    const player = new AssistantSoundPlayer();
    player.loadCharacter("rocky");

    const soundIds = Object.keys(ASSISTANT_SOUND_MAPS.rocky);
    for (const soundId of soundIds) {
      resetAssistantSoundPlaybackGapForTests();
      player.play(soundId);
      await flushAsyncPlayback();
    }

    expect(getCachedAssistantSoundCountForTests()).toBeLessThanOrEqual(24);
  });

  test("caps concurrent clips and stopAll silences everything", async () => {
    installFakePipeline();
    markAssistantSoundInteraction();
    const player = new AssistantSoundPlayer();
    player.loadCharacter("clippy");

    const soundIds = Object.keys(ASSISTANT_SOUND_MAPS.clippy).slice(0, 3);
    for (const soundId of soundIds) {
      resetAssistantSoundPlaybackGapForTests();
      player.play(soundId);
      await flushAsyncPlayback();
    }
    expect(context.started).toHaveLength(3);
    expect(getActiveAssistantSoundCountForTests()).toBeLessThanOrEqual(2);

    player.stopAll();
    expect(getActiveAssistantSoundCountForTests()).toBe(0);
    for (const source of context.started) {
      expect(source.stopped).toBe(true);
    }
  });

  test("skips playback when the audio context is not running", async () => {
    installFakePipeline();
    context.state = "suspended";
    markAssistantSoundInteraction();
    const player = new AssistantSoundPlayer();
    player.loadCharacter("clippy");
    player.play("1");
    await flushAsyncPlayback();
    expect(context.started).toHaveLength(0);
  });
});
