import { describe, expect, test } from "bun:test";
import { createOpenAI } from "@ai-sdk/openai";

describe("OpenAI provider accepts gpt-6.1-sol", () => {
  test("sends the model id with low reasoning and without temperature", async () => {
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

    const model = provider.responses("gpt-6.1-sol");
    expect(model.modelId).toBe("gpt-6.1-sol");

    let warnings: Array<{ feature?: string; details?: string }> = [];
    try {
      const result = await model.doStream({
        prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
        reasoning: "low",
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
    expect(captured!.url).toContain("/responses");
    expect(captured!.body.model).toBe("gpt-6.1-sol");
    expect(captured!.body.temperature).toBeUndefined();
    expect(
      (captured!.body.reasoning as { effort?: string } | undefined)?.effort
    ).toBe("low");
    expect(
      warnings.some(
        (warning) =>
          warning.feature === "reasoning" ||
          warning.feature === "reasoningEffort" ||
          /unsupported model/i.test(warning.details ?? "")
      )
    ).toBe(false);
  });
});
