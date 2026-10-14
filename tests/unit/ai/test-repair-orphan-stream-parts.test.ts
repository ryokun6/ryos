import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { simulateReadableStream, streamText, type LanguageModel } from "ai";
import {
  ryoUiStreamTransforms,
  safeUiStreamErrorText,
} from "../../../api/_utils/ui-message-stream";

const usage = {
  inputTokens: 3,
  outputTokens: 5,
  totalTokens: 8,
};

function mockModel(chunks: Array<Record<string, unknown>>): LanguageModel {
  return {
    specificationVersion: "v4",
    provider: "mock",
    modelId: "mock-gpt-6",
    supportedUrls: {},
    async doGenerate() {
      throw new Error("not used");
    },
    async doStream() {
      return {
        stream: simulateReadableStream({
          chunks,
          initialDelayInMs: null,
          chunkDelayInMs: null,
        }),
      };
    },
  } as LanguageModel;
}

const orphanReasoning = [
  { type: "stream-start", warnings: [] },
  { type: "reasoning-delta", id: "rs_abc:0", delta: "thinking about it " },
  { type: "text-start", id: "msg_1" },
  { type: "text-delta", id: "msg_1", delta: "Hello there" },
  { type: "text-end", id: "msg_1" },
  { type: "finish", finishReason: "stop", usage },
];

const orphanText = [
  { type: "stream-start", warnings: [] },
  { type: "text-delta", id: "msg_1", delta: "Hello there" },
  { type: "text-end", id: "msg_1" },
  { type: "finish", finishReason: "stop", usage },
];

async function collectUi(chunks: Array<Record<string, unknown>>, repair: boolean) {
  const result = streamText({
    model: mockModel(chunks),
    prompt: "hi",
    ...(repair
      ? {
          experimental_transform: ryoUiStreamTransforms(),
        }
      : {}),
  });
  const ui: string[] = [];
  for await (const part of result.toUIMessageStream()) {
    if (part.type === "error") {
      ui.push(`error:${part.errorText}`);
    } else if ("id" in part && part.id) {
      ui.push(`${part.type}#${part.id}`);
    } else {
      ui.push(part.type);
    }
  }
  const text = await result.text;
  return { ui, text };
}

describe("repairOrphanStreamParts", () => {
  test("turns an orphan reasoning-delta into a start plus the following text", async () => {
    const broken = await collectUi(orphanReasoning, false);
    expect(broken.ui.some((part) => part.startsWith("error:"))).toBe(true);

    const fixed = await collectUi(orphanReasoning, true);
    const reasoningStart = fixed.ui.findIndex((part) =>
      part.startsWith("reasoning-start#")
    );
    const reasoningDelta = fixed.ui.findIndex((part) =>
      part.startsWith("reasoning-delta#")
    );
    expect(reasoningStart).toBeGreaterThanOrEqual(0);
    expect(reasoningDelta).toBeGreaterThan(reasoningStart);
    expect(fixed.ui.some((part) => part.startsWith("error:"))).toBe(false);
    expect(fixed.text).toBe("Hello there");
  });

  test("repairs an orphan text-delta the same way", async () => {
    const broken = await collectUi(orphanText, false);
    expect(broken.ui.some((part) => part.startsWith("error:"))).toBe(true);

    const fixed = await collectUi(orphanText, true);
    const textStart = fixed.ui.findIndex((part) => part.startsWith("text-start#"));
    const textDelta = fixed.ui.findIndex((part) => part.startsWith("text-delta#"));
    expect(textStart).toBeGreaterThanOrEqual(0);
    expect(textDelta).toBeGreaterThan(textStart);
    expect(fixed.ui.some((part) => part.startsWith("error:"))).toBe(false);
    expect(fixed.text).toBe("Hello there");
  });

  test("does not insert a second start when the provider already sent one", async () => {
    const fixed = await collectUi(
      [
        { type: "stream-start", warnings: [] },
        { type: "reasoning-start", id: "rs_abc:0" },
        { type: "reasoning-delta", id: "rs_abc:0", delta: "thinking " },
        { type: "reasoning-end", id: "rs_abc:0" },
        { type: "text-start", id: "msg_1" },
        { type: "text-delta", id: "msg_1", delta: "Hello there" },
        { type: "text-end", id: "msg_1" },
        { type: "finish", finishReason: "stop", usage },
      ],
      true
    );
    expect(
      fixed.ui.filter((part) => part.startsWith("reasoning-start#"))
    ).toHaveLength(1);
    expect(fixed.ui.some((part) => part.startsWith("error:"))).toBe(false);
    expect(fixed.text).toBe("Hello there");
  });
});

describe("safeUiStreamErrorText", () => {
  test("keeps the reasoning-part message and redacts key-shaped tokens", () => {
    expect(safeUiStreamErrorText(new Error("reasoning part rs_abc:0 not found"))).toBe(
      "reasoning part rs_abc:0 not found"
    );
    expect(
      safeUiStreamErrorText(
        new Error("Incorrect API key provided: sk-Y7y64secretTail")
      )
    ).toBe("Incorrect API key provided: [redacted]");
    expect(safeUiStreamErrorText("")).toBe("An error occurred.");
  });
});

describe("UI stream call sites repair orphan parts", () => {
  test("chat, IE, dictionary, and telegram pass the repair transform", () => {
    const read = (path: string) =>
      readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
    expect(read("api/chat.ts")).toContain("ryoUiStreamTransforms(");
    expect(read("api/ie-generate.ts")).toContain("ryoUiStreamTransforms(");
    expect(read("api/dictionary/ai.ts")).toContain("ryoUiStreamTransforms(");
    expect(read("api/webhooks/telegram.ts")).toContain("repairOrphanStreamParts(");
    expect(read("api/_utils/ryo-agent.ts")).toContain("repairOrphanStreamParts(");
    for (const path of ["api/chat.ts", "api/ie-generate.ts", "api/dictionary/ai.ts"]) {
      expect(read(path)).toContain("safeUiStreamErrorText");
    }
  });
});
