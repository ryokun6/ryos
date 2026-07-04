/**
 * Unit tests for the unified browser TTS voice handling in
 * src/utils/browserSpeech.ts: quality-ranked automatic picks, profile
 * preferred-name resolution, the user-setting > profile > automatic
 * priority, and the createSpeechUtterance factory.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createSpeechUtterance,
  pickSpeechVoiceByName,
  pickSpeechVoiceForLanguage,
  resolveSpeechVoice,
  scoreSpeechVoiceQuality,
} from "../src/utils/browserSpeech";
import { useAudioSettingsStore } from "../src/stores/useAudioSettingsStore";

function voice(
  name: string,
  lang: string,
  extra?: Partial<SpeechSynthesisVoice>
): SpeechSynthesisVoice {
  return {
    name,
    lang,
    voiceURI: name,
    localService: true,
    default: false,
    ...extra,
  } as SpeechSynthesisVoice;
}

describe("scoreSpeechVoiceQuality", () => {
  test("ranks novelty/effect voices below everything else", () => {
    expect(scoreSpeechVoiceQuality(voice("Zarvox", "en-US"))).toBe(-1);
    expect(scoreSpeechVoiceQuality(voice("Bad News", "en-US"))).toBe(-1);
    expect(
      scoreSpeechVoiceQuality(voice("Grandma (English (US))", "en-US"))
    ).toBe(-1);
    expect(
      scoreSpeechVoiceQuality(voice("Samantha", "en-US"))
    ).toBeGreaterThan(0);
  });

  test("prefers Natural (Edge) > Microsoft/Apple system > Google voices", () => {
    const natural = scoreSpeechVoiceQuality(
      voice("Microsoft Aria Online (Natural) - English (United States)", "en-US")
    );
    const microsoft = scoreSpeechVoiceQuality(
      voice("Microsoft Zira - English (United States)", "en-US")
    );
    const apple = scoreSpeechVoiceQuality(voice("Samantha", "en-US"));
    const google = scoreSpeechVoiceQuality(voice("Google US English", "en-US"));
    const unknown = scoreSpeechVoiceQuality(voice("Mystery Voice", "en-US"));
    expect(natural).toBeGreaterThan(microsoft);
    expect(microsoft).toBeGreaterThan(google);
    expect(apple).toBeGreaterThan(google);
    expect(google).toBeGreaterThan(unknown);
  });
});

describe("pickSpeechVoiceForLanguage (quality-ranked automatic pick)", () => {
  test("never auto-picks a macOS novelty voice when a real one exists", () => {
    const voices = [
      voice("Albert", "en-US"),
      voice("Bells", "en-US"),
      voice("Samantha", "en-US"),
    ];
    expect(pickSpeechVoiceForLanguage(voices, "en-US")?.name).toBe("Samantha");
  });

  test("exact region match still beats a better-quality other region", () => {
    const voices = [
      voice("Google UK English Female", "en-GB"),
      voice("Mystery Voice", "en-US"),
    ];
    expect(pickSpeechVoiceForLanguage(voices, "en-US")?.name).toBe(
      "Mystery Voice"
    );
  });

  test("prefers the platform's known-good voice within a language", () => {
    const voices = [
      voice("Some Random Voice", "en-US"),
      voice("Microsoft David - English (United States)", "en-US"),
      voice("Google US English", "en-US"),
    ];
    expect(pickSpeechVoiceForLanguage(voices, "en-US")?.name).toBe(
      "Microsoft David - English (United States)"
    );
  });

  test("falls back to the only voice for a language even if novelty", () => {
    const voices = [voice("Zarvox", "en-US"), voice("Kyoko", "ja-JP")];
    expect(pickSpeechVoiceForLanguage(voices, "en-US")?.name).toBe("Zarvox");
  });
});

describe("pickSpeechVoiceByName (profile preferences)", () => {
  const voices = [
    voice("Samantha", "en-US"),
    voice("Daniel (English (United Kingdom))", "en-GB"),
    voice("Kyoko", "ja-JP"),
  ];

  test("matches names as case-insensitive substrings, in order", () => {
    expect(
      pickSpeechVoiceByName(voices, "en-US", ["daniel", "Samantha"])?.name
    ).toBe("Daniel (English (United Kingdom))");
    expect(
      pickSpeechVoiceByName(voices, "en-US", ["Samantha", "Daniel"])?.name
    ).toBe("Samantha");
  });

  test("is language-gated: skips preferred names in another language", () => {
    expect(pickSpeechVoiceByName(voices, "ja-JP", ["Samantha", "Kyoko"])?.name).toBe(
      "Kyoko"
    );
    expect(pickSpeechVoiceByName(voices, "de-DE", ["Samantha"])).toBeNull();
  });
});

describe("resolveSpeechVoice priority", () => {
  const voices = [
    voice("Samantha", "en-US"),
    voice("Daniel (English (United Kingdom))", "en-GB"),
    voice("Kyoko", "ja-JP"),
  ];

  test("user-selected voice wins over profile preferred names", () => {
    expect(
      resolveSpeechVoice(voices, "en-US", "Samantha", ["Daniel"])?.name
    ).toBe("Samantha");
  });

  test("profile preferred names win over the automatic pick", () => {
    expect(resolveSpeechVoice(voices, "en-US", null, ["Daniel"])?.name).toBe(
      "Daniel (English (United Kingdom))"
    );
  });

  test("language-mismatched user voice falls back to profile names", () => {
    expect(
      resolveSpeechVoice(voices, "ja-JP", "Samantha", ["Kyoko"])?.name
    ).toBe("Kyoko");
  });

  test("falls back to the automatic pick when nothing matches", () => {
    expect(resolveSpeechVoice(voices, "en-US", "missing", ["Nadia"])?.name).toBe(
      "Samantha"
    );
  });
});

describe("createSpeechUtterance", () => {
  class FakeUtterance {
    text: string;
    lang = "";
    rate = 1;
    pitch = 1;
    volume = 1;
    voice: SpeechSynthesisVoice | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }

  const g = globalThis as Record<string, unknown>;
  const originalUtterance = g.SpeechSynthesisUtterance;
  const voices = [
    voice("Samantha", "en-US"),
    voice("Daniel (English (United Kingdom))", "en-GB"),
  ];

  beforeEach(() => {
    g.SpeechSynthesisUtterance = FakeUtterance;
    useAudioSettingsStore.setState({ browserTtsVoiceURI: null });
  });

  afterEach(() => {
    g.SpeechSynthesisUtterance = originalUtterance;
    useAudioSettingsStore.setState({ browserTtsVoiceURI: null });
  });

  test("applies profile voice, pitch, and rate", () => {
    const utterance = createSpeechUtterance("Greetings!", {
      lang: "en-US",
      voices,
      profile: { preferredVoiceNames: ["Daniel"], pitch: 0.8, rate: 0.95 },
    }) as unknown as FakeUtterance;
    expect(utterance.lang).toBe("en-US");
    expect(utterance.voice?.name).toBe("Daniel (English (United Kingdom))");
    expect(utterance.pitch).toBe(0.8);
    expect(utterance.rate).toBe(0.95);
  });

  test("explicit rate overrides the profile rate", () => {
    const utterance = createSpeechUtterance("Fast.", {
      lang: "en-US",
      voices,
      rate: 1.5,
      profile: { rate: 0.9 },
    }) as unknown as FakeUtterance;
    expect(utterance.rate).toBe(1.5);
  });

  test("the user's preferred voice from settings beats the profile", () => {
    useAudioSettingsStore.setState({ browserTtsVoiceURI: "Samantha" });
    const utterance = createSpeechUtterance("Hello.", {
      lang: "en-US",
      voices,
      profile: { preferredVoiceNames: ["Daniel"] },
    }) as unknown as FakeUtterance;
    expect(utterance.voice?.name).toBe("Samantha");
  });

  test("without profile or setting, uses the automatic language pick", () => {
    const utterance = createSpeechUtterance("Hello.", {
      lang: "en-US",
      voices,
    }) as unknown as FakeUtterance;
    expect(utterance.voice?.name).toBe("Samantha");
    expect(utterance.pitch).toBe(1);
    expect(utterance.rate).toBe(1);
  });
});
