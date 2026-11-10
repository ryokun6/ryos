import { afterAll, describe, expect, mock, test } from "bun:test";

type StreamPart =
  | { type: "text-delta"; text: string }
  | { type: "error"; error: unknown }
  | { type: "abort"; reason?: string };

let nextFullStream: AsyncIterable<StreamPart> = (async function* () {})();

const actualAi = await import("ai");
const actualOpenAI = await import("@ai-sdk/openai");

mock.module("ai", () => ({
  ...actualAi,
  streamText: () => ({
    get fullStream() {
      return nextFullStream;
    },
    // Legacy textStream shape: text-deltas only (drops error/abort).
    get textStream() {
      return (async function* () {
        for await (const part of nextFullStream) {
          if (part.type === "text-delta") yield part.text;
        }
      })();
    },
  }),
}));

mock.module("@ai-sdk/openai", () => ({
  ...actualOpenAI,
  openai: () => ("mock-model" as unknown),
}));

const { streamTranslation } = await import("../../../api/songs/_lyrics");

afterAll(() => {
  mock.restore();
});

async function* parts(items: StreamPart[]): AsyncGenerator<StreamPart> {
  for (const item of items) yield item;
}

describe("streamTranslation H11 provider failure", () => {
  test("provider error part does not report success", async () => {
    nextFullStream = parts([
      { type: "text-delta", text: "1: Hola\n" },
      { type: "error", error: new Error("provider failed") },
    ]);

    const result = await streamTranslation(
      [
        { words: "Hello", startTimeMs: "0" },
        { words: "World", startTimeMs: "1000" },
      ],
      "es",
      "test-h11-error",
      () => {}
    );

    expect(result.success).toBe(false);
  });

  test("abort/timeout part does not report success", async () => {
    nextFullStream = parts([{ type: "abort", reason: "timeout" }]);

    const result = await streamTranslation(
      [{ words: "Hello", startTimeMs: "0" }],
      "es",
      "test-h11-abort",
      () => {}
    );

    expect(result.success).toBe(false);
  });

  test("healthy stream still reports success", async () => {
    nextFullStream = parts([
      { type: "text-delta", text: "1: Hola\n" },
      { type: "text-delta", text: "2: Mundo\n" },
    ]);

    const result = await streamTranslation(
      [
        { words: "Hello", startTimeMs: "0" },
        { words: "World", startTimeMs: "1000" },
      ],
      "es",
      "test-h11-ok",
      () => {}
    );

    expect(result.success).toBe(true);
    expect(result.translations).toEqual(["Hola", "Mundo"]);
  });
});
