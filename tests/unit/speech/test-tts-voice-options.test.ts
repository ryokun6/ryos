import { describe, expect, test } from "bun:test";
import { DEFAULT_ELEVENLABS_VOICE_ID } from "../../../api/_utils/voice";
import {
  ELEVENLABS_TTS_VOICES,
  getSpeechPlaybackVolume,
  getTtsPlaybackGain,
  getTtsVoiceLabel,
  RYO_PVC_PLAYBACK_GAIN,
  RYO_PVC_VOICE_ID,
} from "../../../src/apps/control-panels/components/control-panels-app/ttsVoiceOptions";
import en from "../../../src/lib/locales/en/translation.json";

const RYO_INSTANT_V4_VOICE_ID = "oYLmJyxUFvewUpYziJlr";

describe("ElevenLabs TTS voice options", () => {
  test("lists Ryo PVC first and uses it as the default ElevenLabs voice", () => {
    expect(ELEVENLABS_TTS_VOICES[0]).toEqual({
      value: RYO_PVC_VOICE_ID,
      labelKey: "apps.control-panels.ttsVoices.ryoPvc",
    });
    expect(ELEVENLABS_TTS_VOICES[1]).toEqual({
      value: RYO_INSTANT_V4_VOICE_ID,
      labelKey: "apps.control-panels.ttsVoices.ryoInstantV4",
    });
    expect(ELEVENLABS_TTS_VOICES.map((voice) => voice.value)).toEqual([
      RYO_PVC_VOICE_ID,
      RYO_INSTANT_V4_VOICE_ID,
      "YC3iw27qriLq7UUaqAyi",
      "kAyjEabBEu68HYYYRAHR",
      "G0mlS0y8ByHjGAOxBgvV",
    ]);
    expect(DEFAULT_ELEVENLABS_VOICE_ID).toBe(RYO_PVC_VOICE_ID);
    expect(DEFAULT_ELEVENLABS_VOICE_ID).not.toBe(RYO_INSTANT_V4_VOICE_ID);
    expect(DEFAULT_ELEVENLABS_VOICE_ID).not.toBe("kAyjEabBEu68HYYYRAHR");
  });

  test("resolves the PVC and Instant v4 picker labels", () => {
    const labels = en.apps["control-panels"].ttsVoices;
    expect(labels.ryoPvc).toBe("Ryo PVC");
    expect(labels.ryoInstantV4).toBe("Ryo Instant v4");

    const t = (key: string) => {
      const suffix = key.split(".").pop();
      return suffix && suffix in labels
        ? labels[suffix as keyof typeof labels]
        : key;
    };

    expect(getTtsVoiceLabel(t, "elevenlabs", RYO_PVC_VOICE_ID, "select")).toBe(
      "Ryo PVC"
    );
    expect(
      getTtsVoiceLabel(t, "elevenlabs", RYO_INSTANT_V4_VOICE_ID, "select")
    ).toBe("Ryo Instant v4");
    expect(getTtsVoiceLabel(t, "elevenlabs", null, "select")).toBe("select");
  });

  test("applies a PVC-only playback gain without changing other voices", () => {
    expect(RYO_PVC_VOICE_ID).toBe("OHP6tMHkOsRKrsDdbPah");
    expect(RYO_PVC_PLAYBACK_GAIN).toBe(0.6);
    expect(getTtsPlaybackGain("elevenlabs", RYO_PVC_VOICE_ID)).toBe(0.6);
    expect(getTtsPlaybackGain(null, null)).toBe(0.6);
    expect(getTtsPlaybackGain("elevenlabs", null)).toBe(0.6);
    expect(getTtsPlaybackGain("elevenlabs", RYO_INSTANT_V4_VOICE_ID)).toBe(1);
    expect(getTtsPlaybackGain("openai", RYO_PVC_VOICE_ID)).toBe(1);
    expect(getSpeechPlaybackVolume(2, 1, null, null)).toBe(1.2);
    expect(getSpeechPlaybackVolume(2, 1, "elevenlabs", RYO_INSTANT_V4_VOICE_ID)).toBe(
      2
    );
  });
});
