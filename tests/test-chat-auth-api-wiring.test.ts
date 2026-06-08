import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const storeSource = readFileSync("src/stores/useChatsStore.ts", "utf8");
const authApiSource = readFileSync("src/api/auth.ts", "utf8");

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

  test("keeps legacy token helpers outside the store", () => {
    expect(storeSource).toContain("@/utils/legacyAuthTokenMigration");
    expect(storeSource).not.toContain("LEGACY_AUTH_TOKEN_RECOVERY_KEY");
  });

  test("auth API exports session and password helpers", () => {
    for (const symbol of ["checkUserPassword", "getAuthSession", "logoutUserSafe"]) {
      expect(authApiSource).toContain(`function ${symbol}`);
    }
  });
});
