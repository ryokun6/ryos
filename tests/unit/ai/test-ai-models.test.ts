import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  AI_MODELS,
  DEFAULT_AI_MODEL,
  SUPPORTED_AI_MODELS,
  canAccessAiModel,
  getSelectableAiModels,
  isRestrictedAiModel,
  normalizeAiModelId,
  resolveClientAiModel,
  resolveRequestedAiModel,
} from "../../../src/shared/aiModels";
import {
  DEFAULT_MODEL,
  getModelInstance,
  getModelReasoning,
  getTelegramModel,
  parseRequestDebugMode,
} from "../../../api/_utils/_aiModels.js";

describe("AI model registry", () => {
  test("defaults chat to gpt-6", () => {
    expect(DEFAULT_AI_MODEL).toBe("gpt-6");
    expect(DEFAULT_MODEL).toBe("gpt-6");
    expect(AI_MODELS["gpt-6"].provider).toBe("OpenAI");
  });

  test("maps product names to provider API ids", () => {
    expect(normalizeAiModelId("gpt-6-astra")).toBe("gpt-6");
    expect(normalizeAiModelId("gpt-6-luna")).toBe("gpt-6");
    expect(normalizeAiModelId("gpt-6-sol")).toBe("gpt-6.1-sol");
    expect(normalizeAiModelId("gpt-6.1-sol")).toBe("gpt-6.1-sol");
    expect(normalizeAiModelId("claude-opus-5-5")).toBe("opus-5.5");
    expect(normalizeAiModelId("claude-sonnet")).toBe("sonnet-4.6");
    expect(getModelInstance("gpt-6").modelId).toBe("gpt-6-luna");
    expect(getModelInstance("gpt-6.1-sol").modelId).toBe("gpt-6.1-sol");
    expect(getModelInstance("opus-5.5").modelId).toContain("opus");
  });

  test("lists opus-5.5 as a restricted Ryo-debug model", () => {
    expect(SUPPORTED_AI_MODELS).toContain("opus-5.5");
    expect(isRestrictedAiModel("opus-5.5")).toBe(true);
    expect(isRestrictedAiModel("gpt-6")).toBe(false);
  });

  test("does not throw on persisted or unknown model ids", () => {
    expect(isRestrictedAiModel("gpt-4o")).toBe(false);
    expect(canAccessAiModel("gpt-4o")).toBe(false);
    expect(canAccessAiModel(undefined)).toBe(false);
    expect(resolveClientAiModel("gpt-4o", { username: "ryo", debugMode: true })).toBeNull();
  });
});

describe("opus-5.5 access control", () => {
  test("allows only the ryo account in debug mode", () => {
    expect(
      canAccessAiModel("opus-5.5", { username: "ryo", debugMode: true })
    ).toBe(true);
    expect(
      canAccessAiModel("opus-5.5", { username: "Ryo", debugMode: true })
    ).toBe(true);
    expect(
      canAccessAiModel("opus-5.5", { username: "ryo", debugMode: false })
    ).toBe(false);
    expect(
      canAccessAiModel("opus-5.5", { username: "alice", debugMode: true })
    ).toBe(false);
    expect(canAccessAiModel("opus-5.5", { debugMode: true })).toBe(false);
    expect(canAccessAiModel("gpt-6", { username: "alice" })).toBe(true);
    expect(
      canAccessAiModel("gpt-6.1-sol", { username: "alice", debugMode: true })
    ).toBe(false);
    expect(canAccessAiModel("gpt-6.1-sol", { username: "ryo" })).toBe(true);
    expect(
      canAccessAiModel("sonnet-4.6", { username: "alice", debugMode: true })
    ).toBe(false);
  });

  test("shows the model picker only for ryo", () => {
    const ryoDebug = getSelectableAiModels({
      username: "ryo",
      debugMode: true,
    }).map((model) => model.id);
    expect(ryoDebug).toContain("opus-5.5");
    expect(ryoDebug).toContain("gpt-6");
    expect(ryoDebug).toContain("gpt-6.1-sol");

    const ryo = getSelectableAiModels({
      username: "ryo",
      debugMode: false,
    }).map((model) => model.id);
    expect(ryo).toContain("gpt-6.1-sol");
    expect(ryo).not.toContain("opus-5.5");

    expect(
      getSelectableAiModels({ username: "alice", debugMode: true })
    ).toEqual([]);
    expect(getSelectableAiModels({ debugMode: true })).toEqual([]);
  });

  test("rejects restricted requests on the server resolver", () => {
    expect(
      resolveRequestedAiModel("opus-5.5", { username: "ryo", debugMode: true })
    ).toEqual({ ok: true, model: "opus-5.5" });
    expect(
      resolveRequestedAiModel("claude-opus-5-5", {
        username: "ryo",
        debugMode: true,
      })
    ).toEqual({ ok: true, model: "opus-5.5" });
    expect(resolveRequestedAiModel("opus-5.5", { username: "ryo" })).toEqual({
      ok: false,
      error: "not_allowed",
      requested: "opus-5.5",
    });
    expect(
      resolveRequestedAiModel("opus-5.5", {
        username: "alice",
        debugMode: true,
      })
    ).toEqual({ ok: true, model: "gpt-6" });
    expect(
      resolveRequestedAiModel("gpt-6.1-sol", {
        username: "alice",
        debugMode: true,
      })
    ).toEqual({ ok: true, model: "gpt-6" });
    expect(
      resolveRequestedAiModel("sonnet-4.6", { username: "alice" })
    ).toEqual({ ok: true, model: "gpt-6" });
    expect(resolveRequestedAiModel("gpt-6.1-sol", { username: "ryo" })).toEqual({
      ok: true,
      model: "gpt-6.1-sol",
    });
    expect(resolveRequestedAiModel("gpt-6-luna", { username: "ryo" })).toEqual({
      ok: true,
      model: "gpt-6",
    });
    expect(resolveRequestedAiModel("not-a-model")).toEqual({
      ok: true,
      model: "gpt-6",
    });
    expect(resolveRequestedAiModel("not-a-model", { username: "ryo" })).toEqual({
      ok: false,
      error: "unsupported",
      requested: "not-a-model",
    });
    expect(resolveRequestedAiModel(null)).toEqual({
      ok: true,
      model: "gpt-6",
    });
  });

  test("client helper falls back to default when opus is not allowed", () => {
    expect(
      resolveClientAiModel("opus-5.5", { username: "ryo", debugMode: true })
    ).toBe("opus-5.5");
    expect(
      resolveClientAiModel("opus-5.5", { username: "ryo", debugMode: false })
    ).toBeNull();
    expect(resolveClientAiModel(null, { username: "ryo", debugMode: true })).toBeNull();
    expect(
      resolveClientAiModel("gpt-6.1-sol", { username: "alice", debugMode: true })
    ).toBeNull();
    expect(resolveClientAiModel("gpt-6.1-sol", { username: "ryo" })).toBe(
      "gpt-6.1-sol"
    );
  });
});

describe("request debug-mode parsing", () => {
  test("accepts dbg=1, debugMode query, or JSON body", () => {
    expect(
      parseRequestDebugMode({ url: "/api/chat?dbg=1" }, null)
    ).toBe(true);
    expect(
      parseRequestDebugMode({ url: "/api/chat?debugMode=true" }, null)
    ).toBe(true);
    expect(parseRequestDebugMode({ url: "/api/chat" }, { debugMode: true })).toBe(
      true
    );
    expect(parseRequestDebugMode({ url: "/api/chat" }, { debugMode: false })).toBe(
      false
    );
  });
});

describe("telegram model selection", () => {
  test("defaults to gpt-6 when TELEGRAM_BOT_MODEL is unset", () => {
    const logMessages: string[] = [];
    const model = getTelegramModel(
      (message) => logMessages.push(String(message)),
      {}
    );
    expect(model).toBe("gpt-6");
    expect(logMessages).toHaveLength(0);
  });

  test("rejects opus-5.5 even when configured", () => {
    const logMessages: string[] = [];
    const model = getTelegramModel(
      (message) => logMessages.push(String(message)),
      { TELEGRAM_BOT_MODEL: "opus-5.5" }
    );
    expect(model).toBe("gpt-6");
    expect(logMessages[0]).toContain("Restricted TELEGRAM_BOT_MODEL");
  });
});

describe("model picker wiring", () => {
  test("shows the control panels picker and chat model label only for ryo", () => {
    const accounts = readFileSync(
      new URL(
        "../../../src/apps/control-panels/components/control-panels-app/AccountsPaneContent.tsx",
        import.meta.url
      ),
      "utf8"
    );
    const pickerAt = accounts.indexOf('t("apps.control-panels.aiModel")');
    expect(pickerAt).toBeGreaterThan(0);
    expect(accounts.slice(Math.max(0, pickerAt - 180), pickerAt)).toContain(
      "isAdmin &&"
    );
    const chatInput = readFileSync(
      new URL(
        "../../../src/apps/chats/components/chat-input/useChatInput.ts",
        import.meta.url
      ),
      "utf8"
    );
    expect(chatInput).toContain("isRyoAdminUsername(username)");
  });
});

describe("model reasoning options", () => {
  test("uses none for gpt-6 luna and low for gpt-6.1-sol", () => {
    expect(getModelReasoning("gpt-6")).toBe("none");
    expect(getModelReasoning("gpt-6.1-sol")).toBe("low");
  });
});
