import { Buffer } from "node:buffer";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  resetTtsDuckingForTests,
  startTtsDucking,
  stopTtsDucking,
  updateTtsDucking,
} from "../../../src/lib/audioDucking";
import {
  selectEffectiveChatSynthVolume,
  selectEffectiveIpodVolume,
  useAudioSettingsStore,
} from "../../../src/stores/useAudioSettingsStore";
import { base64FromBlob, bufferToBase64 } from "../../../src/utils/audio";

const resetAudioState = () => {
  resetTtsDuckingForTests();
  useAudioSettingsStore.setState({
    masterVolume: 1,
    uiVolume: 1,
    chatSynthVolume: 2,
    speechVolume: 2,
    ipodVolume: 1,
    ttsMusicDuckingFactor: 1,
    ttsChatSynthDuckingFactor: 1,
  });
};

describe("TTS audio ducking", () => {
  beforeEach(resetAudioState);
  afterEach(resetAudioState);

  test("uses temporary factors without mutating user volume sliders", () => {
    useAudioSettingsStore.getState().setMasterVolume(0.5);
    useAudioSettingsStore.getState().setIpodVolume(0.8);
    useAudioSettingsStore.getState().setChatSynthVolume(1.5);

    const first = startTtsDucking({ duckMusic: true });
    const second = startTtsDucking({ duckMusic: false });
    let state = useAudioSettingsStore.getState();

    expect(state.masterVolume).toBe(0.5);
    expect(state.ipodVolume).toBe(0.8);
    expect(state.chatSynthVolume).toBe(1.5);
    expect(selectEffectiveIpodVolume(state)).toBeCloseTo(0.8 * 0.5 * 0.35);
    expect(selectEffectiveChatSynthVolume(state)).toBeCloseTo(1.5 * 0.5 * 0.6);

    stopTtsDucking(first);
    state = useAudioSettingsStore.getState();
    expect(selectEffectiveIpodVolume(state)).toBeCloseTo(0.8 * 0.5);
    expect(selectEffectiveChatSynthVolume(state)).toBeCloseTo(1.5 * 0.5 * 0.6);

    stopTtsDucking(second);
    state = useAudioSettingsStore.getState();
    expect(selectEffectiveIpodVolume(state)).toBeCloseTo(0.8 * 0.5);
    expect(selectEffectiveChatSynthVolume(state)).toBeCloseTo(1.5 * 0.5);
  });

  test("updates an active speech session when music starts later", () => {
    const token = startTtsDucking({ duckMusic: false });
    let state = useAudioSettingsStore.getState();

    expect(state.ttsMusicDuckingFactor).toBe(1);
    expect(state.ttsChatSynthDuckingFactor).toBe(0.6);

    updateTtsDucking(token, { duckMusic: true });
    state = useAudioSettingsStore.getState();
    expect(state.ttsMusicDuckingFactor).toBe(0.35);
    expect(state.ttsChatSynthDuckingFactor).toBe(0.6);
  });
});

describe("audio base64 helpers", () => {
  test("encode large buffers without spreading the whole clip", async () => {
    const bytes = new Uint8Array(200_000);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = i % 251;
    }
    const expected = Buffer.from(bytes).toString("base64");

    expect(bufferToBase64(bytes.buffer)).toBe(expected);
    await expect(base64FromBlob(new Blob([bytes]))).resolves.toBe(expected);
  });
});
