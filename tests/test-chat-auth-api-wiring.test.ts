import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import * as authApi from "../src/api/auth";

const storeSource = readFileSync("src/stores/useChatsStore.ts", "utf8");
const chatApiSource = readFileSync("api/chat.ts", "utf8");

describe("chat auth API wiring", () => {
  test("routes auth HTTP calls through src/api/auth", () => {
    expect(storeSource).toContain("from \"@/api/auth\"");
    for (const symbol of [
      "checkUserPassword",
      "getAuthSession",
      "logoutUserSafe",
      "registerUser",
      "setUserPassword",
    ]) {
      expect(storeSource).toContain(symbol);
    }

    expect(storeSource).not.toContain("/api/auth/password/check");
    expect(storeSource).not.toContain("/api/auth/password/set");
    expect(storeSource).not.toContain("/api/auth/logout");
    expect(storeSource).not.toContain("/api/auth/register");
    expect(storeSource).not.toContain("/api/auth/session");
  });

  test("keeps legacy token migration helpers out of the store", () => {
    expect(storeSource).not.toContain("@/utils/legacyAuthTokenMigration");
    expect(storeSource).not.toContain("LEGACY_AUTH_TOKEN_RECOVERY_KEY");
    expect(storeSource).not.toContain("legacyToken");
  });

  test("auth API exports session and password helpers", () => {
    for (const symbol of [
      "checkUserPassword",
      "getAuthSession",
      "logoutUserSafe",
    ] as const) {
      expect(typeof authApi[symbol]).toBe("function");
    }
  });

  test("does not log AI prompt or response content snippets", () => {
    expect(chatApiSource).not.toContain("contentStr.substring");
    expect(chatApiSource).not.toContain('finishReason=${finishReason}): "${greeting}"');
  });
});
