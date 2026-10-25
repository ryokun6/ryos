import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ELEVENLABS_MODEL_ID,
  DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  DEFAULT_ELEVENLABS_VOICE_ID,
  DEFAULT_TTS_MODEL,
  STREAMING_ELEVENLABS_MODEL_ID,
  elevenLabsMimeType,
  generateElevenLabsSpeech,
  streamElevenLabsSpeech,
  transcribeAudioBuffer,
} from "../../../api/_utils/voice";

describe("voice utils", () => {
  test("unset TTS model falls back to ElevenLabs (Ryo PVC voice), not OpenAI", () => {
    expect(DEFAULT_TTS_MODEL).toBe("elevenlabs");
    expect(DEFAULT_ELEVENLABS_VOICE_ID).toBe("OHP6tMHkOsRKrsDdbPah");
    expect(DEFAULT_ELEVENLABS_MODEL_ID).toBe("eleven_turbo_v2_5");
  });

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
    expect(DEFAULT_ELEVENLABS_VOICE_ID).toBe("OHP6tMHkOsRKrsDdbPah");

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

  test("streamElevenLabsSpeech asks for flash and raw PCM, and returns the live body", async () => {
    const body = await streamElevenLabsSpeech({
      text: "hello world",
      outputFormat: "pcm_24000",
      apiKey: "test-elevenlabs-key",
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        expect(url.pathname).toBe(
          `/v1/text-to-speech/${DEFAULT_ELEVENLABS_VOICE_ID}/stream`
        );
        expect(url.searchParams.get("output_format")).toBe("pcm_24000");
        const headers = init?.headers as Record<string, string>;
        expect(headers.Accept).toBe("audio/pcm");
        const payload = JSON.parse(String(init?.body));
        expect(payload.model_id).toBe(STREAMING_ELEVENLABS_MODEL_ID);
        expect(payload.text).toBe("hello world");
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2]));
              controller.enqueue(new Uint8Array([3]));
              controller.close();
            },
          }),
          { status: 200 }
        );
      },
    });

    const chunks: number[] = [];
    for await (const chunk of body) chunks.push(...chunk);
    expect(chunks).toEqual([1, 2, 3]);
    expect(STREAMING_ELEVENLABS_MODEL_ID).toBe("eleven_flash_v2_5");
  });

  test("elevenLabsMimeType maps PCM and MP3 formats", () => {
    expect(elevenLabsMimeType("pcm_24000")).toBe("audio/pcm");
    expect(elevenLabsMimeType("mp3_44100_128")).toBe("audio/mpeg");
  });
});
