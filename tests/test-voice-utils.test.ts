import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ELEVENLABS_MODEL_ID,
  DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  DEFAULT_ELEVENLABS_VOICE_ID,
  generateElevenLabsSpeech,
  transcribeAudioBuffer,
} from "../api/_utils/voice";

describe("voice utils", () => {
  test("transcribeAudioBuffer uses the provided file metadata", async () => {
    const result = await transcribeAudioBuffer({
      buffer: new Uint8Array([1, 2, 3]),
      fileName: "telegram-voice.ogg",
      mimeType: "audio/ogg",
      deps: {
        toFileImpl: async (buffer, name, options) => ({
          buffer,
          name,
          type: options?.type,
        }) as Awaited<ReturnType<typeof import("openai/uploads").toFile>>,
        createTranscription: async ({ file, model }) => {
          expect(model).toBe("whisper-1");
          expect((file as { name?: string }).name).toBe("telegram-voice.ogg");
          expect((file as { type?: string }).type).toBe("audio/ogg");
          return { text: "hello from voice" };
        },
      },
    });

    expect(result).toBe("hello from voice");
  });

  test("generateElevenLabsSpeech uses the default voice configuration", async () => {
    const audio = await generateElevenLabsSpeech({
      text: "hello world",
      apiKey: "test-elevenlabs-key",
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe(
          `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_ELEVENLABS_VOICE_ID}/stream`
        );
        expect(init?.method).toBe("POST");
        expect((init?.headers as Record<string, string>)["xi-api-key"]).toBe(
          "test-elevenlabs-key"
        );

        const body = JSON.parse(String(init?.body));
        expect(body.text).toBe("hello world");
        expect(body.model_id).toBe(DEFAULT_ELEVENLABS_MODEL_ID);
        expect(body.output_format).toBe(DEFAULT_ELEVENLABS_OUTPUT_FORMAT);

        return new Response(new Uint8Array([7, 8, 9]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        });
      },
    });

    expect(new Uint8Array(audio)).toEqual(new Uint8Array([7, 8, 9]));
  });
});
