import { randomUUID } from "node:crypto";
import { Converter } from "opencc-js/cn2t";
import type { Redis } from "../redis.js";
import { validateAuth } from "../auth/_validate.js";
import { checkDeviceTurnLimit, runDeviceTurn, type DeviceTurnLimit } from "../device-turn.js";
import { streamElevenLabsSpeech, transcribeAudioBuffer } from "../voice.js";
import { AsyncQueue, OpusPacketDecoder, PcmResampler, pcmStreamToOpus, pcmToWav } from "./audio.js";
import { REALTIME_TRANSCRIBE_RATE, RealtimeTranscription } from "./transcribe.js";

/** Websocket the voice terminal speaks the xiaozhi protocol on. */
export const DEVICE_VOICE_PATH = "/api/device/voice";

const OUTPUT_RATE = 24000;
const FRAME_MS = 60;
// Each frame is 60ms of audio. Sending faster than that fills the device
// buffer, and the frames that do not fit are skipped, so the rest of the
// sentence plays sped up. A few frames go out at once to absorb jitter.
const PREROLL_FRAMES = 3;
const PROGRESS_EVERY_FRAMES = 6;
// Speech pace for caption progress while the clip length is still unknown.
const CHARS_PER_SECOND = 15;
const MIN_CHUNK_CHARS = 40;
/** About a minute of 60ms packets; longer holds are cut off. */
const MAX_LISTEN_PACKETS = 1000;
const MAX_PARALLEL_SPEECH = 2;

export interface DeviceSocket {
  sendText(text: string): void;
  sendBinary(data: Buffer): void;
  close(): void;
  isOpen(): boolean;
}

export interface Transcriber {
  append(pcm: Buffer): void;
  finish(): Promise<string>;
  close(): void;
}

type Log = (...args: unknown[]) => void;

export interface DeviceVoiceDeps {
  redis: Redis;
  authenticate?: (username: string, token: string) => Promise<boolean>;
  checkLimit?: (username: string) => Promise<DeviceTurnLimit>;
  runTurn?: (username: string, text: string, onText: (delta: string) => void) => Promise<{ text: string }>;
  openTranscriber?: () => Transcriber;
  transcribeFile?: (wav: Buffer) => Promise<string>;
  speak?: (text: string) => Promise<AsyncIterable<Uint8Array>>;
  log?: Log;
  logError?: Log;
}

const codePoints = (text: string) => Array.from(text).length;

const simplifiedToTraditional = Converter({ from: "cn", to: "tw" });
const HAN = /\p{Script=Han}/u;

const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
/** Milliseconds to say one character: a CJK character is a whole syllable. */
const charMs = (char: string) => (WIDE.test(char) ? 200 : 1000 / CHARS_PER_SECOND);

/** Text length in Latin-character equivalents of speaking time. */
function speechWeight(text: string): number {
  let ms = 0;
  for (const char of text) ms += charMs(char);
  return (ms * CHARS_PER_SECOND) / 1000;
}

/** Code point offset reached after `elapsedMs` of speaking `text`. */
export function spokenOffset(text: string, elapsedMs: number): number {
  let offset = 0;
  let ms = 0;
  for (const char of text) {
    ms += charMs(char);
    if (ms > elapsedMs) break;
    offset += 1;
  }
  return offset;
}

const EMOTION_CUES: Array<[string, RegExp]> = [
  ["angry", /^!!!!/],
  ["laughing", /\b(?:haha+|lol|lmao)\b|哈哈|笑死|😂|🤣/i],
  ["crying", /😭|哭/],
  ["sad", /\b(?:sorry|sad|unfortunately|miss you)\b|抱歉|對不起|難過|可惜|😢/i],
  ["loving", /\blove\b|❤|愛你|喜歡你|🥰/i],
  ["surprised", /\b(?:wow|whoa|omg|no way)\b|哇|天啊|真的假的|😮/i],
  ["sleepy", /\b(?:tired|sleepy|good ?night)\b|晚安|好睏|好累|😴/i],
  ["winking", /;\)|😉/],
  ["cool", /😎|\bcool\b|很酷/i],
  ["confused", /\b(?:not sure|no idea)\b|不確定|不知道|🤔/i],
];

/** A face for a spoken line, from cues in its text. */
export function replyEmotion(text: string): string {
  for (const [emotion, cue] of EMOTION_CUES) {
    if (cue.test(text)) return emotion;
  }
  return "happy";
}

/** Speech models often write Chinese in simplified characters; Ryo uses traditional. */
export function toTraditionalChinese(text: string): string {
  return HAN.test(text) ? simplifiedToTraditional(text) : text;
}

export interface SpeechPiece {
  text: string;
  /** Untrimmed text the offsets count over. */
  raw: string;
  /** Code point offset of the piece in the whole reply. */
  start: number;
  length: number;
}

/**
 * Cuts streamed reply text into speakable pieces at sentence ends. Short
 * sentences are merged so each speech request carries a useful amount.
 */
export class SpeechChunker {
  text = "";
  private pending = "";
  private emitted = 0;

  push(delta: string): SpeechPiece[] {
    this.text += delta;
    this.pending += delta;
    const pieces: SpeechPiece[] = [];
    for (let end = this.boundary(); end > 0; end = this.boundary()) {
      pieces.push(this.take(end));
    }
    return pieces;
  }

  flush(): SpeechPiece[] {
    if (!this.pending.trim()) {
      this.pending = "";
      return [];
    }
    return [this.take(this.pending.length)];
  }

  private boundary(): number {
    // A period only ends a sentence once whitespace follows, so "3.5" waits.
    // Ryo's Chinese separates sentences with spaces instead of 。.
    const pattern = /[.!?]+["')\]]*(?=\s)|[。！？，；]+|(?<=\p{Script=Han})\s+(?=\p{Script=Han})|\n+/gu;
    for (let match = pattern.exec(this.pending); match; match = pattern.exec(this.pending)) {
      const end = match.index + match[0].length;
      if (speechWeight(this.pending.slice(0, end).trim()) >= MIN_CHUNK_CHARS) return end;
    }
    return -1;
  }

  private take(end: number): SpeechPiece {
    const raw = this.pending.slice(0, end);
    this.pending = this.pending.slice(end);
    const start = this.emitted;
    const length = codePoints(raw);
    this.emitted += length;
    return { text: raw.trim(), raw, start, length };
  }
}

interface SpeechChunk extends SpeechPiece {
  /** Reply text known when this piece was cut; shown while it plays. */
  caption: string;
  emotion: string;
  frames: AsyncQueue<Buffer>;
}

class Listening {
  private decoder: OpusPacketDecoder;
  private resampler: PcmResampler;
  private pcm: Buffer[] = [];
  packets = 0;

  constructor(
    private readonly inputRate: number,
    private readonly transcriber: Transcriber | null,
    readonly limit: Promise<DeviceTurnLimit>,
    private readonly transcribeFile: (wav: Buffer) => Promise<string>,
    private readonly logError: Log
  ) {
    this.decoder = new OpusPacketDecoder(inputRate);
    this.resampler = new PcmResampler(inputRate, REALTIME_TRANSCRIBE_RATE);
  }

  push(packet: Uint8Array): void {
    if (this.packets >= MAX_LISTEN_PACKETS) return;
    this.packets += 1;
    let pcm: Buffer;
    try {
      pcm = this.decoder.decode(packet);
    } catch {
      return;
    }
    this.pcm.push(pcm);
    this.transcriber?.append(this.resampler.push(pcm));
  }

  /** Final transcript; falls back to a file upload if the stream failed. */
  async transcript(): Promise<string> {
    this.decoder.close();
    if (this.transcriber) {
      try {
        return toTraditionalChinese(await this.transcriber.finish());
      } catch (error) {
        this.logError("[device-voice] streaming transcription failed, uploading instead", error);
      }
    }
    const wav = pcmToWav(Buffer.concat(this.pcm), this.inputRate);
    return toTraditionalChinese((await this.transcribeFile(wav)).trim());
  }

  cancel(): void {
    this.decoder.close();
    this.transcriber?.close();
  }
}

/** One device connection: hold-to-talk audio in, Ryo's spoken reply out. */
export class DeviceVoiceSession {
  readonly id = randomUUID();
  private username = "";
  private inputRate = 16000;
  /** Bumped by every new listen or abort so stale turns stop talking. */
  private turn = 0;
  private listening: Listening | null = null;
  private speechSlots = MAX_PARALLEL_SPEECH;
  private speechWaiters: Array<() => void> = [];
  private readonly deps: Required<DeviceVoiceDeps>;

  constructor(
    private readonly socket: DeviceSocket,
    deps: DeviceVoiceDeps
  ) {
    const log = deps.log ?? ((...args: unknown[]) => console.log(...args));
    const logError = deps.logError ?? ((...args: unknown[]) => console.error(...args));
    this.deps = {
      redis: deps.redis,
      log,
      logError,
      authenticate:
        deps.authenticate ??
        (async (username, token) => (await validateAuth(deps.redis, username, token)).valid),
      checkLimit: deps.checkLimit ?? ((username) => checkDeviceTurnLimit(deps.redis, username)),
      runTurn:
        deps.runTurn ??
        ((username, text, onText) =>
          runDeviceTurn({ redis: deps.redis, username, text, log, logError, onText })),
      openTranscriber: deps.openTranscriber ?? (() => new RealtimeTranscription()),
      transcribeFile:
        deps.transcribeFile ??
        ((wav) => transcribeAudioBuffer({ buffer: wav, fileName: "utterance.wav", mimeType: "audio/wav" })),
      speak:
        deps.speak ??
        (async (text) => streamElevenLabsSpeech({ text, outputFormat: "pcm_24000" })),
    };
  }

  private send(message: Record<string, unknown>): void {
    if (this.socket.isOpen()) this.socket.sendText(JSON.stringify(message));
  }

  handleText(raw: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    void this.handleMessage(message).catch((error) => {
      this.deps.logError("[device-voice] message failed", error);
    });
  }

  handleBinary(data: Uint8Array): void {
    this.listening?.push(data);
  }

  close(): void {
    this.turn += 1;
    this.listening?.cancel();
    this.listening = null;
  }

  private async handleMessage(message: Record<string, unknown>): Promise<void> {
    if (message.type === "hello") {
      const auth = (message.ryos ?? {}) as { username?: unknown; token?: unknown };
      const username = typeof auth.username === "string" ? auth.username.trim().toLowerCase() : "";
      const token = typeof auth.token === "string" ? auth.token : "";
      const valid = username && token ? await this.deps.authenticate(username, token).catch(() => false) : false;
      if (!valid) {
        this.deps.log(`[device-voice] rejected hello for ${username || "?"}`);
        this.send({ type: "error", message: "sign in from the setup page" });
        this.socket.close();
        return;
      }
      this.username = username;
      const rate = (message.audio_params as { sample_rate?: unknown } | undefined)?.sample_rate;
      if (typeof rate === "number" && [8000, 12000, 16000, 24000, 48000].includes(rate)) {
        this.inputRate = rate;
      }
      this.deps.log(`[device-voice] session ${this.id} for ${username}`);
      this.send({
        type: "hello",
        transport: "websocket",
        session_id: this.id,
        audio_params: { format: "opus", sample_rate: OUTPUT_RATE, channels: 1, frame_duration: FRAME_MS },
      });
      return;
    }
    if (!this.username) return;

    if (message.type === "abort") {
      this.close();
      return;
    }
    if (message.type !== "listen") return;
    if (message.state === "start") {
      this.close();
      let transcriber: Transcriber | null = null;
      try {
        transcriber = this.deps.openTranscriber();
      } catch (error) {
        this.deps.logError("[device-voice] streaming transcription unavailable", error);
      }
      const limit = this.deps.checkLimit(this.username);
      limit.catch(() => {});
      this.listening = new Listening(
        this.inputRate,
        transcriber,
        limit,
        this.deps.transcribeFile,
        this.deps.logError
      );
      return;
    }
    if (message.state === "stop") {
      const listening = this.listening;
      this.listening = null;
      if (!listening) return;
      if (listening.packets === 0) {
        listening.cancel();
        return;
      }
      await this.runTurn(listening, this.turn);
    }
  }

  private live(turnId: number): boolean {
    return this.turn === turnId && this.socket.isOpen();
  }

  private async runTurn(listening: Listening, turnId: number): Promise<void> {
    const started = Date.now();
    let limit: DeviceTurnLimit;
    try {
      limit = await listening.limit;
    } catch (error) {
      this.deps.logError("[device-voice] rate limit check failed", error);
      limit = { allowed: false, limit: 0 };
    }
    if (!limit.allowed) {
      listening.cancel();
      await this.showMessage("slow down a second.", turnId);
      return;
    }

    let transcript: string;
    try {
      transcript = await listening.transcript();
    } catch (error) {
      this.deps.logError("[device-voice] transcription failed", error);
      await this.showMessage("i couldn't hear that.", turnId);
      return;
    }
    const transcribed = Date.now();
    if (!transcript || !this.live(turnId)) return;
    this.send({ type: "stt", text: transcript, session_id: this.id });

    const chunker = new SpeechChunker();
    const chunks = new AsyncQueue<SpeechChunk>();
    let spoken = 0;
    const enqueue = (pieces: SpeechPiece[]) => {
      for (const piece of pieces) {
        if (!piece.text) continue;
        spoken += 1;
        chunks.push({
          ...piece,
          caption: chunker.text.trim(),
          emotion: replyEmotion(piece.text),
          frames: this.synthesize(piece.text),
        });
      }
    };
    let firstAudio = 0;
    const playback = this.play(chunks, turnId, () => {
      firstAudio = Date.now();
    });
    let failure: unknown = null;
    try {
      await this.deps.runTurn(this.username, transcript, (delta) => {
        if (this.live(turnId)) enqueue(chunker.push(delta));
      });
      enqueue(chunker.flush());
    } catch (error) {
      failure = error;
    } finally {
      chunks.end();
    }
    const replied = Date.now();
    await playback;
    if (failure) {
      this.deps.logError("[device-voice] turn failed", failure);
      if (spoken === 0) await this.showMessage("something went wrong.", turnId);
      return;
    }
    this.deps.log(
      `[device-voice] turn ${this.username} transcribe=${transcribed - started}ms ` +
        `first-audio=${firstAudio ? firstAudio - transcribed : -1}ms reply=${replied - transcribed}ms ` +
        `chunks=${spoken} total=${Date.now() - started}ms`
    );
  }

  /** Caption without audio, for errors the user should still see. */
  private async showMessage(text: string, turnId: number): Promise<void> {
    const chunks = new AsyncQueue<SpeechChunk>();
    const frames = new AsyncQueue<Buffer>();
    frames.end();
    chunks.push({ text, raw: text, start: 0, length: codePoints(text), caption: text, emotion: "sad", frames });
    chunks.end();
    await this.play(chunks, turnId);
  }

  private async acquireSpeechSlot(): Promise<void> {
    if (this.speechSlots > 0) {
      this.speechSlots -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.speechWaiters.push(resolve));
  }

  private releaseSpeechSlot(): void {
    const next = this.speechWaiters.shift();
    if (next) next();
    else this.speechSlots += 1;
  }

  private synthesize(text: string): AsyncQueue<Buffer> {
    const frames = new AsyncQueue<Buffer>();
    void (async () => {
      await this.acquireSpeechSlot();
      try {
        const body = await this.deps.speak(text);
        await pcmStreamToOpus(body, OUTPUT_RATE, FRAME_MS, frames);
      } catch (error) {
        this.deps.logError("[device-voice] speech failed", error);
      } finally {
        this.releaseSpeechSlot();
        frames.end();
      }
    })();
    return frames;
  }

  private async play(
    chunks: AsyncQueue<SpeechChunk>,
    turnId: number,
    onFirstAudio: () => void = () => {}
  ): Promise<void> {
    let started = false;
    let next = 0;
    let first = true;
    for await (const chunk of chunks) {
      if (!this.live(turnId)) break;
      if (!started) {
        started = true;
        this.send({ type: "tts", state: "start", session_id: this.id });
      }
      this.send({ type: "llm", emotion: chunk.emotion, session_id: this.id });
      this.send({ type: "tts", state: "sentence_start", text: chunk.caption, session_id: this.id });
      const total = codePoints(chunk.caption);
      let index = 0;
      for await (const frame of chunk.frames) {
        if (!this.live(turnId)) break;
        const now = Date.now();
        if (first) {
          first = false;
          onFirstAudio();
          next = now - PREROLL_FRAMES * FRAME_MS;
        }
        if (next > now) await sleep(next - now);
        if (index % PROGRESS_EVERY_FRAMES === 0) {
          const offset = chunk.start + spokenOffset(chunk.raw, index * FRAME_MS);
          this.send({ type: "tts", state: "progress", offset, total, session_id: this.id });
        }
        this.socket.sendBinary(frame);
        index += 1;
        next = Math.max(next, Date.now() - PREROLL_FRAMES * FRAME_MS) + FRAME_MS;
      }
    }
    if (!started || !this.live(turnId)) return;
    // Let the device's buffered frames finish before it leaves speaking state.
    const tail = next + PREROLL_FRAMES * FRAME_MS - Date.now();
    if (tail > 0) await sleep(tail);
    if (this.live(turnId)) this.send({ type: "tts", state: "stop", session_id: this.id });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
