import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { APICallError } from "ai";
import {
  AI_PROVIDER_AUTH_FAILED_MESSAGE,
  isProviderAuthError,
  uiStreamErrorText,
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

  test("does not retry a failed model on another provider", () => {
    const models = readFileSync(
      new URL("../../../api/_utils/_aiModels.ts", import.meta.url),
      "utf8"
    );
    const providerAuth = readFileSync(
      new URL("../../../api/_utils/provider-auth.ts", import.meta.url),
      "utf8"
    );
    expect(models).not.toContain("wrapWithProviderAuthFallback");
    expect(models).not.toContain("pickAuthFallbackModel");
    expect(providerAuth).not.toContain("wrapLanguageModel");
    expect(models).toContain('openai("gpt-6-luna")');
  });
});
