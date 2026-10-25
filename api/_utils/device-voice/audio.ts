import OpusScript from "opusscript";

type OpusRate = 8000 | 12000 | 16000 | 24000 | 48000;

/** Decodes the device's Opus uplink one packet at a time. */
export class OpusPacketDecoder {
  private decoder: OpusScript;

  constructor(sampleRate: number) {
    this.decoder = new OpusScript(sampleRate as OpusRate, 1, OpusScript.Application.VOIP);
  }

  decode(packet: Uint8Array): Buffer {
    return Buffer.from(this.decoder.decode(Buffer.from(packet)));
  }

  close(): void {
    this.decoder.delete();
  }
}

/** Linear resampler for 16-bit mono PCM; carries phase across chunks. */
export class PcmResampler {
  private readonly step: number;
  private position = 0;
  private previous = 0;

  constructor(fromRate: number, toRate: number) {
    this.step = fromRate / toRate;
  }

  push(pcm: Buffer): Buffer {
    const samples = pcm.length >> 1;
    if (this.step === 1) return pcm;
    const out: number[] = [];
    // `position` is measured from the last sample of the previous chunk (-1).
    while (this.position < samples - 1) {
      const index = Math.floor(this.position);
      const fraction = this.position - index;
      const a = index < 0 ? this.previous : pcm.readInt16LE(index * 2);
      const b = pcm.readInt16LE((index + 1) * 2);
      out.push(Math.round(a + (b - a) * fraction));
      this.position += this.step;
    }
    if (samples > 0) {
      this.previous = pcm.readInt16LE((samples - 1) * 2);
      this.position -= samples;
    }
    const buffer = Buffer.alloc(out.length * 2);
    out.forEach((value, i) => buffer.writeInt16LE(value, i * 2));
    return buffer;
  }
}

/** Items can be read while they are still being produced. */
export class AsyncQueue<T> {
  private frames: T[] = [];
  private done = false;
  private waiters: Array<() => void> = [];

  push(frame: T): void {
    this.frames.push(frame);
    this.wake();
  }

  end(): void {
    this.done = true;
    this.wake();
  }

  private wake(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    let index = 0;
    for (;;) {
      if (index < this.frames.length) {
        yield this.frames[index];
        index += 1;
      } else if (this.done) {
        return;
      } else {
        await new Promise<void>((resolve) => this.waiters.push(resolve));
      }
    }
  }
}

/** Encodes a 16-bit mono PCM stream into fixed-length Opus frames as bytes arrive. */
export async function pcmStreamToOpus(
  body: AsyncIterable<Uint8Array>,
  sampleRate: number,
  frameMs: number,
  queue: AsyncQueue<Buffer>
): Promise<void> {
  const encoder = new OpusScript(sampleRate as OpusRate, 1, OpusScript.Application.AUDIO);
  const samples = (sampleRate * frameMs) / 1000;
  const frameBytes = samples * 2;
  let pending = Buffer.alloc(0);
  try {
    for await (const chunk of body) {
      pending = pending.length ? Buffer.concat([pending, Buffer.from(chunk)]) : Buffer.from(chunk);
      while (pending.length >= frameBytes) {
        queue.push(Buffer.from(encoder.encode(pending.subarray(0, frameBytes), samples)));
        pending = pending.subarray(frameBytes);
      }
    }
    if (pending.length > 0) {
      const padded = Buffer.alloc(frameBytes);
      pending.copy(padded);
      queue.push(Buffer.from(encoder.encode(padded, samples)));
    }
  } finally {
    encoder.delete();
  }
}

export function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
