import { describe, expect, test } from "bun:test";
import OpusScript from "opusscript";
import { PcmResampler } from "../../../api/_utils/device-voice/audio";
import {
  DeviceVoiceSession,
  SpeechChunker,
  spokenOffset,
  toTraditionalChinese,
  type DeviceSocket,
  type DeviceVoiceDeps,
  type Transcriber,
} from "../../../api/_utils/device-voice/session";
import {
  REALTIME_TRANSCRIBE_MODEL,
  RealtimeTranscription,
  type TranscribeSocket,
} from "../../../api/_utils/device-voice/transcribe";
import { timeZoneOffsetMinutes } from "../../../api/_utils/device-voice/time";
import type { Redis } from "../../../api/_utils/redis";

function opusPackets(count: number, rate = 16000): Buffer[] {
  const encoder = new OpusScript(16000, 1, OpusScript.Application.VOIP);
  const samples = (rate * 60) / 1000;
  const packets: Buffer[] = [];
  for (let p = 0; p < count; p += 1) {
    const pcm = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i += 1) pcm.writeInt16LE(Math.round(Math.sin((p * samples + i) / 8) * 6000), i * 2);
    packets.push(Buffer.from(encoder.encode(pcm, samples)));
  }
  encoder.delete();
  return packets;
}

async function* pcmStream(ms: number): AsyncIterable<Uint8Array> {
  const bytes = (24000 * ms * 2) / 1000;
  // Odd split so frames straddle chunks.
  yield new Uint8Array(bytes - 1001);
  yield new Uint8Array(1001);
}

class FakeDevice implements DeviceSocket {
  texts: Record<string, unknown>[] = [];
  binary = 0;
  closed = false;
  sendText(text: string) {
    this.texts.push(JSON.parse(text));
  }
  sendBinary() {
    this.binary += 1;
  }
  close() {
    this.closed = true;
  }
  isOpen() {
    return !this.closed;
  }
}

async function waitFor(check: () => boolean, ms = 5000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("SpeechChunker", () => {
  test("cuts streamed text at sentence ends once there is enough to say", () => {
    const chunker = new SpeechChunker();
    const reply = "Hi. That is a pretty good question, honestly. Version 3.5 shipped today! ok";
    const pieces = Array.from(reply).flatMap((ch) => chunker.push(ch));
    pieces.push(...chunker.flush());
    expect(pieces.map((piece) => piece.text)).toEqual([
      "Hi. That is a pretty good question, honestly.",
      "Version 3.5 shipped today! ok",
    ]);
    expect(pieces[0].start).toBe(0);
    expect(pieces[1].start).toBe(pieces[0].length);
    expect(pieces[1].start + pieces[1].length).toBe(Array.from(reply).length);
  });
});

describe("Chinese replies", () => {
  test("split at the spaces Ryo uses between Chinese sentences", () => {
    const chunker = new SpeechChunker();
    const reply = "今天台北天氣不錯 下午可能會下一點雨 記得帶傘 晚上溫度大概二十度左右 很舒服";
    const pieces = Array.from(reply).flatMap((ch) => chunker.push(ch));
    pieces.push(...chunker.flush());
    expect(pieces.map((piece) => piece.text)).toEqual([
      "今天台北天氣不錯 下午可能會下一點雨",
      "記得帶傘 晚上溫度大概二十度左右",
      "很舒服",
    ]);
  });

  test("transcripts come out in traditional characters", () => {
    expect(toTraditionalChinese("今天台北的天气怎么样？我想去公园散步。")).toBe(
      "今天台北的天氣怎麼樣？我想去公園散步。"
    );
    expect(toTraditionalChinese("what's the weather")).toBe("what's the weather");
  });

  test("caption progress moves slower through Chinese than English", () => {
    expect(spokenOffset("今天台北天氣不錯", 1000)).toBe(5);
    expect(spokenOffset("the weather is nice", 1000)).toBe(15);
  });
});

describe("PcmResampler", () => {
  test("upsamples 16 kHz to 24 kHz across chunk boundaries", () => {
    const resampler = new PcmResampler(16000, 24000);
    const chunk = Buffer.alloc(960 * 2);
    for (let i = 0; i < 960; i += 1) chunk.writeInt16LE(i, i * 2);
    const total = [0, 1, 2, 3].reduce((sum) => sum + resampler.push(chunk).length / 2, 0);
    expect(Math.abs(total - 960 * 4 * 1.5)).toBeLessThanOrEqual(2);
  });
});

class FakeTranscribeSocket implements TranscribeSocket {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  emit(event: object) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

describe("RealtimeTranscription", () => {
  test("configures the session, flushes early audio, and resolves the committed transcript", async () => {
    const socket = new FakeTranscribeSocket();
    let auth = "";
    const transcription = new RealtimeTranscription({
      apiKey: "test-key",
      connect: (url, apiKey) => {
        expect(url).toContain("intent=transcription");
        auth = apiKey;
        return socket;
      },
    });
    expect(auth).toBe("test-key");
    transcription.append(Buffer.from([1, 2, 3, 4]));
    expect(socket.sent).toHaveLength(0);
    socket.open();
    const update = socket.sent[0] as { type: string; session: { audio: { input: { transcription: { model: string } } } } };
    expect(update.type).toBe("session.update");
    expect(update.session.audio.input.transcription.model).toBe(REALTIME_TRANSCRIBE_MODEL);
    expect(socket.sent[1]).toEqual({ type: "input_audio_buffer.append", audio: "AQIDBA==" });

    const final = transcription.finish();
    expect(socket.sent.at(-1)).toEqual({ type: "input_audio_buffer.commit" });
    socket.emit({ type: "conversation.item.input_audio_transcription.delta", delta: "hey " });
    socket.emit({ type: "conversation.item.input_audio_transcription.completed", transcript: " hey ryo " });
    expect(await final).toBe("hey ryo");
    expect(socket.readyState).toBe(3);
  });

  test("rejects when the provider reports an error", async () => {
    const socket = new FakeTranscribeSocket();
    const transcription = new RealtimeTranscription({ apiKey: "k", connect: () => socket });
    socket.open();
    const final = transcription.finish();
    socket.emit({ type: "error", error: { message: "bad session" } });
    await expect(final).rejects.toThrow("bad session");
  });
});

function sessionDeps(overrides: Partial<DeviceVoiceDeps> = {}): DeviceVoiceDeps {
  return {
    redis: {} as Redis,
    authenticate: async (username, token) => username === "ryo" && token === "good",
    checkLimit: async () => ({ allowed: true }),
    runTurn: async (_username, _text, onText) => {
      for (const delta of ["Sure thing, the weather is sunny and warm today. ", "Bring sunglasses if you go out."]) {
        onText(delta);
      }
      return { text: "" };
    },
    speak: async () => pcmStream(300),
    log: () => {},
    logError: () => {},
    ...overrides,
  };
}

describe("DeviceVoiceSession", () => {
  test("rejects a hello without a valid ryOS session", async () => {
    const device = new FakeDevice();
    const session = new DeviceVoiceSession(device, sessionDeps());
    session.handleText(JSON.stringify({ type: "hello", ryos: { username: "ryo", token: "bad" } }));
    await waitFor(() => device.closed);
    expect(device.texts[0]).toMatchObject({ type: "error" });
  });

  test("streams audio into transcription and speaks the reply as it is written", async () => {
    const device = new FakeDevice();
    const appended: number[] = [];
    let spokenTexts: string[] = [];
    const transcriber: Transcriber = {
      append: (pcm) => appended.push(pcm.length),
      finish: async () => "what's the weather",
      close: () => {},
    };
    const session = new DeviceVoiceSession(
      device,
      sessionDeps({
        openTranscriber: () => transcriber,
        speak: async (text) => {
          spokenTexts.push(text);
          return pcmStream(300);
        },
      })
    );
    session.handleText(
      JSON.stringify({ type: "hello", audio_params: { sample_rate: 16000 }, ryos: { username: "ryo", token: "good" } })
    );
    await waitFor(() => device.texts.some((m) => m.type === "hello"));

    session.handleText(JSON.stringify({ type: "listen", state: "start", mode: "manual" }));
    for (const packet of opusPackets(5)) session.handleBinary(packet);
    session.handleText(JSON.stringify({ type: "listen", state: "stop" }));
    await waitFor(() => device.texts.some((m) => m.type === "tts" && m.state === "stop"));

    expect(appended).toHaveLength(5);
    // 60ms at 16 kHz becomes 60ms at 24 kHz.
    expect(Math.abs(appended[2] / 2 - 1440)).toBeLessThanOrEqual(1);
    expect(device.texts.find((m) => m.type === "stt")).toMatchObject({ text: "what's the weather" });
    expect(spokenTexts).toEqual(["Sure thing, the weather is sunny and warm today.", "Bring sunglasses if you go out."]);
    const captions = device.texts.filter((m) => m.state === "sentence_start").map((m) => m.text);
    expect(captions.at(-1)).toBe("Sure thing, the weather is sunny and warm today. Bring sunglasses if you go out.");
    expect(device.texts.some((m) => m.state === "progress")).toBe(true);
    // 300ms of PCM per piece is five 60ms frames.
    expect(device.binary).toBe(10);
  });

  test("falls back to a file upload when streaming transcription fails", async () => {
    const device = new FakeDevice();
    let uploaded = 0;
    const session = new DeviceVoiceSession(
      device,
      sessionDeps({
        openTranscriber: () => ({
          append: () => {},
          finish: async () => {
            throw new Error("socket closed");
          },
          close: () => {},
        }),
        transcribeFile: async (wav) => {
          uploaded = wav.length;
          return "hello";
        },
      })
    );
    session.handleText(JSON.stringify({ type: "hello", ryos: { username: "ryo", token: "good" } }));
    await waitFor(() => device.texts.some((m) => m.type === "hello"));
    session.handleText(JSON.stringify({ type: "listen", state: "start" }));
    for (const packet of opusPackets(3)) session.handleBinary(packet);
    session.handleText(JSON.stringify({ type: "listen", state: "stop" }));
    await waitFor(() => device.texts.some((m) => m.type === "stt"));
    // WAV header plus three 60ms frames of 16 kHz PCM.
    expect(uploaded).toBe(44 + 3 * 960 * 2);
  });
});

describe("timeZoneOffsetMinutes", () => {
  test("reads the offset for a zone", () => {
    expect(timeZoneOffsetMinutes("Asia/Taipei")).toBe(480);
    expect(timeZoneOffsetMinutes("UTC")).toBe(0);
  });
});
