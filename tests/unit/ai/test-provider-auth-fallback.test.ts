import { describe, expect, test } from "bun:test";
import {
  APICallError,
  type LanguageModelV4,
  type LanguageModelV4CallOptions,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4StreamResult,
} from "ai";
import {
  AI_PROVIDER_AUTH_FAILED_MESSAGE,
  isProviderAuthError,
  paramsForAuthFallback,
  pickAuthFallbackModel,
  runWithProviderAuthFallback,
  uiStreamErrorText,
  wrapWithProviderAuthFallback,
} from "../../../api/_utils/provider-auth";

function authError(statusCode = 401): APICallError {
  return new APICallError({
    message: "Incorrect API key provided: sk-testsecretvalue",
    url: "https://api.openai.com/v1/responses",
    requestBodyValues: {},
    statusCode,
    responseBody: '{"error":{"code":"invalid_api_key"}}',
  });
}

const prompt: LanguageModelV4CallOptions["prompt"] = [
  { role: "user", content: [{ type: "text", text: "hi" }] },
];

const streamResult = {
  stream: new ReadableStream(),
} as LanguageModelV4StreamResult;

const generateResult = {
  content: [],
  finishReason: "stop",
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
} as LanguageModelV4GenerateResult;

function fakeModel(
  id: string,
  provider: string,
  calls: {
    doGenerate?: LanguageModelV4["doGenerate"];
    doStream?: LanguageModelV4["doStream"];
  } = {}
): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider,
    modelId: id,
    supportedUrls: {},
    doGenerate:
      calls.doGenerate ??
      (async () => {
        throw new Error(`generate not stubbed for ${id}`);
      }),
    doStream:
      calls.doStream ??
      (async () => {
        throw new Error(`stream not stubbed for ${id}`);
      }),
  };
}

describe("provider auth errors", () => {
  test("treats 401 and 403 APICallError as auth failures", () => {
    expect(isProviderAuthError(authError(401))).toBe(true);
    expect(isProviderAuthError(authError(403))).toBe(true);
    expect(isProviderAuthError(new Error("nope", { cause: authError() }))).toBe(
      true
    );
    expect(
      isProviderAuthError(
        new APICallError({
          message: "overloaded",
          url: "https://api.openai.com/v1/responses",
          requestBodyValues: {},
          statusCode: 500,
        })
      )
    ).toBe(false);
  });

  test("surfaces a stable client message and redacts secrets", () => {
    expect(uiStreamErrorText(authError())).toBe(AI_PROVIDER_AUTH_FAILED_MESSAGE);
    expect(uiStreamErrorText(new Error("failed sk-abcdefghijklmnop"))).toBe(
      "failed [redacted]"
    );
    expect(uiStreamErrorText(new Error("Bearer sk-live-token"))).not.toContain(
      "sk-live"
    );
    expect(uiStreamErrorText("")).toBe("An error occurred.");
    expect(uiStreamErrorText(new Error("invalid_api_key"))).toBe(
      AI_PROVIDER_AUTH_FAILED_MESSAGE
    );
  });
});

describe("auth fallback selection", () => {
  test("prefers Anthropic, then Google, and skips OpenAI", () => {
    expect(pickAuthFallbackModel({})).toBeNull();
    expect(pickAuthFallbackModel({ ANTHROPIC_API_KEY: "  " })).toBeNull();
    expect(pickAuthFallbackModel({ ANTHROPIC_API_KEY: "sk-ant" })).toBe(
      "sonnet-4.6"
    );
    expect(
      pickAuthFallbackModel({ GOOGLE_GENERATIVE_AI_API_KEY: "goog" })
    ).toBe("gemini-3-flash");
    expect(
      pickAuthFallbackModel({
        ANTHROPIC_API_KEY: "sk-ant",
        GOOGLE_GENERATIVE_AI_API_KEY: "goog",
        OPENAI_API_KEY: "sk-openai",
      })
    ).toBe("sonnet-4.6");
  });

  test("retries only auth failures", async () => {
    let fallbackCalls = 0;
    await expect(
      runWithProviderAuthFallback(
        async () => {
          throw authError();
        },
        async () => {
          fallbackCalls += 1;
          return "ok";
        }
      )
    ).resolves.toBe("ok");
    expect(fallbackCalls).toBe(1);

    fallbackCalls = 0;
    await expect(
      runWithProviderAuthFallback(
        async () => {
          throw new Error("boom");
        },
        async () => {
          fallbackCalls += 1;
          return "ok";
        }
      )
    ).rejects.toThrow("boom");
    expect(fallbackCalls).toBe(0);
  });
});

describe("fallback request shaping", () => {
  test("drops OpenAI tools, reasoning, and provider options", () => {
    const next = paramsForAuthFallback(
      {
        prompt,
        reasoning: "low",
        temperature: 0.7,
        providerOptions: { openai: { store: false } },
        headers: { Authorization: "Bearer secret" },
        tools: [
          {
            type: "function",
            name: "lookup",
            inputSchema: { type: "object", properties: {} },
          },
          {
            type: "provider",
            id: "openai.web_search",
            name: "web_search",
            args: {},
          },
          {
            type: "provider",
            id: "anthropic.web_search",
            name: "web_search",
            args: {},
          },
        ],
      },
      "anthropic.messages"
    );
    expect(next.reasoning).toBeUndefined();
    expect(next.providerOptions).toBeUndefined();
    expect(next.headers).toBeUndefined();
    expect(next.temperature).toBe(0.7);
    expect(next.tools?.map((tool) => ("id" in tool ? tool.id : tool.name))).toEqual([
      "lookup",
      "anthropic.web_search",
    ]);
  });

  test("retries doStream once and keeps the primary model id", async () => {
    let fallbackParams: LanguageModelV4CallOptions | undefined;
    let logged = 0;
    const primary = fakeModel("gpt-6.1-sol", "openai.responses", {
      doStream: async () => {
        throw authError();
      },
    });
    const fallback = fakeModel("claude-sonnet-4-6", "anthropic.messages", {
      doStream: async (params) => {
        fallbackParams = params;
        return streamResult;
      },
    });
    const wrapped = wrapWithProviderAuthFallback(primary, fallback, () => {
      logged += 1;
    });
    expect(wrapped.modelId).toBe("gpt-6.1-sol");
    await wrapped.doStream({
      prompt,
      reasoning: "low",
      tools: [
        { type: "provider", id: "openai.web_search", name: "web_search", args: {} },
      ],
    });
    expect(logged).toBe(1);
    expect(fallbackParams?.reasoning).toBeUndefined();
    expect(fallbackParams?.tools).toEqual([]);
  });

  test("does not retry a non-auth generate error", async () => {
    let fallbackCalls = 0;
    const wrapped = wrapWithProviderAuthFallback(
      fakeModel("gpt-6.1-sol", "openai.responses", {
        doGenerate: async () => {
          throw new Error("quota");
        },
      }),
      fakeModel("claude-sonnet-4-6", "anthropic.messages", {
        doGenerate: async () => {
          fallbackCalls += 1;
          return generateResult;
        },
      })
    );
    await expect(wrapped.doGenerate({ prompt })).rejects.toThrow("quota");
    expect(fallbackCalls).toBe(0);
  });
});
