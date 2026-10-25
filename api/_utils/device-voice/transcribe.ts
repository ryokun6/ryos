export const REALTIME_TRANSCRIBE_URL = "wss://api.openai.com/v1/realtime?intent=transcription";
export const REALTIME_TRANSCRIBE_MODEL = "gpt-live-transcribe";
/** Realtime transcription only takes 24 kHz PCM. */
export const REALTIME_TRANSCRIBE_RATE = 24000;
const FINISH_TIMEOUT_MS = 8000;

export interface TranscribeSocket {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
}

export type ConnectTranscribeSocket = (url: string, apiKey: string) => TranscribeSocket;

const connectBunSocket: ConnectTranscribeSocket = (url, apiKey) => {
  // Bun's WebSocket accepts request headers; the browser constructor does not.
  const BunWebSocket = WebSocket as unknown as new (
    url: string,
    options: { headers: Record<string, string> }
  ) => TranscribeSocket;
  return new BunWebSocket(url, { headers: { Authorization: `Bearer ${apiKey}` } });
};

const OPEN = 1;

/**
 * One utterance of OpenAI realtime transcription: audio is sent while the
 * user is still talking, so only the tail is left to transcribe on release.
 */
export class RealtimeTranscription {
  private socket: TranscribeSocket;
  private queued: string[] = [];
  private text = "";
  private failure: Error | null = null;
  private settled = false;
  private resolveFinal: ((text: string) => void) | null = null;
  private rejectFinal: ((error: Error) => void) | null = null;

  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    connect = connectBunSocket,
  }: { apiKey?: string; connect?: ConnectTranscribeSocket } = {}) {
    if (!apiKey) throw new Error("OpenAI API key not configured");
    this.socket = connect(REALTIME_TRANSCRIBE_URL, apiKey);
    this.socket.onopen = () => {
      this.socket.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "transcription",
            audio: {
              input: {
                format: { type: "audio/pcm", rate: REALTIME_TRANSCRIBE_RATE },
                transcription: {
                  model: REALTIME_TRANSCRIBE_MODEL,
                  keywords: ["Ryo", "ryOS"],
                  delay: "low",
                },
                turn_detection: null,
              },
            },
          },
        })
      );
      for (const message of this.queued) this.socket.send(message);
      this.queued = [];
    };
    this.socket.onmessage = (event) => this.handle(event.data);
    this.socket.onerror = () => this.fail(new Error("realtime transcription socket error"));
    this.socket.onclose = () => this.fail(new Error("realtime transcription socket closed"));
  }

  private send(message: object): void {
    const data = JSON.stringify(message);
    if (this.socket.readyState === OPEN) this.socket.send(data);
    else this.queued.push(data);
  }

  private handle(data: unknown): void {
    let event: { type?: string; delta?: unknown; transcript?: unknown; error?: { code?: string; message?: string } };
    try {
      event = JSON.parse(typeof data === "string" ? data : Buffer.from(data as ArrayBuffer).toString());
    } catch {
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.delta") {
      if (typeof event.delta === "string") this.text += event.delta;
    } else if (event.type === "conversation.item.input_audio_transcription.completed") {
      this.settle(typeof event.transcript === "string" ? event.transcript : this.text);
    } else if (event.type === "error") {
      if (event.error?.code === "input_audio_buffer_commit_empty") {
        this.settle("");
        return;
      }
      this.fail(new Error(`realtime transcription: ${event.error?.message ?? "error"}`));
    }
  }

  private settle(text: string): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveFinal?.(text.trim());
    this.close();
  }

  private fail(error: Error): void {
    if (this.settled) return;
    this.failure ??= error;
    if (this.rejectFinal) {
      this.settled = true;
      this.rejectFinal(this.failure);
      this.close();
    }
  }

  /** 16-bit mono PCM at {@link REALTIME_TRANSCRIBE_RATE}. */
  append(pcm: Buffer): void {
    if (this.settled || this.failure || pcm.length === 0) return;
    this.send({ type: "input_audio_buffer.append", audio: pcm.toString("base64") });
  }

  finish(): Promise<string> {
    if (this.failure || this.settled) {
      this.close();
      return Promise.reject(this.failure ?? new Error("realtime transcription closed"));
    }
    const final = new Promise<string>((resolve, reject) => {
      this.resolveFinal = resolve;
      this.rejectFinal = reject;
    });
    this.send({ type: "input_audio_buffer.commit" });
    const timer = setTimeout(() => this.fail(new Error("realtime transcription timed out")), FINISH_TIMEOUT_MS);
    return final.finally(() => clearTimeout(timer));
  }

  close(): void {
    this.settled = true;
    this.queued = [];
    try {
      this.socket.close();
    } catch {
      // already closed
    }
  }
}
