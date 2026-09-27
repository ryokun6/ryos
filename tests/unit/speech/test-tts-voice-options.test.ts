import { describe, expect, test } from "bun:test";
import { DEFAULT_ELEVENLABS_VOICE_ID } from "../../../api/_utils/voice";
import {
  ELEVENLABS_TTS_VOICES,
  getTtsVoiceLabel,
} from "../../../src/apps/control-panels/components/control-panels-app/ttsVoiceOptions";
import en from "../../../src/lib/locales/en/translation.json";

const RYO_INSTANT_V4_VOICE_ID = "oYLmJyxUFvewUpYziJlr";

describe("ElevenLabs TTS voice options", () => {
  test("lists Ryo Instant v4 without changing the default ElevenLabs voice", () => {
    expect(ELEVENLABS_TTS_VOICES[0]).toEqual({
      value: RYO_INSTANT_V4_VOICE_ID,
      labelKey: "apps.control-panels.ttsVoices.ryoInstantV4",
    });
    expect(ELEVENLABS_TTS_VOICES.map((voice) => voice.value)).toEqual([
      RYO_INSTANT_V4_VOICE_ID,
      "YC3iw27qriLq7UUaqAyi",
      "kAyjEabBEu68HYYYRAHR",
      "G0mlS0y8ByHjGAOxBgvV",
    ]);
    expect(DEFAULT_ELEVENLABS_VOICE_ID).toBe("kAyjEabBEu68HYYYRAHR");
    expect(DEFAULT_ELEVENLABS_VOICE_ID).not.toBe(RYO_INSTANT_V4_VOICE_ID);
  });

  test("resolves the Instant v4 picker label", () => {
    const labels = en.apps["control-panels"].ttsVoices;
    expect(labels.ryoInstantV4).toBe("Ryo Instant v4");

    const t = (key: string) => {
      const suffix = key.split(".").pop();
      return suffix && suffix in labels
        ? labels[suffix as keyof typeof labels]
        : key;
    };

    expect(
      getTtsVoiceLabel(t, "elevenlabs", RYO_INSTANT_V4_VOICE_ID, "select")
    ).toBe("Ryo Instant v4");
    expect(getTtsVoiceLabel(t, "elevenlabs", null, "select")).toBe("select");
  });
});
