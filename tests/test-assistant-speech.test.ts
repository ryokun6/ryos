import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  prepareAssistantSpeechTexts,
  speakAssistantText,
  stopAssistantSpeech,
  __resetAssistantSpeechStateForTests,
} from "../src/components/assistant/assistantSpeech";
import { useAudioSettingsStore } from "../src/stores/useAudioSettingsStore";
import { useAssistantStore } from "../src/stores/useAssistantStore";

describe("prepareAssistantSpeechTexts", () => {
  test("splits a reply into sentence utterances", () => {
    expect(prepareAssistantSpeechTexts("Hello there! I can help. 你好。")).toEqual(
      ["Hello there!", "I can help.", "你好。"]
    );
  });

  test("keeps markdown link labels but drops bare URLs", () => {
    expect(
      prepareAssistantSpeechTexts(
        "Open [the docs](https://example.com/docs) or https://example.com directly."
      )
    ).toEqual(["Open the docs or directly."]);
  });

  test("strips code blocks and HTML entirely", () => {
    expect(
      prepareAssistantSpeechTexts("Try this:\n```js\nconsole.log(1)\n```\n<b>Done!</b>")
    ).toEqual(["Try this: Done!"]);
  });

  test("returns nothing for code-only or empty replies", () => {
    expect(prepareAssistantSpeechTexts("```js\nlet a = 1;\n```")).toEqual([]);
    expect(prepareAssistantSpeechTexts("   ")).toEqual([]);
  });

  test("splits overlong sentences at word boundaries", () => {
    const long = `${"word ".repeat(80)}end.`;
    const texts = prepareAssistantSpeechTexts(long);
    expect(texts.length).toBeGreaterThan(1);
    for (const text of texts) {
      expect(text.length).toBeLessThanOrEqual(240);
    }
  });
});

class FakeUtterance {
  text: string;
  lang = "";
  rate = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

describe("assistant speech playback", () => {
  const g = globalThis as Record<string, unknown>;
  const originalWindow = g.window;
  const originalUtterance = g.SpeechSynthesisUtterance;
  let spoken: FakeUtterance[];
  let cancelCount: number;
  let fakeVoices: SpeechSynthesisVoice[];

  beforeEach(() => {
    spoken = [];
    cancelCount = 0;
    fakeVoices = [];
    const synth = {
      speak: (utterance: FakeUtterance) => {
        spoken.push(utterance);
      },
      cancel: () => {
        cancelCount += 1;
      },
      resume: () => {},
      getVoices: () => fakeVoices,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    g.window = globalThis;
    g.speechSynthesis = synth;
    g.SpeechSynthesisUtterance = FakeUtterance;
    __resetAssistantSpeechStateForTests();
  });

  afterEach(() => {
    // Flush pending utterance-timeout timers via onend before teardown.
    stopAssistantSpeech();
    spoken.forEach((utterance) => utterance.onend?.());
    __resetAssistantSpeechStateForTests();
    useAudioSettingsStore.setState({ browserTtsVoiceURI: null });
    g.window = originalWindow;
    g.SpeechSynthesisUtterance = originalUtterance;
    delete g.speechSynthesis;
  });

  test("speaks the first utterance synchronously (user-gesture unlock)", () => {
    speakAssistantText("Hello there!", { locale: "en" });
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe("Hello there!");
    expect(spoken[0].lang).toBe("en-US");
  });

  test("chains sentence utterances as each one ends", () => {
    speakAssistantText("First sentence. Second sentence.", { locale: "en" });
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe("First sentence.");
    spoken[0].onend?.();
    expect(spoken).toHaveLength(2);
    expect(spoken[1].text).toBe("Second sentence.");
  });

  test("a new reply cancels and replaces the previous one", () => {
    speakAssistantText("Old reply. With a tail.", { locale: "en" });
    speakAssistantText("New reply.", { locale: "en" });
    expect(cancelCount).toBe(2);
    expect(spoken.map((utterance) => utterance.text)).toEqual([
      "Old reply.",
      "New reply.",
    ]);
    // The stale utterance's end handler must not resurrect the old chain.
    spoken[0].onend?.();
    expect(spoken).toHaveLength(2);
  });

  test("stopAssistantSpeech cancels and drops queued utterances", () => {
    speakAssistantText("One. Two.", { locale: "en" });
    stopAssistantSpeech();
    expect(cancelCount).toBe(2);
    spoken[0].onend?.();
    expect(spoken).toHaveLength(1);
  });

  test("maps the ryOS locale onto the utterance language", () => {
    speakAssistantText("こんにちは。", { locale: "ja" });
    expect(spoken).toHaveLength(1);
    expect(spoken[0].lang).toBe("ja-JP");
  });

  test("honors the preferred browser TTS voice from audio settings", () => {
    fakeVoices = [
      { voiceURI: "us", lang: "en-US", name: "English US" },
      { voiceURI: "uk", lang: "en-GB", name: "English UK" },
    ] as SpeechSynthesisVoice[];
    useAudioSettingsStore.setState({ browserTtsVoiceURI: "uk" });

    speakAssistantText("Hello.", { locale: "en" });
    expect(spoken).toHaveLength(1);
    expect((spoken[0].voice as SpeechSynthesisVoice).name).toBe("English UK");
  });
});

describe("assistant store speech setting", () => {
  test("speechEnabled defaults off and toggles via setSpeechEnabled", () => {
    expect(useAssistantStore.getState().speechEnabled).toBe(false);
    useAssistantStore.getState().setSpeechEnabled(true);
    expect(useAssistantStore.getState().speechEnabled).toBe(true);
    useAssistantStore.getState().setSpeechEnabled(false);
    expect(useAssistantStore.getState().speechEnabled).toBe(false);
  });
});
