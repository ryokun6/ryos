import OpenAI from "openai";
import { toFile } from "openai/uploads";

export const DEFAULT_TTS_MODEL = "elevenlabs";
export const DEFAULT_OPENAI_TTS_VOICE = "alloy";
export const DEFAULT_OPENAI_TTS_SPEED = 1.1;
export const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";

export const DEFAULT_ELEVENLABS_VOICE_ID = "kAyjEabBEu68HYYYRAHR"; // Ryo v3
export const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_turbo_v2_5"; // 2.5 turbo
export const DEFAULT_ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";
export const DEFAULT_ELEVENLABS_VOICE_SETTINGS = {
  stability: 0.3,
  similarity_boost: 0.8,
  use_speaker_boost: true,
  speed: 1.1,
} as const;

export type ElevenLabsOutputFormat =
  | "mp3_44100_128"
  | "mp3_22050_32"
  | "pcm_16000"
  | "pcm_22050"
  | "pcm_24000"
  | "pcm_44100"
  | "ulaw_8000";

export interface ElevenLabsVoiceSettings {
  stability?: number;
  similarity_boost?: number;
  use_speaker_boost?: boolean;
  speed?: number;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type TranscribeAudioBufferDeps = {
  toFileImpl?: typeof toFile;
  createTranscription?: (options: {
    file: Awaited<ReturnType<typeof toFile>>;
    model: string;
  }) => Promise<{ text: string }>;
};

export async function transcribeAudioBuffer({
  buffer,
  fileName,
  mimeType,
  model = DEFAULT_TRANSCRIPTION_MODEL,
  deps = {},
}: {
  buffer: Uint8Array | Buffer | ArrayBuffer;
  fileName: string;
  mimeType: string;
  model?: string;
  deps?: TranscribeAudioBufferDeps;
}): Promise<string> {
  const toFileImpl = deps.toFileImpl ?? toFile;
  const createTranscription =
    deps.createTranscription ??
    ((options: {
      file: Awaited<ReturnType<typeof toFile>>;
      model: string;
    }) => openai.audio.transcriptions.create(options));

  const file = await toFileImpl(buffer, fileName, { type: mimeType });
  const transcription = await createTranscription({
    file,
    model,
  });

  return transcription.text;
}

export async function generateElevenLabsSpeech({
  text,
  voiceId = DEFAULT_ELEVENLABS_VOICE_ID,
  modelId = DEFAULT_ELEVENLABS_MODEL_ID,
  outputFormat = DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  voiceSettings = DEFAULT_ELEVENLABS_VOICE_SETTINGS,
  apiKey = process.env.ELEVENLABS_API_KEY,
  fetchImpl = fetch,
}: {
  text: string;
  voiceId?: string;
  modelId?: string;
  outputFormat?: ElevenLabsOutputFormat;
  voiceSettings?: ElevenLabsVoiceSettings;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<ArrayBuffer> {
  if (!apiKey) {
    throw new Error("ElevenLabs API key not configured");
  }

  const response = await fetchImpl(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        output_format: outputFormat,
        voice_settings: voiceSettings,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
  }

  return response.arrayBuffer();
}
