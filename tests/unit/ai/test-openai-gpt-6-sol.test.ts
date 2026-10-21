import { describe, expect, test } from "bun:test";
import { createOpenAI } from "@ai-sdk/openai";

async function captureResponsesRequest(
  modelId: "gpt-6-luna" | "gpt-6.1-sol",
  reasoning: "none" | "low"
): Promise<{
  url: string;
  body: Record<string, unknown>;
  warnings: Array<{ feature?: string; details?: string }>;
}> {
  let captured: { url: string; body: Record<string, unknown> } | null = null;
  const provider = createOpenAI({
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

  const model = provider.responses(modelId);
  expect(model.modelId).toBe(modelId);

  let warnings: Array<{ feature?: string; details?: string }> = [];
  try {
    const result = await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      reasoning,
      temperature: 0.7,
    });
    warnings = (result.warnings ?? []) as Array<{
      feature?: string;
      details?: string;
    }>;
  } catch {
    // The stub body is not a real Responses stream. The outbound request is the check.
  }

  expect(captured).not.toBeNull();
  return { ...captured!, warnings };
}

describe("OpenAI provider model ids", () => {
  test("accepts gpt-6-luna with none reasoning and forwards temperature", async () => {
    const captured = await captureResponsesRequest("gpt-6-luna", "none");
    expect(captured.url).toContain("/responses");
    expect(captured.body.model).toBe("gpt-6-luna");
    // The AI SDK forwards sampling params for gpt-6-luna when reasoning
    // effort is none. Chat still omits temperature before the provider.
    expect(captured.body.temperature).toBe(0.7);
    expect(
      (captured.body.reasoning as { effort?: string } | undefined)?.effort
    ).toBe("none");
    expect(
      captured.warnings.some(
        (warning) =>
          warning.feature === "reasoning" ||
          warning.feature === "reasoningEffort"
      )
    ).toBe(false);
  });

  test("accepts gpt-6.1-sol with low reasoning and without temperature", async () => {
    const captured = await captureResponsesRequest("gpt-6.1-sol", "low");
    expect(captured.body.model).toBe("gpt-6.1-sol");
    expect(captured.body.temperature).toBeUndefined();
    expect(
      (captured.body.reasoning as { effort?: string } | undefined)?.effort
    ).toBe("low");
    expect(
      captured.warnings.some(
        (warning) =>
          warning.feature === "reasoning" ||
          warning.feature === "reasoningEffort"
      )
    ).toBe(false);
  });
});
