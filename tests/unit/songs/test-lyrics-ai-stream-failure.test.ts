import { describe, expect, test } from "bun:test";
import {
  LyricsAiStreamError,
  textDeltasFromFullStream,
  type LyricsAiStreamPart,
} from "../../../api/songs/_ai-text-stream";

async function collect(
  stream: AsyncIterable<LyricsAiStreamPart>
): Promise<string> {
  let out = "";
  for await (const chunk of textDeltasFromFullStream(stream)) {
    out += chunk;
  }
  return out;
}

async function* parts(
  items: LyricsAiStreamPart[]
): AsyncGenerator<LyricsAiStreamPart> {
  for (const item of items) {
    yield item;
  }
}

/**
 * Reproduce H11's textStream blind spot: a fullStream that ends with an
 * error still looks like a clean finish if you only read text-delta chunks
 * (what `result.textStream` / toTextStream does).
 *
 * Production paths (`streamTranslation`, `streamFurigana`, and the three
 * SSE actions in api/songs/[id].ts) iterate via textDeltasFromFullStream, so
 * these failures throw into existing catch blocks that skip Redis saves.
 * Do not mock.module("ai") / "@ai-sdk/openai" here — that pollutes the
 * aggregate unit suite (openai.tools / getModelInstance).
 */
async function* textDeltasOnly(
  stream: AsyncIterable<LyricsAiStreamPart>
): AsyncGenerator<string> {
  for await (const part of stream) {
    if (part.type === "text-delta" && typeof part.text === "string") {
      yield part.text;
    }
  }
}

describe("H11 lyrics AI stream failure detection", () => {
  test("reproduction: textStream-style iteration treats provider error as success", async () => {
    const stream = parts([
      { type: "text-delta", text: "1: hello\n" },
      { type: "error", error: new Error("provider timeout") },
    ]);

    let text = "";
    for await (const chunk of textDeltasOnly(stream)) {
      text += chunk;
    }

    // Bug shape: loop finished without throwing, partial text looks usable.
    expect(text).toBe("1: hello\n");
  });

  test("reproduction: abort-only stream looks like an empty success via textStream", async () => {
    const stream = parts([{ type: "abort", reason: "timeout" }]);

    let chunks = 0;
    for await (const _chunk of textDeltasOnly(stream)) {
      chunks++;
    }

    expect(chunks).toBe(0);
  });

  test("fullStream helper yields text deltas on a healthy stream", async () => {
    const text = await collect(
      parts([
        { type: "start" },
        { type: "text-delta", text: "1: hi\n" },
        { type: "text-delta", text: "2: there\n" },
        { type: "finish" },
      ])
    );
    expect(text).toBe("1: hi\n2: there\n");
  });

  test("fullStream helper throws LyricsAiStreamError on provider error", async () => {
    const stream = parts([
      { type: "text-delta", text: "1: hi\n" },
      { type: "error", error: new Error("model failed") },
      { type: "text-delta", text: "2: ignored\n" },
    ]);

    let seen = "";
    let caught: unknown;
    try {
      for await (const chunk of textDeltasFromFullStream(stream)) {
        seen += chunk;
      }
    } catch (err) {
      caught = err;
    }

    expect(seen).toBe("1: hi\n");
    expect(caught).toBeInstanceOf(LyricsAiStreamError);
    expect((caught as LyricsAiStreamError).kind).toBe("error");
    expect((caught as LyricsAiStreamError).message).toBe("model failed");
  });

  test("fullStream helper throws LyricsAiStreamError on abort/timeout", async () => {
    const stream = parts([{ type: "abort", reason: "timeout" }]);

    let caught: unknown;
    try {
      await collect(stream);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(LyricsAiStreamError);
    expect((caught as LyricsAiStreamError).kind).toBe("abort");
    expect((caught as LyricsAiStreamError).message).toBe("timeout");
  });
});
