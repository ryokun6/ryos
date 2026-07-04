import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  prepareAssistantSpeechTexts,
  primeAssistantSpeech,
  speakAssistantText,
  stopAssistantSpeech,
  __resetAssistantSpeechStateForTests,
} from "../src/components/assistant/assistantSpeech";
import {
  AssistantSoundPlayer,
  markAssistantSoundInteraction,
  resetAssistantSoundStateForTests,
  __setAssistantSoundPipelineForTests,
} from "../src/components/assistant/assistantSounds";
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
  pitch = 1;
  volume = 1;
  voice: unknown = null;
  onstart: (() => void) | null = null;
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
  let synth: {
    speaking: boolean;
    pending: boolean;
    speak: (utterance: FakeUtterance) => void;
    cancel: () => void;
    resume: () => void;
    getVoices: () => SpeechSynthesisVoice[];
    addEventListener: () => void;
    removeEventListener: () => void;
  };

  beforeEach(() => {
    spoken = [];
    cancelCount = 0;
    fakeVoices = [];
    synth = {
      speaking: false,
      pending: false,
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
    useAssistantStore.setState({ characterId: "rover" });
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

  test("applies the character's default voice profile (voice, pitch, rate)", () => {
    fakeVoices = [
      { voiceURI: "sam", lang: "en-US", name: "Samantha" },
      {
        voiceURI: "dan",
        lang: "en-GB",
        name: "Daniel (English (United Kingdom))",
      },
    ] as SpeechSynthesisVoice[];
    useAssistantStore.setState({ characterId: "merlin" });

    speakAssistantText("Behold!", { locale: "en" });
    expect(spoken).toHaveLength(1);
    // Merlin defaults to a deep UK male voice, lowered pitch, slower rate.
    expect((spoken[0].voice as SpeechSynthesisVoice).name).toBe(
      "Daniel (English (United Kingdom))"
    );
    expect(spoken[0].pitch).toBe(0.8);
    expect(spoken[0].rate).toBe(0.95);
  });

  test("character voice preferences are language-gated", () => {
    fakeVoices = [
      { voiceURI: "sam", lang: "en-US", name: "Samantha" },
      { voiceURI: "kyoko", lang: "ja-JP", name: "Kyoko" },
    ] as SpeechSynthesisVoice[];
    useAssistantStore.setState({ characterId: "saeko" });

    // Speaking Japanese, Saeko prefers the Japanese voice…
    speakAssistantText("こんにちは。", { locale: "ja" });
    expect((spoken[0].voice as SpeechSynthesisVoice).name).toBe("Kyoko");

    // …and falls back to a female English voice for English replies.
    speakAssistantText("Hello.", { locale: "en" });
    expect((spoken[1].voice as SpeechSynthesisVoice).name).toBe("Samantha");
  });

  test("the user's preferred voice overrides the character default", () => {
    fakeVoices = [
      { voiceURI: "sam", lang: "en-US", name: "Samantha" },
      {
        voiceURI: "dan",
        lang: "en-GB",
        name: "Daniel (English (United Kingdom))",
      },
    ] as SpeechSynthesisVoice[];
    useAssistantStore.setState({ characterId: "merlin" });
    useAudioSettingsStore.setState({ browserTtsVoiceURI: "sam" });

    speakAssistantText("Behold!", { locale: "en" });
    expect((spoken[0].voice as SpeechSynthesisVoice).name).toBe("Samantha");
    // Persona pitch/rate still apply — only the voice choice is overridden.
    expect(spoken[0].pitch).toBe(0.8);
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

  test("primeAssistantSpeech retries the muted unlock until an utterance starts", () => {
    primeAssistantSpeech();
    expect(spoken).toHaveLength(1);
    expect(spoken[0].volume).toBe(0);
    // Priming must not cancel anything (it runs on arbitrary gestures).
    expect(cancelCount).toBe(0);

    // The engine never confirmed a start (iOS drops blocked speak() calls
    // silently, with no event), so the next gesture retries the unlock.
    primeAssistantSpeech();
    expect(spoken).toHaveLength(2);
    expect(spoken[1].volume).toBe(0);

    // A started utterance proves synthesis is unlocked; priming becomes a
    // no-op from then on.
    spoken[1].onstart?.();
    primeAssistantSpeech();
    expect(spoken).toHaveLength(2);
  });

  test("primeAssistantSpeech never piles onto a pending queue", () => {
    synth.pending = true;
    primeAssistantSpeech();
    expect(spoken).toHaveLength(0);
    expect(cancelCount).toBe(0);
    // The queue draining re-enables the unlock attempt on the next gesture.
    synth.pending = false;
    primeAssistantSpeech();
    expect(spoken).toHaveLength(1);
  });

  test("primeAssistantSpeech skips the muted utterance while speech is active", () => {
    synth.speaking = true;
    primeAssistantSpeech();
    expect(spoken).toHaveLength(0);
    // Active speech already proves synthesis is unlocked, so later gestures
    // stay no-ops too.
    synth.speaking = false;
    primeAssistantSpeech();
    expect(spoken).toHaveLength(0);
  });

  test("real speech still plays after priming", () => {
    primeAssistantSpeech();
    speakAssistantText("Hello there!", { locale: "en" });
    expect(spoken.map((utterance) => utterance.text)).toEqual([
      " ",
      "Hello there!",
    ]);
    expect(spoken[1].volume).toBe(1);
  });

  test("a reply dropped outside a gesture is re-spoken by the next priming gesture", () => {
    speakAssistantText("Hello there!", { locale: "en" });
    expect(spoken).toHaveLength(1);

    // The engine never started the utterance (iOS blocked the speak() made
    // outside a gesture), so the priming gesture re-speaks the reply at full
    // volume instead of a muted unlock utterance.
    primeAssistantSpeech();
    expect(spoken.map((utterance) => utterance.text)).toEqual([
      "Hello there!",
      "Hello there!",
    ]);
    expect(spoken[1].volume).toBe(1);

    // Once it audibly starts, later gestures stop re-speaking it.
    spoken[1].onstart?.();
    primeAssistantSpeech();
    expect(spoken).toHaveLength(2);
  });

  test("a reply that already started is not re-spoken by later gestures", () => {
    speakAssistantText("Hello there!", { locale: "en" });
    spoken[0].onstart?.();
    primeAssistantSpeech();
    expect(spoken).toHaveLength(1);
  });

  test("priming re-speaks only the newest dropped reply", () => {
    speakAssistantText("Old reply.", { locale: "en" });
    speakAssistantText("New reply.", { locale: "en" });
    primeAssistantSpeech();
    expect(spoken.map((utterance) => utterance.text)).toEqual([
      "Old reply.",
      "New reply.",
      "New reply.",
    ]);
  });

  test("stopping speech clears the dropped reply", () => {
    speakAssistantText("Hello there!", { locale: "en" });
    stopAssistantSpeech();
    primeAssistantSpeech();
    expect(spoken).toHaveLength(2);
    // The priming gesture unlocks silently instead of resurrecting the
    // stopped reply.
    expect(spoken[1].volume).toBe(0);
  });

  test("audible speech unlocks synthesis and drops the stale reply", () => {
    speakAssistantText("Hello there!", { locale: "en" });
    // Another feature's speech is audible (e.g. Books read-aloud): priming
    // must not barge in over it with the stale assistant reply.
    synth.speaking = true;
    primeAssistantSpeech();
    expect(spoken).toHaveLength(1);
    expect(cancelCount).toBe(1);

    synth.speaking = false;
    primeAssistantSpeech();
    expect(spoken).toHaveLength(1);
  });
});

describe("assistant sound effects coexist with speech", () => {
  const g = globalThis as Record<string, unknown>;
  const originalWindow = g.window;
  const originalUtterance = g.SpeechSynthesisUtterance;
  let spoken: FakeUtterance[];
  let started: Array<{ stopped: boolean }>;

  beforeEach(() => {
    spoken = [];
    started = [];
    const synth = {
      speak: (utterance: FakeUtterance) => {
        spoken.push(utterance);
      },
      cancel: () => {},
      resume: () => {},
      getVoices: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    g.window = globalThis;
    g.speechSynthesis = synth;
    g.SpeechSynthesisUtterance = FakeUtterance;
    const fakeContext = {
      state: "running",
      destination: {},
      decodeAudioData: () => Promise.resolve({ duration: 0.25 } as AudioBuffer),
      createGain: () => ({
        gain: { value: 1 },
        connect() {},
        disconnect() {},
      }),
      createBufferSource: () => {
        const source = {
          buffer: null as AudioBuffer | null,
          onended: null as (() => void) | null,
          stopped: false,
          connect() {},
          start() {
            started.push(source);
          },
          stop() {
            source.stopped = true;
          },
        };
        return source;
      },
    };
    __setAssistantSoundPipelineForTests({
      resume: () => Promise.resolve(),
      getContext: () => fakeContext as unknown as AudioContext,
    });
    __resetAssistantSpeechStateForTests();
    resetAssistantSoundStateForTests();
    markAssistantSoundInteraction();
    useAudioSettingsStore.setState({ uiSoundsEnabled: true });
  });

  afterEach(() => {
    stopAssistantSpeech();
    spoken.forEach((utterance) => utterance.onend?.());
    __setAssistantSoundPipelineForTests(null);
    __resetAssistantSpeechStateForTests();
    resetAssistantSoundStateForTests();
    g.window = originalWindow;
    g.SpeechSynthesisUtterance = originalUtterance;
    delete g.speechSynthesis;
  });

  test("animation sound effects play while speech is active (Web Audio mix)", async () => {
    const player = new AssistantSoundPlayer();
    player.loadCharacter("clippy");

    speakAssistantText("A long reply.", { locale: "en" });
    expect(spoken).toHaveLength(1);

    player.play("1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toHaveLength(1);
    expect(started[0].stopped).toBe(false);
  });

  test("starting speech leaves an in-flight effect playing", async () => {
    const player = new AssistantSoundPlayer();
    player.loadCharacter("clippy");
    player.play("1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toHaveLength(1);

    speakAssistantText("Hello.", { locale: "en" });
    expect(started[0].stopped).toBe(false);
    expect(spoken).toHaveLength(1);
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
