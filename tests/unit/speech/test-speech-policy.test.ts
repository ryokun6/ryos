import { describe, expect, test } from "bun:test";
import {
  evaluateRyoVoiceGate,
  isRyoElevenLabsVoiceId,
  requestResolvesToRyoVoice,
  RYO_CHAT_SPEECH_SOURCE,
  RYO_ELEVENLABS_VOICE_IDS as SERVER_RYO_VOICE_IDS,
} from "../../../api/_utils/speech-policy";
import { DEFAULT_ELEVENLABS_VOICE_ID, DEFAULT_TTS_MODEL } from "../../../api/_utils/voice";
import { ELEVENLABS_TTS_VOICES } from "../../../src/apps/control-panels/components/control-panels-app/ttsVoiceOptions";
import {
  buildSpeechApiRequestBody,
  isRyoElevenLabsVoiceId as clientIsRyoVoice,
  requestResolvesToRyoVoice as clientRequestResolvesToRyoVoice,
  RYO_CHAT_SPEECH_SOURCE as CLIENT_RYO_CHAT_SOURCE,
  RYO_ELEVENLABS_VOICE_IDS as CLIENT_RYO_VOICE_IDS,
} from "../../../src/utils/speechPolicy";

const RYO_PVC = "OHP6tMHkOsRKrsDdbPah";
const RYO_INSTANT_V4 = "oYLmJyxUFvewUpYziJlr";
const RYO_V3 = "YC3iw27qriLq7UUaqAyi";
const RYO_V2 = "kAyjEabBEu68HYYYRAHR";
const RYO_LEGACY = "G0mlS0y8ByHjGAOxBgvV";

describe("Ryo voice policy", () => {
  test("client and server lists stay in sync with Control Panels Ryo voices", () => {
    expect([...SERVER_RYO_VOICE_IDS]).toEqual([
      RYO_PVC,
      RYO_INSTANT_V4,
      RYO_V3,
      RYO_V2,
      RYO_LEGACY,
    ]);
    expect(CLIENT_RYO_VOICE_IDS).toEqual([...SERVER_RYO_VOICE_IDS]);
    expect(ELEVENLABS_TTS_VOICES.map((voice) => voice.value)).toEqual([
      ...SERVER_RYO_VOICE_IDS,
    ]);
    expect(DEFAULT_ELEVENLABS_VOICE_ID).toBe(RYO_PVC);
    expect(DEFAULT_TTS_MODEL).toBe("elevenlabs");
    expect(CLIENT_RYO_CHAT_SOURCE).toBe(RYO_CHAT_SPEECH_SOURCE);
    expect(CLIENT_RYO_CHAT_SOURCE).toBe("ryo-chat");
  });

  test("identifies every shipped Ryo ElevenLabs voice id", () => {
    for (const id of SERVER_RYO_VOICE_IDS) {
      expect(isRyoElevenLabsVoiceId(id)).toBe(true);
      expect(clientIsRyoVoice(id)).toBe(true);
    }
    expect(isRyoElevenLabsVoiceId(null)).toBe(false);
    expect(isRyoElevenLabsVoiceId("alloy")).toBe(false);
  });

  test("Control Panels Default (unset model) resolves to a Ryo voice", () => {
    expect(requestResolvesToRyoVoice(null, null)).toBe(true);
    expect(requestResolvesToRyoVoice(undefined, undefined)).toBe(true);
    expect(requestResolvesToRyoVoice("elevenlabs", null)).toBe(true);
    expect(requestResolvesToRyoVoice("elevenlabs", RYO_INSTANT_V4)).toBe(true);
    expect(requestResolvesToRyoVoice("openai", "alloy")).toBe(false);
    expect(requestResolvesToRyoVoice("openai", RYO_PVC)).toBe(true);
    expect(clientRequestResolvesToRyoVoice(null, null)).toBe(true);
    expect(clientRequestResolvesToRyoVoice("openai", "nova")).toBe(false);
  });

  test("server allows Ryo voices only for ryo-chat source", () => {
    expect(
      evaluateRyoVoiceGate({
        model: "elevenlabs",
        voice_id: RYO_PVC,
        source: "ryo-chat",
      }).allowed
    ).toBe(true);
    expect(
      evaluateRyoVoiceGate({
        model: null,
        voice_id: null,
        source: "ryo-chat",
      }).allowed
    ).toBe(true);
    expect(
      evaluateRyoVoiceGate({
        model: "elevenlabs",
        voice_id: RYO_INSTANT_V4,
        source: "ryo-chat",
      }).allowed
    ).toBe(true);

    const rejectedDefault = evaluateRyoVoiceGate({});
    expect(rejectedDefault.allowed).toBe(false);
    if (!rejectedDefault.allowed) {
      expect(rejectedDefault.error).toBe("ryo_voice_forbidden");
    }

    for (const source of [null, undefined, "textedit", "maps", "books", ""]) {
      const result = evaluateRyoVoiceGate({
        model: "elevenlabs",
        voice_id: RYO_PVC,
        source,
      });
      expect(result.allowed).toBe(false);
    }

    expect(
      evaluateRyoVoiceGate({
        model: "openai",
        voice_id: null,
        source: "textedit",
      }).allowed
    ).toBe(true);
  });

  test("client request builder sends ryo-chat + Control Panels Default for chat", () => {
    const body = buildSpeechApiRequestBody({
      text: "hello from ryo",
      source: "ryo-chat",
      ttsModel: null,
      ttsVoice: null,
    });
    expect(body).toEqual({
      text: "hello from ryo",
      source: "ryo-chat",
      model: null,
    });
  });

  test("client request builder preserves explicit PVC and Instant v4 for chat", () => {
    expect(
      buildSpeechApiRequestBody({
        text: "pvc",
        source: "ryo-chat",
        ttsModel: "elevenlabs",
        ttsVoice: RYO_PVC,
      })
    ).toEqual({
      text: "pvc",
      source: "ryo-chat",
      model: "elevenlabs",
      voice_id: RYO_PVC,
    });
    expect(
      buildSpeechApiRequestBody({
        text: "instant",
        source: "ryo-chat",
        ttsModel: "elevenlabs",
        ttsVoice: RYO_INSTANT_V4,
      })
    ).toEqual({
      text: "instant",
      source: "ryo-chat",
      model: "elevenlabs",
      voice_id: RYO_INSTANT_V4,
    });
  });

  test("client request builder refuses Ryo / Default ElevenLabs for non-chat sources", () => {
    expect(
      buildSpeechApiRequestBody({
        text: "free form",
        source: "textedit",
        ttsModel: null,
        ttsVoice: null,
      })
    ).toEqual({ error: "ryo_voice_forbidden" });
    expect(
      buildSpeechApiRequestBody({
        text: "nav",
        source: "maps",
        ttsModel: "elevenlabs",
        ttsVoice: RYO_PVC,
      })
    ).toEqual({ error: "ryo_voice_forbidden" });
  });

  test("client request builder still allows OpenAI for non-chat sources", () => {
    expect(
      buildSpeechApiRequestBody({
        text: "openai path",
        source: "textedit",
        ttsModel: "openai",
        ttsVoice: "alloy",
      })
    ).toEqual({
      text: "openai path",
      source: "textedit",
      model: "openai",
      voice: "alloy",
    });
  });
});
