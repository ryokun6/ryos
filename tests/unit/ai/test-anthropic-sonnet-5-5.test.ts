import { describe, expect, test } from "bun:test";
import { createAnthropic } from "@ai-sdk/anthropic";

async function captureMessagesRequest(): Promise<{
  url: string;
  body: Record<string, unknown>;
}> {
  let captured: { url: string; body: Record<string, unknown> } | null = null;
  const provider = createAnthropic({
    apiKey: "test-key",
    fetch: async (input, init) => {
      captured = {
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      };
      return new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });

  const model = provider("claude-sonnet-5-5");
  expect(model.modelId).toBe("claude-sonnet-5-5");

  try {
    await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      temperature: 0.7,
    });
  } catch {
    // The stub body is not a real Messages stream. The outbound request is the check.
  }

  expect(captured).not.toBeNull();
  return captured!;
}

describe("Anthropic Sonnet 5.5 wire id", () => {
  test("sends claude-sonnet-5-5 and drops temperature", async () => {
    const captured = await captureMessagesRequest();
    expect(captured.url).toContain("/messages");
    expect(captured.body.model).toBe("claude-sonnet-5-5");
    expect(captured.body.temperature).toBeUndefined();
    expect(captured.body.thinking).toBeUndefined();
  });
});
